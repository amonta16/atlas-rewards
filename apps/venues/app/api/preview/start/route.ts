import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/preview/events";
import { waitUntil } from "@vercel/functions";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { clean } from "@/lib/landing/notify";
import { requestIp } from "@/lib/landing/meta-capi";
import { checkAreaAt } from "@/lib/landing/territory";
import { placeDetails, placesConfigured, PLACE_ID_RE, SESSION_RE } from "@/lib/preview/places";
import { buildPreview } from "@/lib/preview/build";
import { postGhlLead } from "@/lib/preview/ghl";
import { expiresAt, getPreviewByPlace, hashIpString, isExpired, newPreviewSlug, previewDb, previewUrl, type PreviewRow } from "@/lib/preview/store";

/**
 * POST /api/preview/start — CP-232 · the visitor picked their spa; build its preview.
 *
 * Body { place_id, session, utm_*, fbclid, fbp, fbc, hp } →
 *   { slug, status, url, event_id, area_open }
 *
 * · Same spa, same preview: a live row for this place_id is returned as is (no rebuild).
 *   An expired or failed one is rebuilt in place.
 * · Rate limits: 5 starts per IP per 10 min; 3 builds per place per hour.
 * · The build runs after the response (waitUntil), so the visitor polls
 *   /api/preview/status. It always ends "ready" (with fallbacks if needed).
 * · Side effects for a new preview: GHL inbound webhook (if configured). The Meta
 *   "Lead" fires later, when the owner leaves their contact (/api/preview/contact).
 * · Personal data stays in the POST body; nothing goes in a query string.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next caches server fetch() GETs by default, and supabase-js reads with GET: without this,
// a preview read once as "building" would stay "building" (seen live on 2026-11-07).
export const fetchCache = "force-no-store";
export const maxDuration = 300; // CP-233: the deep build runs in waitUntil, inside this limit

const err = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-start"), 5, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!placesConfigured()) return err(503, "Instant previews are paused right now. Please try again later.");

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return err(400, "Invalid request."); }
  if (b.hp) return err(400, "Invalid request."); // honeypot

  const placeId = typeof b.place_id === "string" && PLACE_ID_RE.test(b.place_id) ? b.place_id : null;
  if (!placeId) return err(400, "Please pick your spa from the list.");
  const session = typeof b.session === "string" && SESSION_RE.test(b.session) ? b.session : null;

  const attribution = {
    utm_source: clean(b.utm_source, 80) || null,
    utm_medium: clean(b.utm_medium, 80) || null,
    utm_campaign: clean(b.utm_campaign, 120) || null,
    utm_content: clean(b.utm_content, 120) || null,
    utm_term: clean(b.utm_term, 120) || null,
    fbclid: clean(b.fbclid, 300) || null,
    fbp: clean(b.fbp, 120) || null,
    fbc: clean(b.fbc, 300) || null,
  };
  const ip = requestIp(req);

  const db = previewDb();
  let cached: PreviewRow | null = null;
  try { cached = await getPreviewByPlace(placeId); } catch (e) { console.error("[preview] cache lookup failed", e); }

  // Cache hit: same spa, same preview.
  if (cached && !isExpired(cached) && cached.status !== "failed") {
    waitUntil(recordEvent(cached.id, "build_started", { cached: true }));
    return NextResponse.json({ slug: cached.slug, status: cached.status, url: previewUrl(cached.slug), area_open: cached.area_open, cached: true }, { headers: { "Cache-Control": "no-store" } });
  }

  // A (re)build from here on: limit per place too.
  const pl = await rateLimit(`pv-place:${placeId}`, 3, 3600);
  if (!pl.ok) return tooMany(pl.retryAfter);

  let details: Awaited<ReturnType<typeof placeDetails>>;
  try { details = await placeDetails(placeId, session); } catch (e) {
    console.error("[preview] place details failed", e instanceof Error ? e.message : e);
    return err(502, "We couldn't reach Google just now. Please try again in a moment.");
  }
  if (!details || !details.name) return err(404, "We couldn't find that business. Please pick it from the list again.");

  let areaOpen: boolean | null = null;
  if (details.lat != null && details.lng != null) {
    try {
      const a = await checkAreaAt({ lat: details.lat, lng: details.lng, zip: details.zip });
      areaOpen = a.ok ? a.open : null;
    } catch (e) { console.error("[preview] area check failed", e); }
  }

  const base = {
    business_name: details.name,
    address: details.address,
    lat: details.lat,
    lng: details.lng,
    phone: details.phone,
    website: details.website,
    source: "auto" as const,
    status: "building" as const,
    build_error: null,
    area_open: areaOpen,
    area_zip: details.zip,
    expires_at: expiresAt(),
    ip_hash: hashIpString(ip),
    ...attribution,
  };

  let row: PreviewRow | null = null;
  if (cached) {
    // Expired or failed: rebuild the same row (keeps the slug the spa may already have).
    const { data, error } = await db.from("app_previews").update(base).eq("id", cached.id).select("*").single();
    if (error) { console.error("[preview] reset failed", error); return err(500, "Something went wrong on our side. Please try again."); }
    row = data as PreviewRow;
  } else {
    const { data, error } = await db.from("app_previews").insert({ ...base, slug: newPreviewSlug(details.name), place_id: placeId }).select("*").single();
    if (error) {
      // Two clicks raced: the other one created it.
      if (error.code === "23505") {
        const again = await getPreviewByPlace(placeId).catch(() => null);
        if (again) return NextResponse.json({ slug: again.slug, status: again.status, url: previewUrl(again.slug), area_open: again.area_open, cached: true });
      }
      console.error("[preview] insert failed", error);
      return err(500, "Something went wrong on our side. Please try again.");
    }
    row = data as PreviewRow;
  }

  waitUntil(buildPreview(row.id));
  waitUntil(recordEvent(row.id, "build_started", { cached: false }));
  waitUntil(Promise.allSettled([
    postGhlLead({
      event: "app_preview_created",
      business_name: row.business_name, business_phone: row.phone, website: row.website, address: row.address,
      slug: row.slug, preview_url: previewUrl(row.slug), area_open: areaOpen, source: "auto",
      utm_source: attribution.utm_source, utm_medium: attribution.utm_medium, utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content, utm_term: attribution.utm_term,
    }),
  ]));

  return NextResponse.json({ slug: row.slug, status: "building", url: previewUrl(row.slug), area_open: areaOpen, cached: false }, { headers: { "Cache-Control": "no-store" } });
}
