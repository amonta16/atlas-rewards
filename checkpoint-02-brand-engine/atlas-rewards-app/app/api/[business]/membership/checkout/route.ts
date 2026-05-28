import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

/**
 * POST /api/[business]/membership/checkout
 *
 * Creates a Stripe Checkout Session for a customer to subscribe to the
 * business's paid membership tier.
 *
 * Security:
 *  • Uses the Supabase service-role key (server-side only) to read
 *    business_membership_billing, which includes the Stripe secret key.
 *  • The Stripe key is NEVER sent to the browser — this route is the only
 *    path that touches it.
 *  • We embed the user_id in the Stripe session's client_reference_id and
 *    metadata so the webhook can upgrade the correct member after payment.
 *
 * Request body:
 *  { userId: string, membershipId: string | null, returnUrl: string }
 *
 * Response:
 *  { url: string }  — redirect the customer here to complete Stripe Checkout
 */

export async function POST(
  req: NextRequest,
  { params }: { params: { business: string } },
) {
  // ── parse body ────────────────────────────────────────────────────────────
  let body: { userId?: string; membershipId?: string | null; returnUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { userId, membershipId, returnUrl } = body;
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  const businessSlug = params.business;

  // ── service-role Supabase client (server-side only, never sent to browser) ──
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );

  // ── look up the business ──────────────────────────────────────────────────
  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, name")
    .eq("slug", businessSlug)
    .maybeSingle();

  if (bizErr || !biz) {
    return NextResponse.json({ error: "Business not found." }, { status: 404 });
  }

  // ── fetch billing config (stripe key lives here, staff-only RLS bypassed via service role) ──
  const { data: billing, error: billErr } = await admin
    .from("business_membership_billing")
    .select("is_enabled, price_cents, membership_name, stripe_secret_key")
    .eq("business_id", biz.id)
    .maybeSingle();

  if (billErr || !billing) {
    return NextResponse.json({ error: "Membership billing is not configured for this business." }, { status: 404 });
  }
  if (!billing.is_enabled) {
    return NextResponse.json({ error: "Membership subscriptions are not currently enabled." }, { status: 400 });
  }
  if (!billing.stripe_secret_key) {
    return NextResponse.json({ error: "Stripe is not connected for this business." }, { status: 400 });
  }

  // ── build return URLs ─────────────────────────────────────────────────────
  const base = returnUrl
    ? new URL(returnUrl).origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";

  const successUrl = `${base}/${businessSlug}/app?membership=success`;
  const cancelUrl  = returnUrl ?? `${base}/${businessSlug}/app`;

  // ── call Stripe REST API to create a Checkout Session ─────────────────────
  // We use fetch + URLSearchParams instead of the npm stripe package.
  const stripePayload = new URLSearchParams();
  stripePayload.set("mode", "subscription");
  stripePayload.set("line_items[0][price_data][currency]", "usd");
  stripePayload.set("line_items[0][price_data][unit_amount]", String(billing.price_cents));
  stripePayload.set("line_items[0][price_data][recurring][interval]", "month");
  stripePayload.set("line_items[0][price_data][product_data][name]",  billing.membership_name);
  stripePayload.set("line_items[0][price_data][product_data][description]",
    `Monthly membership at ${biz.name}`);
  stripePayload.set("line_items[0][quantity]", "1");
  stripePayload.set("client_reference_id", userId);
  stripePayload.set("metadata[business_id]",  biz.id);
  stripePayload.set("metadata[user_id]",       userId);
  stripePayload.set("metadata[business_slug]", businessSlug);
  if (membershipId) {
    stripePayload.set("metadata[membership_id]", membershipId);
  }
  stripePayload.set("success_url", successUrl);
  stripePayload.set("cancel_url",  cancelUrl);
  // Pre-fill customer email if we can fetch it (nice UX, not required).
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (email) stripePayload.set("customer_email", email);

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${billing.stripe_secret_key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stripePayload.toString(),
  });

  const stripeData = await stripeRes.json();

  if (!stripeRes.ok) {
    console.error("Stripe checkout error:", stripeData);
    return NextResponse.json(
      { error: stripeData?.error?.message ?? "Stripe error. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: stripeData.url });
}
