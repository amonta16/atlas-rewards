import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe events for Atlas's *agency* billing — i.e. the monthly
 * subscriptions Atlas charges its sub-account businesses. Updates the local
 * agency_billing_* tables so the MRR dashboard, payment history, and manager-
 * side billing page stay accurate.
 *
 * Configure on Stripe side:
 *   • Endpoint URL: https://<domain>/api/stripe/webhook
 *   • Listen for: invoice.paid, invoice.payment_failed,
 *                 customer.subscription.created/updated/deleted,
 *                 checkout.session.completed
 *   • Set STRIPE_WEBHOOK_SECRET env var to the signing secret Stripe gives you.
 *
 * Business mapping:
 *   We expect the Stripe Customer's `metadata.atlas_business_id` to be set
 *   when we create the customer (done from the agency UI when configuring a
 *   plan). That's how we resolve which business a webhook applies to.
 */

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

function verifyStripeSignature(rawBody: string, sigHeader: string | null): boolean {
  if (!sigHeader || !STRIPE_WEBHOOK_SECRET) return false;
  // Stripe-Signature header format: t=<timestamp>,v1=<signature>
  const parts = Object.fromEntries(
    sigHeader.split(",").map(p => p.split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const sig = parts.v1;
  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature");

  if (!verifyStripeSignature(rawBody, sigHeader)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  /** Resolve the business by Stripe customer metadata. */
  async function resolveBusinessId(stripeCustomerId: string | null | undefined): Promise<string | null> {
    if (!stripeCustomerId) return null;
    const { data } = await admin
      .from("agency_billing_subscriptions")
      .select("business_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    return data?.business_id ?? null;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const businessId =
          sub.metadata?.atlas_business_id ?? (await resolveBusinessId(sub.customer));
        if (!businessId) break;

        const monthlyCents =
          sub.items?.data?.[0]?.price?.unit_amount ?? sub.plan?.amount ?? 0;
        const status = mapSubscriptionStatus(sub.status);

        // upsert by stripe_subscription_id
        await admin.from("agency_billing_subscriptions").upsert(
          {
            business_id: businessId,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            plan_name: sub.items?.data?.[0]?.price?.nickname ?? "Stripe plan",
            monthly_cents: monthlyCents,
            status,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          },
          { onConflict: "stripe_subscription_id" },
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await admin
          .from("agency_billing_subscriptions")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object;
        const businessId =
          inv.metadata?.atlas_business_id ?? (await resolveBusinessId(inv.customer));
        if (!businessId) break;

        const isSetup = inv.billing_reason === "manual" ||
                        inv.lines?.data?.some((l: any) => l.metadata?.atlas_type === "setup");
        await admin.from("agency_billing_payments").upsert(
          {
            business_id: businessId,
            stripe_invoice_id: inv.id,
            stripe_charge_id: inv.charge ?? null,
            amount_cents: inv.amount_paid ?? 0,
            type: isSetup ? "setup" : (inv.subscription ? "subscription" : "onetime"),
            status: "paid",
            description: inv.description ?? inv.lines?.data?.[0]?.description ?? null,
            paid_at: new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000).toISOString(),
          },
          { onConflict: "stripe_invoice_id" },
        );

        // If this paid a setup fee, mark it.
        if (isSetup) {
          await admin
            .from("agency_billing_setup_fees")
            .update({ status: "paid", paid_at: new Date().toISOString(), stripe_invoice_id: inv.id })
            .eq("business_id", businessId)
            .eq("status", "invoiced");
        }
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object;
        const businessId =
          inv.metadata?.atlas_business_id ?? (await resolveBusinessId(inv.customer));
        if (!businessId) break;
        await admin.from("agency_billing_payments").upsert(
          {
            business_id: businessId,
            stripe_invoice_id: inv.id,
            amount_cents: inv.amount_due ?? 0,
            type: inv.subscription ? "subscription" : "onetime",
            status: "failed",
            description: inv.description ?? "Payment failed",
          },
          { onConflict: "stripe_invoice_id" },
        );
        break;
      }

      default:
        // Ignore the events we don't care about.
        break;
    }
  } catch (e: any) {
    console.error("stripe webhook error:", e?.message);
    // Still return 200 — Stripe will retry on 5xx.
  }

  return NextResponse.json({ ok: true });
}

function mapSubscriptionStatus(s: string): string {
  switch (s) {
    case "trialing":        return "trialing";
    case "active":          return "active";
    case "past_due":        return "past_due";
    case "paused":          return "paused";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":          return "canceled";
    default:                return "trialing";
  }
}
