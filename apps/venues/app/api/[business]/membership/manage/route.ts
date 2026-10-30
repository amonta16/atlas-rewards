import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeAccountRow } from "@/lib/payments/accounts";
import { createPortalSession, setCancelAtPeriodEnd, StripeError, ts } from "@/lib/payments/stripe";
import { safeRedirect } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/[business]/membership/manage — CP-149
 *
 * The customer's own controls for a Stripe-billed membership:
 *   { action: "portal", returnUrl }  → Stripe Customer Portal URL (update card,
 *                                      see invoices, cancel) on the business's
 *                                      connected account.
 *   { action: "cancel" }             → cancel at period end (keeps access until then)
 *   { action: "resume" }             → undo a pending cancel
 *
 * Auth: the signed-in user must own the membership the subscription belongs
 * to. Nothing here takes a price or an id from the client that we don't
 * re-check against the DB.
 */
export async function POST(req: NextRequest, { params }: { params: { business: string } }) {
  let body: { action?: "portal" | "cancel" | "resume"; returnUrl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, slug").eq("slug", params.business).maybeSingle();
  if (!biz) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  // Newest live Stripe subscription row for THIS user at THIS business.
  const { data: sub } = await admin
    .from("membership_subscriptions")
    .select("id, provider_customer_id, provider_subscription_id, plan_kind, status, cancel_at_period_end, business_memberships!inner(user_id)")
    .eq("business_id", biz.id)
    .eq("provider", "stripe")
    .eq("business_memberships.user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "No card-billed membership found." }, { status: 404 });

  const acct = await getStripeAccountRow(biz.id);
  if (!acct?.provider_account_id) return NextResponse.json({ error: "This business isn't connected to Stripe." }, { status: 400 });
  const account = acct.provider_account_id;

  try {
    if (body.action === "portal") {
      if (!(sub as any).provider_customer_id) return NextResponse.json({ error: "No billing profile yet." }, { status: 400 });
      const origin = req.nextUrl.origin;
      const back = body.returnUrl && /^https?:\/\//.test(body.returnUrl) ? body.returnUrl : `${origin}${safeRedirect(body.returnUrl, `/${biz.slug}/app/membership`)}`;
      const portal = await createPortalSession(account, (sub as any).provider_customer_id, back);
      return NextResponse.json({ url: portal.url });
    }

    if (body.action === "cancel" || body.action === "resume") {
      const subId = (sub as any).provider_subscription_id as string | null;
      if (!subId || (sub as any).plan_kind !== "monthly") {
        return NextResponse.json({ error: "Only a monthly membership can be cancelled — a pass just expires." }, { status: 400 });
      }
      const updated = await setCancelAtPeriodEnd(account, subId, body.action === "cancel");
      // Mirror immediately (the webhook will confirm the same thing shortly).
      await admin.rpc("apply_membership_event", {
        p_provider: "stripe",
        p_event_id: `local_${updated.id}_${body.action}_${Date.now()}`,
        p_kind: "subscription_updated",
        p_business_id: biz.id,
        p_user_id: user.id,
        p_subscription_id: updated.id,
        p_period_end: ts(updated.current_period_end),
        p_cancel_at_period_end: updated.cancel_at_period_end,
        p_sub_status: updated.status,
      });
      return NextResponse.json({ ok: true, cancel_at_period_end: updated.cancel_at_period_end, current_period_end: ts(updated.current_period_end) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    const msg = e instanceof StripeError ? e.message : (e?.message ?? "Stripe error");
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
