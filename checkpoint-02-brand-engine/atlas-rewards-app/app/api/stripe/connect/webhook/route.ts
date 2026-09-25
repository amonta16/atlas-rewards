import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature, ts } from "@/lib/payments/stripe";
import { businessForStripeAccount, syncStripeAccount } from "@/lib/payments/accounts";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/connect/webhook — CP-149 · THE ONE webhook for every business
 *
 * Stripe dashboard (Atlas platform account) → Developers → Webhooks →
 *   Add endpoint → URL: https://www.atlas-engine.app/api/stripe/connect/webhook
 *   → "Listen to events on Connected accounts"  ← important
 *   → events:  checkout.session.completed
 *              invoice.paid
 *              invoice.payment_failed
 *              customer.subscription.updated
 *              customer.subscription.deleted
 *              account.updated
 *   → copy the signing secret into STRIPE_CONNECT_WEBHOOK_SECRET.
 *
 * Every event carries `event.account` (the connected acct_…), which maps to
 * a business via business_payment_accounts. The route verifies the
 * signature, normalises the object, and hands ONE call to the
 * apply_membership_event() state machine, which is idempotent on
 * (provider, event.id). Nothing here trusts the payload for money: prices
 * and plans were stamped into metadata by OUR checkout route.
 *
 * Returns 200 for anything we understood or chose to ignore (so Stripe
 * doesn't retry forever), 401 for a bad signature, 500 only on our own
 * failure (Stripe then retries with backoff — which is what we want).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "";
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const account: string | undefined = event.account;
  if (!account) return NextResponse.json({ ok: true, ignored: "platform event" });

  const admin = createAdminClient();
  const obj = event.data?.object ?? {};

  try {
    // Account flags (charges_enabled etc.) — keep our mirror current.
    if (event.type === "account.updated") {
      const businessId = await businessForStripeAccount(account) ?? obj?.metadata?.atlas_business_id ?? null;
      if (businessId) await syncStripeAccount(businessId, account, obj);
      return NextResponse.json({ ok: true });
    }

    const businessId = await businessForStripeAccount(account);
    if (!businessId) return NextResponse.json({ ok: true, ignored: "unknown account" });

    // Common metadata: our checkout stamps it on the session, the
    // subscription (subscription_data.metadata) and the payment intent.
    const md = obj.metadata ?? {};
    const base = {
      p_provider: "stripe",
      p_event_id: event.id as string,
      p_business_id: businessId,
      p_user_id: (md.atlas_user_id as string | undefined) ?? null,
      p_customer_id: typeof obj.customer === "string" ? obj.customer : obj.customer?.id ?? null,
    };

    let args: Record<string, unknown> | null = null;

    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.payment_status !== "paid" && obj.status !== "complete") break;
        const kind = (md.atlas_plan_kind as string) === "pass" ? "pass" : (obj.mode === "subscription" ? "monthly" : "pass");
        args = {
          ...base,
          p_kind: "checkout_completed",
          p_subscription_id: typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id ?? null,
          p_checkout_id: obj.id,
          p_plan_kind: kind,
          p_plan_label: md.atlas_plan_label ?? (kind === "monthly" ? "Monthly" : null),
          p_pass_months: md.atlas_pass_months ? parseInt(md.atlas_pass_months, 10) : null,
          p_price_cents: md.atlas_price_cents ? parseInt(md.atlas_price_cents, 10) : (obj.amount_total ?? null),
          p_sub_status: kind === "monthly" ? "active" : "active",
          p_payment_amount: obj.amount_total ?? null,
          p_payment_id: kind === "pass" ? (typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id ?? null) : null,
        };
        break;
      }
      case "invoice.paid": {
        const subId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id ?? null;
        if (!subId) break;
        const line = obj.lines?.data?.[0];
        args = {
          ...base,
          p_user_id: (obj.subscription_details?.metadata?.atlas_user_id as string | undefined) ?? base.p_user_id,
          p_kind: "invoice_paid",
          p_subscription_id: subId,
          p_period_start: ts(line?.period?.start),
          p_period_end: ts(line?.period?.end),
          p_sub_status: "active",
          p_payment_amount: obj.amount_paid ?? null,
          p_payment_id: obj.id,
          p_receipt_url: obj.hosted_invoice_url ?? null,
        };
        break;
      }
      case "invoice.payment_failed": {
        const subId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id ?? null;
        if (!subId) break;
        args = {
          ...base,
          p_user_id: (obj.subscription_details?.metadata?.atlas_user_id as string | undefined) ?? base.p_user_id,
          p_kind: "invoice_failed",
          p_subscription_id: subId,
          p_sub_status: "past_due",
          p_payment_amount: obj.amount_due ?? null,
          p_payment_id: obj.id,
          p_failure_reason: obj.last_finalization_error?.message ?? "payment failed",
        };
        break;
      }
      case "customer.subscription.updated": {
        args = {
          ...base,
          p_kind: "subscription_updated",
          p_subscription_id: obj.id,
          p_period_start: ts(obj.current_period_start),
          p_period_end: ts(obj.current_period_end),
          p_cancel_at_period_end: !!obj.cancel_at_period_end,
          p_sub_status: obj.status,
        };
        break;
      }
      case "customer.subscription.deleted": {
        args = {
          ...base,
          p_kind: "subscription_deleted",
          p_subscription_id: obj.id,
          p_period_end: ts(obj.current_period_end),
          p_sub_status: "canceled",
        };
        break;
      }
      default:
        break;
    }

    if (!args) return NextResponse.json({ ok: true, ignored: event.type });

    const { data, error } = await admin.rpc("apply_membership_event", args);
    if (error) {
      console.error("apply_membership_event failed:", error.message, event.type, event.id);
      return NextResponse.json({ error: "state machine failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, outcome: data });
  } catch (e: any) {
    console.error("connect webhook error:", e?.message, event?.type, event?.id);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }
}
