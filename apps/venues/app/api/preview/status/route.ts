import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { finishWithFallbacks, isStale } from "@/lib/preview/build";
import { getPreviewBySlug, isExpired, medspaOrigin, previewUrl, progressOf, SLUG_RE } from "@/lib/preview/store";

/**
 * GET /api/preview/status?slug=pv-… — CP-232 · the progress screen polls this.
 * { status: "building" | "ready" | "expired", url, enriching }. The slug is a random id, not
 * personal data. A build stuck past STALE_BUILD_MS is finished with fallbacks
 * here, so the visitor never waits forever. `enriching`: the brand is live and the
 * treatments/photos are still coming (build phase 2). Also readable from the preview
 * page on the med spa origin (CORS), which uses it to refresh the app when they land.
 * Step 3 of the lead-magnet audit adds `zip` (from Google, to prefill the unlock gate) and
 * `unlocked` (the gate was already answered). Never the email. Step 4 adds `progress`
 * ({ verified, csv, installed }: the skip-ahead button needs all three) and `desk_seen`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next caches server fetch() GETs by default, and supabase-js reads with GET: without this,
// a preview read once as "building" would stay "building" (seen live on 2026-11-07).
export const fetchCache = "force-no-store";

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = medspaOrigin();
  return origin === allowed ? { "Access-Control-Allow-Origin": allowed, Vary: "Origin" } : { Vary: "Origin" };
}

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-status"), 240, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const h = cors(req);
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    let row = await getPreviewBySlug(slug);
    if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (isStale(row)) {
      await finishWithFallbacks(row.id, "timed out");
      row = (await getPreviewBySlug(slug)) ?? row;
    }
    const status = isExpired(row) ? "expired" : row.status === "claimed" ? "ready" : row.status;
    // CP-235: what the build found, for the scanning screen (all of it is shown on the public preview anyway).
    let found: Record<string, unknown> | null = null;
    if (status === "ready") {
      const ts = row.treatments ?? [];
      let site: string | null = null;
      try { site = row.website ? new URL(row.website).hostname.replace(/^www\./, "") : null; } catch { site = null; }
      found = {
        site,
        logo: row.logo_is_monogram ? null : row.logo_url,
        color: (row.colors as { primary?: string } | null)?.primary ?? null,
        treatments: row.treatments_are_examples ? 0 : ts.length,
        treatmentNames: row.treatments_are_examples ? [] : ts.slice(0, 4).map((t) => t.name),
        photos: ts.filter((t) => t.image_url).length + (row.hero_url ? 1 : 0),
        team: (row.team ?? []).length,
        font: row.font_family,
      };
    }
    const enriching = status === "ready" && !row.built_at && !isStale({ status: "building", updated_at: row.updated_at });
    return NextResponse.json({ status, url: previewUrl(row.slug), found, enriching, zip: row.area_zip ?? null, unlocked: !!row.contact_at, progress: progressOf(row), desk_seen: !!row.desk_first_at, bonus_deadline: row.area_open === false ? null : row.bonus_deadline_at ?? null }, { headers: { ...h, "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[preview] status failed", e);
    return NextResponse.json({ error: "Couldn't check right now." }, { status: 500 });
  }
}
