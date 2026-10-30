import { NextResponse } from "next/server";

/**
 * POST /api/perf/launch — CP-211 · cold-start samples from LaunchTimer.
 * Logs one line per sample to the Vercel logs (search "[launch-client]").
 * No database, no auth: numbers only, clamped, nothing personal.
 */
export const runtime = "nodejs";

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(60_000, Math.round(v))) : null);

export async function POST(req: Request) {
  try {
    const b = JSON.parse((await req.text()).slice(0, 2000));
    const slug = typeof b.slug === "string" ? b.slug.slice(0, 80).replace(/[^a-z0-9-]/gi, "") : "?";
    console.info(`[launch-client] ${slug} interactive=${n(b.interactive)} ttfb=${n(b.ttfb)} html=${n(b.html)} hydrated=${n(b.hydrated)} splash=${n(b.splash)} cached=${n(b.cached)}`);
  } catch { /* malformed sample — ignore */ }
  return new NextResponse(null, { status: 204 });
}
