import { NextResponse, type NextRequest } from "next/server";
import { getClinic } from "@/lib/clinic";

/**
 * Desk → Insights → Monthly reports → Send test. The venue app holds the email
 * keys and the report email template, so this hands the request over with the
 * manager's own session cookie; that route checks the role and who may receive it.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { month?: string | null; to?: string | null };
  const origin = process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app";
  try {
    const res = await fetch(`${origin}/api/reports/test`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: JSON.stringify({ businessId: clinic.id, month: body.month ?? null, to: body.to ?? null }),
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Couldn't send the test. Please try again." }, { status: 502 });
  }
}
