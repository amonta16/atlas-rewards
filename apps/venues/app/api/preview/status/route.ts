import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { finishWithFallbacks, isStale } from "@/lib/preview/build";
import { getPreviewBySlug, isExpired, previewUrl, SLUG_RE } from "@/lib/preview/store";

/**
 * GET /api/preview/status?slug=pv-… — CP-232 · the progress screen polls this.
 * { status: "building" | "ready" | "expired", url }. The slug is a random id, not
 * personal data. A build stuck past STALE_BUILD_MS is finished with fallbacks
 * here, so the visitor never waits forever.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next caches server fetch() GETs by default, and supabase-js reads with GET: without this,
// a preview read once as "building" would stay "building" (seen live on 2026-11-07).
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-status"), 240, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
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
    return NextResponse.json({ status, url: previewUrl(row.slug), found }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[preview] status failed", e);
    return NextResponse.json({ error: "Couldn't check right now." }, { status: 500 });
  }
}
