import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCachedUser } from "@atlas/core/supabase/server";
import { createAdminClient } from "@atlas/core/supabase/admin";
import { createCheckoutSession, StripeError } from "@atlas/core/payments/stripe";
import { getClinic } from "@/lib/clinic";
import { DEMO_COOKIE, getPatient } from "@/lib/patient";
import { clinicStripeAccount } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/<clinic>/checkout  { planId }
 *
 * Starts Stripe Checkout for a membership plan on the CLINIC's connected
 * Stripe account, so the patient pays the clinic directly.
 *
 * Nothing about money comes from the browser: the signed-in user comes from
 * the session cookie, and the plan and its price are re-read from the
 * clinic's config here. The metadata matches the venue app's checkout, so
 * the shared Connect webhook marks the member paid and stores the plan name.
 *
 * Responses: { url } → redirect there · 409 { fallback: true } → this clinic
 * hasn't connected Stripe yet (the app shows book/text/call instead).
 */
export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const body = (await req.json().catch(() => ({}))) as { planId?: string };
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const plan = clinic.plans.find((p) => p.id === body.planId);
  if (!plan || plan.price_cents <= 0) return NextResponse.json({ error: "That plan isn't available." }, { status: 404 });

  const origin = req.nextUrl.origin;
  const base = `${origin}/${clinic.slug}`;

  // Example clinic: no Stripe. Mark the demo patient as a member and act as if checkout succeeded.
  if (clinic.isExample && clinic.id === "example") {
    const raw = cookies().get(DEMO_COOKIE)?.value;
    if (!raw) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    let d: Record<string, unknown> = {};
    try { d = JSON.parse(decodeURIComponent(raw)); } catch { /* start fresh */ }
    const res = NextResponse.json({ url: `${base}/profile?membership=success&demo=1` });
    res.cookies.set(DEMO_COOKIE, encodeURIComponent(JSON.stringify({ ...d, plan: plan.name })), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
    return res;
  }

  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const account = await clinicStripeAccount(clinic);
  if (!account) return NextResponse.json({ fallback: true }, { status: 409 });

  const patient = await getPatient(clinic);
  if (patient.isMember) return NextResponse.json({ error: "You're already a member. Manage it from your Profile." }, { status: 409 });

  const admin = createAdminClient();
  // Reuse the Stripe customer this patient already has at this clinic, so renewals and receipts line up.
  const { data: prev } = await admin
    .from("membership_subscriptions")
    .select("provider_customer_id, business_memberships!inner(user_id)")
    .eq("business_id", clinic.id).eq("provider", "stripe")
    .eq("business_memberships.user_id", user.id)
    .not("provider_customer_id", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  try {
    const session = await createCheckoutSession({
      account,
      businessId: clinic.id,
      businessSlug: clinic.slug,
      businessName: clinic.name,
      userId: user.id,
      membershipId: patient.membershipId,
      customerEmail: user.email ?? null,
      customerId: (prev as { provider_customer_id?: string } | null)?.provider_customer_id ?? null,
      productName: `${plan.name} membership`,
      description: plan.commitment_months > 0
        ? `Monthly membership at ${clinic.name} · ${plan.commitment_months}-month minimum`
        : `Monthly membership at ${clinic.name}`,
      priceCents: plan.price_cents,
      kind: "monthly",
      planLabel: plan.name,
      extraMetadata: { atlas_plan_id: plan.id, atlas_app: "medspa" },
      successUrl: `${base}/profile?membership=success`,
      cancelUrl: `${base}/shop/membership/${encodeURIComponent(plan.id)}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof StripeError ? e.message : (e as Error)?.message ?? "Stripe error";
    console.error("medspa checkout error:", msg);
    return NextResponse.json({ error: "Checkout couldn't start. Please try again, or contact the clinic." }, { status: 502 });
  }
}
