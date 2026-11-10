import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { CLIENT_EVENTS, recordEvent, type PreviewEvent } from "@/lib/preview/events";
import { getPreviewBySlug, medspaOrigin, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/event — lead-magnet audit, step 7 · events only the browser can see.
 * Body { slug, event } with event one of app_rendered, notif_previewed, vsl_played → 204.
 * Everything else is recorded on the server where it happens (start, brand, unlock, progress,
 * the walkthrough link). CORS: the med spa origin only. Rate limited; never errors to the page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = medspaOrigin();
  return origin === allowed
    ? { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const h = cors(req);
  const done = () => new Response(null, { status: 204, headers: h });
  const rl = await rateLimit(clientKey(req, "pv-event"), 60, 600);
  if (!rl.ok) return done();
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: h }); }
  const slug = typeof b.slug === "string" ? b.slug.toLowerCase() : "";
  const event = CLIENT_EVENTS.find((e) => e === b.event) as PreviewEvent | undefined;
  if (!SLUG_RE.test(slug) || !event) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: h });
  const row = await getPreviewBySlug(slug).catch(() => null);
  if (row) await recordEvent(row.id, event);
  return done();
}
