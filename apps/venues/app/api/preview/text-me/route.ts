import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { postGhlLead } from "@/lib/preview/ghl";
import { e164 } from "@/lib/preview/sms";
import { getPreviewBySlug, isExpired, medspaOrigin, previewUrl, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/text-me — CP-232 · called from med.atlas-engine.app/p/<slug>.
 *
 * Body { slug, action: "sms_tap" | "phone" | "go_live", phone? }
 *   · phone   (desktop fallback): the visitor's mobile number → GHL webhook, row claimed.
 *   · sms_tap / go_live: marks the preview claimed (so it stays viewable) and tells GHL.
 * Cross-origin from the med spa app only (CORS locked to that one origin).
 * The phone number travels in the body, never in a URL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const rl = await rateLimit(clientKey(req, "pv-text"), 8, 600);
  if (!rl.ok) return reply(429, { error: "Too many tries. Please wait a few minutes." });

  let b: { slug?: unknown; action?: unknown; phone?: unknown; hp?: unknown };
  try { b = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  if (b.hp) return reply(200, { ok: true });
  const slug = typeof b.slug === "string" && SLUG_RE.test(b.slug) ? b.slug : null;
  const action = b.action === "phone" || b.action === "go_live" || b.action === "sms_tap" ? b.action : null;
  if (!slug || !action) return reply(400, { error: "Invalid request." });
  const phone = action === "phone" ? e164(typeof b.phone === "string" ? b.phone : "") : null;
  if (action === "phone" && !phone) return reply(400, { error: "Please enter a US mobile number." });

  try {
    const row = await getPreviewBySlug(slug);
    if (!row || isExpired(row)) return reply(404, { error: "This preview has expired." });
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: row.status === "building" ? row.status : "claimed", claimed_at: now };
    if (phone) patch.contact_phone = phone;
    const { error } = await createAdminClient().from("app_previews").update(patch).eq("id", row.id);
    if (error) console.error("[preview] claim update failed", error.message);
    const sent = await postGhlLead({
      event: "app_preview_text_me",
      business_name: row.business_name, business_phone: row.phone, website: row.website, address: row.address,
      slug: row.slug, preview_url: previewUrl(row.slug), contact_phone: phone, area_open: row.area_open, source: row.source,
      utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, utm_content: row.utm_content, utm_term: row.utm_term,
    });
    if (action === "phone" && !sent && process.env.GHL_INBOUND_WEBHOOK_URL) return reply(502, { error: "We couldn't send that just now. Please try again, or text us instead." });
    return reply(200, { ok: true });
  } catch (e) {
    console.error("[preview] text-me failed", e);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}
