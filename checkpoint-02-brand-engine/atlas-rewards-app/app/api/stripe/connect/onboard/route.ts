import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStandardAccount, createAccountLink, StripeError } from "@/lib/payments/stripe";
import { getStripeAccountRow, syncStripeAccount } from "@/lib/payments/accounts";
import { safeRedirect } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/connect/onboard — CP-149
 *
 * Manager / agency admin taps "Connect Stripe". We create (or reuse) the
 * business's Standard connected account and hand back Stripe's hosted
 * onboarding URL. Stripe collects business details, identity and bank
 * account — Atlas never sees any of it. When the owner finishes, Stripe
 * sends them to /api/stripe/connect/return, which syncs the flags.
 *
 * Body: { business_id: string; return_to?: string }   (return_to = in-app path)
 * Resp: { url: string }
 */
export async function POST(req: NextRequest) {
  let body: { business_id?: string; return_to?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }
  const businessId = body.business_id;
  if (!businessId) return NextResponse.json({ error: "business_id is required." }, { status: 400 });

  // Caller must manage this business (manager or agency admin).
  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: manages } = await supabase.rpc("manages_business", { p_business_id: businessId });
  if (!manages) return NextResponse.json({ error: "Only a manager can connect payments." }, { status: 403 });

  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id, name, slug").eq("id", businessId).maybeSingle();
  if (!biz) return NextResponse.json({ error: "Business not found." }, { status: 404 });

  try {
    let accountId = (await getStripeAccountRow(businessId))?.provider_account_id ?? null;
    if (!accountId) {
      const acct = await createStandardAccount(businessId, biz.name, user.email);
      await syncStripeAccount(businessId, acct.id, acct);
      accountId = acct.id;
    }

    const origin = req.nextUrl.origin;
    const to = safeRedirect(body.return_to ?? "", `/${biz.slug}/manage`);
    const returnUrl  = `${origin}/api/stripe/connect/return?business=${businessId}&to=${encodeURIComponent(to)}`;
    const refreshUrl = `${origin}/api/stripe/connect/return?business=${businessId}&to=${encodeURIComponent(to)}&refresh=1`;
    const link = await createAccountLink(accountId, returnUrl, refreshUrl);
    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    const msg = e instanceof StripeError ? e.message : (e?.message ?? "Stripe error");
    // Most common first-run failure: Connect not enabled on the platform account yet.
    const hint = /connect/i.test(msg) && /not (yet )?(enabled|activated|signed)/i.test(msg)
      ? " — enable Connect in the Atlas Stripe dashboard (Settings → Connect) first."
      : "";
    return NextResponse.json({ error: msg + hint }, { status: 502 });
  }
}
