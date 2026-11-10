import { NextResponse } from "next/server";
import { clean, hashIp } from "@/lib/landing/notify";
import { previewDb } from "@/lib/preview/store";

/**
 * POST /api/landing/visit — CP-238 · one landing-page visit, for Admin → Lead funnel.
 * Body { path, vid, utm_source?, utm_campaign?, utm_content?, ref? }. Sent once per
 * browser tab session by <VisitBeacon>. Anonymous: a random visitor id from the
 * browser, a hashed IP, no names. Bots and unknown paths are dropped quietly.
 * Never fails the page: errors (e.g. CP-238 SQL not applied yet) return 204.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATHS = ["/medspa/app", "/medspa", "/med-spas"];
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse/i;

export async function POST(req: Request) {
  if (BOT.test(req.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const path = clean(b.path, 120);
  const vid = clean(b.vid, 64);
  if (!PATHS.includes(path) || !/^[A-Za-z0-9_-]{8,64}$/.test(vid)) return new NextResponse(null, { status: 204 });
  let referrer_host: string | null = null;
  try { const r = clean(b.ref, 300); if (r) referrer_host = new URL(r).hostname.slice(0, 120); } catch { /* not a URL */ }
  try {
    await previewDb().from("funnel_visits").insert({
      path, visitor_id: vid,
      utm_source: clean(b.utm_source, 80) || null,
      utm_campaign: clean(b.utm_campaign, 120) || null,
      utm_content: clean(b.utm_content, 120) || null,
      referrer_host,
      ip_hash: await hashIp(req),
    });
  } catch (e) { console.error("[visit] insert failed", e); }
  return new NextResponse(null, { status: 204 });
}
