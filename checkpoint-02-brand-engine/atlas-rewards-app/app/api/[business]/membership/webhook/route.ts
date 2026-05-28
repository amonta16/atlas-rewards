import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/[business]/membership/webhook
 *
 * Stripe webhook endpoint for per-business membership payments.
 *
 * Setup (done in Stripe dashboard for the business owner's account):
 *  1. Go to dashboard.stripe.com → Developers → Webhooks → Add endpoint
 *  2. URL: https://<yourdomain>/api/<business-slug>/membership/webhook
 *  3. Events to listen for:
 *       checkout.session.completed
 *       customer.subscription.deleted   (optional — for future cancel handling)
 *  4. Copy the webhook signing secret (whsec_...) into the manager's
 *     Membership Billing setup panel. It is stored in
 *     business_membership_billing.stripe_webhook_secret (staff-only RLS).
 *
 * On checkout.session.completed:
 *  • Upgrades the customer's membership tier to the paid tier name stored in
 *    business_membership_billing.membership_name via upgrade_to_member().
 *
 * Security:
 *  • The webhook secret is read server-side via the service-role key — never
 *    exposed to the browser.
 *  • HMAC-SHA256 signature verification happens before any DB write.
 *  • All errors return 200 to prevent Stripe from retrying unnecessarily
 *    (except signature failures which return 401).
 */

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!sigHeader || !secret) return false;

  // Stripe-Signature: t=<timestamp>,v1=<hex>
  const parts = Object.fromEntries(
    sigHeader.split(",").map(p => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );
  const timestamp = parts.t;
  const sig       = parts.v1;
  if (!timestamp || !sig) return false;

  // Reject stale webhooks (> 5 minutes old)
  const age = Date.now() / 1000 - parseInt(timestamp, 10);
  if (age > 300) return false;

  const signed   = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig,      "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { business: string } },
) {
  const rawBody   = await req.text();
  const sigHeader = req.headers.get("stripe-signature");
  const slug      = params.business;

  // ── service-role client ──────────────────────────────────────────────────
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );

  // ── look up the business + webhook secret ─────────────────────────────────
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!biz) {
    // Unknown business — still 200 so Stripe doesn't keep retrying
    return NextResponse.json({ ok: false, reason: "unknown business" });
  }

  const { data: billing } = await admin
    .from("business_membership_billing")
    .select("stripe_webhook_secret, membership_name")
    .eq("business_id", biz.id)
    .maybeSingle();

  if (!billing?.stripe_webhook_secret) {
    // No webhook secret stored — can't verify, abort
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 401 });
  }

  // ── HMAC verification ────────────────────────────────────────────────────
  const valid = await verifyStripeSignature(rawBody, sigHeader, billing.stripe_webhook_secret);
  if (!valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // ── parse event ───────────────────────────────────────────────────────────
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // Only handle subscription checkouts
        if (session.mode !== "subscription") break;
        if (session.payment_status !== "paid" && session.status !== "complete") break;

        const userId    = session.metadata?.user_id    ?? session.client_reference_id;
        const businessId = session.metadata?.business_id ?? biz.id;

        if (!userId) {
          console.warn("membership webhook: no user_id in session metadata", session.id);
          break;
        }

        // Upgrade the member's tier to the paid membership name
        const tierName = billing.membership_name ?? "Member";
        const { error } = await admin.rpc("upgrade_to_member", {
          p_business_id: businessId,
          p_user_id:     userId,
          p_tier_name:   tierName,
        });

        if (error) {
          console.error("upgrade_to_member failed:", error.message);
        } else {
          console.log(`membership: upgraded user ${userId} to "${tierName}" in business ${businessId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Future: downgrade tier back to free when subscription cancels.
        // For now just log it.
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;
        if (userId) {
          console.log(`membership: subscription cancelled for user ${userId} in business ${biz.id}`);
          // Optionally: await admin.rpc("downgrade_to_free", { ... });
        }
        break;
      }

      default:
        // Unhandled event type — ignore silently
        break;
    }
  } catch (e: any) {
    console.error("membership webhook handler error:", e?.message);
    // Return 200 so Stripe doesn't retry endlessly
  }

  return NextResponse.json({ ok: true });
}
