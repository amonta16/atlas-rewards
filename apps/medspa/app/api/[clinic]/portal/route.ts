import { NextResponse, type NextRequest } from "next/server";
import { getCachedUser } from "@atlas/core/supabase/server";
import { createAdminClient } from "@atlas/core/supabase/admin";
import { createPortalSession } from "@atlas/core/payments/stripe";
import { getClinic } from "@/lib/clinic";
import { clinicStripeAccount } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/<clinic>/portal → { url }
 * Stripe's billing portal on the clinic's account: update card, see
 * receipts, cancel. Only for the signed-in patient's own subscription.
 */
export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const account = await clinicStripeAccount(clinic);
  if (!account) return NextResponse.json({ fallback: true }, { status: 409 });

  const { data: sub } = await createAdminClient()
    .from("membership_subscriptions")
    .select("provider_customer_id, business_memberships!inner(user_id)")
    .eq("business_id", clinic.id).eq("provider", "stripe")
    .eq("business_memberships.user_id", user.id)
    .not("provider_customer_id", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const customer = (sub as { provider_customer_id?: string } | null)?.provider_customer_id;
  if (!customer) return NextResponse.json({ fallback: true }, { status: 409 });

  try {
    const s = await createPortalSession(account, customer, `${req.nextUrl.origin}/${clinic.slug}/profile`);
    return NextResponse.json({ url: s.url });
  } catch (e) {
    console.error("medspa portal error:", (e as Error)?.message);
    return NextResponse.json({ fallback: true }, { status: 409 });
  }
}
