import { NextResponse, type NextRequest } from "next/server";
import { getClinic } from "@/lib/clinic";

/**
 * Desk → Offers: a newly featured offer. The venue app holds the push keys, so
 * this hands the request over with the staff member's own session cookie; that
 * route checks staffs_business and the clinic's notification switch.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { offer_id?: string | null; title?: string; description?: string | null };
  const origin = process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app";
  try {
    const res = await fetch(`${origin}/api/notifications/announce-offer`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({ business_id: clinic.id, offer_id: body.offer_id ?? null, title: body.title, description: body.description ?? null }),
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 }); // the push is best-effort; the offer is already saved
  }
}
