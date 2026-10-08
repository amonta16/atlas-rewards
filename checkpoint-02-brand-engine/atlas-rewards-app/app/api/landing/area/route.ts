import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { checkArea } from "@/lib/landing/territory";

/**
 * GET /api/landing/area?zip=93442 — CP-204 · step 1 of the /medspa quiz.
 * { ok, zip, city, state, open, radiusMiles, founding: { active, spotsLeft, ... } }
 * CP-205: also { held, heldUntil } when another practice has an active 48-hour hold.
 * Never says which practice holds a taken area. The lead route re-checks on submit.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, "area"), 30, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const sp = new URL(req.url).searchParams;
  const zip = sp.get("zip") ?? "";
  try {
    // CP-205: ?lead=<id> so a visitor's own 48-hour hold doesn't show their area as held
    const r = await checkArea(zip, { leadId: sp.get("lead") });
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[area] check failed", e);
    return NextResponse.json({ ok: false, error: "We couldn't check that right now. Please try again." }, { status: 500 });
  }
}
