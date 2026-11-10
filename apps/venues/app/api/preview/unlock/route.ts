import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { clean, EMAIL_RE, notifyLead } from "@/lib/landing/notify";
import { sendCapiEvent, requestIp, shareBlocked } from "@/lib/landing/meta-capi";
import { newEventId } from "@/lib/landing/funnel-sign";
import { checkAreaAt, lookupZip } from "@/lib/landing/territory";
import { postGhlLead } from "@/lib/preview/ghl";
import { sendWelcomeEmail } from "@/lib/preview/email";
import { deskUrl, getPreviewBySlug, isExpired, medspaOrigin, previewDb, previewUrl, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/unlock — lead-magnet audit, step 3 · the gate, AFTER the app is on screen.
 *
 * The owner sees their app first (med.atlas-engine.app/p/<slug>). On scroll-past or 45 s the page
 * asks "Your app is ready. Unlock it." for two things only: email, and the zip we already have
 * from Google (prefilled, they can correct it). No name, no phone, no SMS boxes, no quiz.
 *
 * Body { slug, email, zip, hp } → { ok, event_id, area_open, desk_url }
 *
 * This is the lead now (it replaces /api/preview/contact in the funnel):
 *   · saved on the preview row (contact_email, contact_at, area_zip; area re-checked if the zip changed);
 *   · Meta "Lead" via the Conversions API (hashed email + zip), deduped by event_id;
 *   · GHL webhook (event "app_preview_contact", same as before, so existing automations keep firing);
 *   · an email to Andrew; the owner gets the welcome email with their front desk link (first unlock only).
 * The follow-up emails (Admin → Lead funnel) start from contact_at, as before.
 * Cross-origin from the med spa app only (CORS locked to that origin), rate limited.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const ZIP_RE = /^\d{5}$/;

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
  const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { ...h, "Cache-Control": "no-store" } });
  const rl = await rateLimit(clientKey(req, "pv-unlock"), 6, 600);
  if (!rl.ok) return reply(429, { error: "Too many tries. Please wait a few minutes." });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  if (b.hp) return reply(200, { ok: true });

  const slug = typeof b.slug === "string" ? b.slug.toLowerCase() : "";
  if (!SLUG_RE.test(slug)) return reply(404, { error: "Preview not found." });
  const email = clean(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return reply(400, { error: "Please enter a valid email." });
  const zip = clean(b.zip, 10).replace(/\D/g, "").slice(0, 5);
  if (!ZIP_RE.test(zip)) return reply(400, { error: "Please enter your 5-digit zip code." });

  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row) || (row.status !== "ready" && row.status !== "claimed")) return reply(404, { error: "This preview has expired. Please build a new one." });

  // A corrected zip moves the territory check to that zip (one med spa per area).
  let areaOpen = row.area_open;
  if (zip !== row.area_zip) {
    const z = lookupZip(zip);
    if (!z) return reply(400, { error: "We don't recognize that zip code. Please check it." });
    try {
      const a = await checkAreaAt({ lat: z.lat, lng: z.lng, zip });
      areaOpen = a.ok ? a.open : row.area_open;
    } catch (e) { console.error("[preview] unlock area check failed", e); }
  }

  const now = new Date().toISOString();
  const first = !row.contact_at;
  const { error } = await previewDb().from("app_previews")
    .update({ contact_email: email, area_zip: zip, area_open: areaOpen, ...(first ? { contact_at: now } : {}) })
    .eq("id", row.id);
  if (error) {
    console.error("[preview] unlock save failed", error.message);
    return reply(500, { error: "We couldn't save that. Please try again." });
  }

  const eventId = newEventId("pvlead");
  const url = previewUrl(row.slug);
  waitUntil(Promise.allSettled([
    sendCapiEvent({
      optedOut: shareBlocked(req),
      name: "Lead",
      eventId,
      sourceUrl: url,
      user: { email, ip: requestIp(req), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300), fbp: row.fbp, fbc: row.fbc, externalId: row.slug },
      customData: { content_name: "app_preview", content_category: "medspa" },
    }),
    postGhlLead({
      event: "app_preview_contact",
      business_name: row.business_name, business_phone: row.phone, website: row.website, address: row.address,
      slug: row.slug, preview_url: url, contact_email: email, zip,
      area_open: areaOpen, source: row.source,
      utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, utm_content: row.utm_content, utm_term: row.utm_term,
    }),
    notifyLead(`App preview unlocked: ${row.business_name}`, [
      ["Email", email],
      ["Zip", zip === row.area_zip ? zip : `${zip} (corrected from ${row.area_zip ?? "none"})`],
      ["Practice", row.business_name],
      ["Website", row.website],
      ["Business phone", row.phone],
      ["Area", areaOpen == null ? null : areaOpen ? "open" : "TAKEN (waitlist)"],
      ["Preview", url],
      ["Ad", [row.utm_campaign, row.utm_content].filter(Boolean).join(" / ") || null],
    ]),
    // Their front desk link, once. A second unlock (another device) only updates the email.
    first ? sendWelcomeEmail(row.slug) : Promise.resolve(false),
  ]));

  return reply(200, { ok: true, event_id: eventId, area_open: areaOpen, desk_url: deskUrl(row.slug) });
}
