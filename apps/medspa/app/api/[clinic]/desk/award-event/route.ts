import { NextResponse, type NextRequest } from "next/server";

/**
 * Hands a desk award to the venue app's /api/notifications/award-event, which
 * sends the "reward unlocked" push (it holds the push keys; this app only has
 * the public key). The staff member's own session cookie is forwarded, so the
 * venue route runs its usual staffs_business check.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const origin = process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app";
  try {
    const res = await fetch(`${origin}/api/notifications/award-event`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: req.headers.get("cookie") ?? "" },
      body: await req.text(),
      cache: "no-store",
    });
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 }); // push is best-effort; the points are already saved
  }
}
