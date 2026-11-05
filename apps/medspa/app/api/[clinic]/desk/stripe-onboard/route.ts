import { NextResponse, type NextRequest } from "next/server";
import { getClinic } from "@/lib/clinic";

/**
 * Desk → Payouts → Connect Stripe. Stripe Connect onboarding lives in the venue
 * app (it holds the platform flow and the webhook), so this hands the request
 * over with the manager's own session cookie; that route runs its usual
 * manages_business check. Stripe returns them to /<slug>/manage, which sends
 * med spas back to this desk.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const origin = process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app";
  try {
    const res = await fetch(`${origin}/api/stripe/connect/onboard`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({ business_id: clinic.id, return_to: `/${clinic.slug}/manage?view=payouts` }),
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Stripe. Please try again." }, { status: 502 });
  }
}
