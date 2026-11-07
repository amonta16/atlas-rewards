import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { clean, EMAIL_RE, notifyLead, emailProspect } from "@/lib/landing/notify";
import { sendCapiEvent, requestIp, splitName } from "@/lib/landing/meta-capi";
import { newEventId } from "@/lib/landing/funnel-sign";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { postGhlLead } from "@/lib/preview/ghl";
import { e164 } from "@/lib/preview/sms";
import { getPreviewBySlug, isExpired, previewUrl, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/contact — CP-233 · the owner's contact, captured while their app builds.
 *
 * Body { slug, name, phone, email, consent: true, hp } → { ok, event_id }
 *
 * This is the lead. On submit:
 *   · saved on the preview row (contact_name / contact_phone / contact_email / consent time);
 *   · Meta "Lead" via the Conversions API with hashed email + phone (much better
 *     ad matching than an anonymous click), same event_id as the browser Pixel;
 *   · GHL inbound webhook (event "app_preview_contact"), if configured;
 *   · an email to Andrew, and an email to the owner with their preview link (Resend).
 * Contact details travel only in this POST body, never in a URL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-contact"), 6, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Invalid request."); }
  if (b.hp) return NextResponse.json({ ok: true });

  const slug = typeof b.slug === "string" && SLUG_RE.test(b.slug) ? b.slug : null;
  const name = clean(b.name, 120);
  const email = clean(b.email, 200).toLowerCase();
  const phone = e164(clean(b.phone, 40));
  if (!slug) return bad("Invalid request.");
  if (name.length < 2) return bad("Please enter your name.");
  if (!phone) return bad("Please enter a US mobile number.");
  if (!EMAIL_RE.test(email)) return bad("Please enter a valid email.");
  if (b.consent !== true) return bad("Please tick the box so we can text you your app.");

  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row)) return bad("This preview has expired. Please build a new one.", 404);

  const now = new Date().toISOString();
  const { error } = await createAdminClient().from("app_previews")
    .update({ contact_name: name, contact_phone: phone, contact_email: email, contact_consent_at: now, contact_at: now })
    .eq("id", row.id);
  if (error) {
    console.error("[preview] contact save failed", error.message);
    return bad("We couldn't save that. Please try again.", 500);
  }

  const eventId = newEventId("pvlead");
  const url = previewUrl(row.slug);
  const { first, last } = splitName(name);
  const ip = requestIp(req);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);

  waitUntil(Promise.allSettled([
    sendCapiEvent({
      name: "Lead",
      eventId,
      sourceUrl: `${SITE_ORIGIN}/medspa/app`,
      user: { email, phone, firstName: first, lastName: last, ip, userAgent: ua, fbp: row.fbp, fbc: row.fbc, externalId: row.slug },
      customData: { content_name: "app_preview", content_category: "medspa" },
    }),
    postGhlLead({
      event: "app_preview_contact",
      business_name: row.business_name, business_phone: row.phone, website: row.website, address: row.address,
      slug: row.slug, preview_url: url, contact_name: name, contact_phone: phone, contact_email: email,
      area_open: row.area_open, source: row.source,
      utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, utm_content: row.utm_content, utm_term: row.utm_term,
    }),
    notifyLead(`App preview lead: ${row.business_name}`, [
      ["Name", name],
      ["Mobile", phone],
      ["Email", email],
      ["Practice", row.business_name],
      ["Website", row.website],
      ["Business phone", row.phone],
      ["Area", row.area_open == null ? null : row.area_open ? "open" : "TAKEN (waitlist)"],
      ["Preview", url],
      ["Ad", [row.utm_campaign, row.utm_content].filter(Boolean).join(" / ") || null],
    ]),
    emailProspect(email, `Your ${row.business_name} app preview`, [
      `Hi ${first || "there"},`,
      "",
      `Here's the preview of ${row.business_name}'s own patient app:`,
      url,
      "",
      "Open it on your phone and tap around: memberships, rewards and reminders that bring patients back before their treatment wears off.",
      "It's saved for 14 days. Reply to this email or text us when you want it live.",
      "",
      "Andrew, Atlas Engine",
    ].join("\n")),
  ]));

  return NextResponse.json({ ok: true, event_id: eventId }, { headers: { "Cache-Control": "no-store" } });
}
