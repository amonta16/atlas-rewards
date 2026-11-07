import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { autocomplete, placesConfigured, SESSION_RE } from "@/lib/preview/places";

/**
 * POST /api/preview/places/autocomplete — CP-232 · step 1 of /medspa/app.
 * Body { input, session } → { suggestions: [{ placeId, main, secondary }] }.
 * A proxy so GOOGLE_PLACES_API_KEY never reaches the browser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next caches server fetch() GETs by default, and supabase-js reads with GET: without this,
// a preview read once as "building" would stay "building" (seen live on 2026-11-07).
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-ac"), 90, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!placesConfigured()) return NextResponse.json({ error: "Search isn't available right now." }, { status: 503 });

  let b: { input?: unknown; session?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const input = typeof b.input === "string" ? b.input.trim().slice(0, 120) : "";
  const session = typeof b.session === "string" && SESSION_RE.test(b.session) ? b.session : "";
  if (input.length < 2 || !session) return NextResponse.json({ suggestions: [] });

  try {
    const suggestions = await autocomplete(input, session);
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[preview] autocomplete failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Search is having trouble. Please try again." }, { status: 502 });
  }
}
