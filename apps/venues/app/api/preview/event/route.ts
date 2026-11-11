import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { CLIENT_EVENTS, recordEvent, type PreviewEvent } from "@/lib/preview/events";
import { getPreviewBySlug, medspaOrigin, previewDb, SLUG_RE } from "@/lib/preview/store";
import { LAUNCH_BONUS } from "@/lib/landing/medspa-funnel";

/**
 * POST /api/preview/event — lead-magnet audit, step 7 · events only the browser can see.
 * Body { slug, event } with event one of app_rendered, notif_previewed, vsl_played → 204.
 * CP-245: app_rendered also starts the 4-hour launch-bonus clock (once per preview) and answers
 * 200 { bonus_deadline } so the page can show the countdown (null: no bonus, e.g. a taken area).
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
  if (row && event === "app_rendered") {
    const r = row as typeof row & { bonus_deadline_at?: string | null };
    let deadline: string | null = r.bonus_deadline_at ?? null;
    if (LAUNCH_BONUS.active && row.area_open !== false && !deadline && "bonus_deadline_at" in r) {
      const at = new Date(Date.now() + LAUNCH_BONUS.hours * 3_600_000).toISOString();
      const { data } = await previewDb().from("app_previews").update({ bonus_deadline_at: at }).eq("id", row.id).is("bonus_deadline_at", null).select("bonus_deadline_at");
      deadline = (data?.[0] as { bonus_deadline_at?: string } | undefined)?.bonus_deadline_at
        ?? ((await getPreviewBySlug(slug).catch(() => null)) as { bonus_deadline_at?: string | null } | null)?.bonus_deadline_at ?? null;
    }
    const show = LAUNCH_BONUS.active && row.area_open !== false ? deadline : null;
    return NextResponse.json({ bonus_deadline: show }, { headers: { ...h, "Cache-Control": "no-store" } });
  }
  return done();
}
