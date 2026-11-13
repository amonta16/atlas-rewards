import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { clean, notifyLead } from "@/lib/landing/notify";
import { e164 } from "@/lib/preview/sms";
import { linkText, sendSms } from "@/lib/preview/twilio-sms";
import { getPreviewBySlug, isExpired, medspaOrigin, previewDb, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/sms-optin — CP-246 · the optional "text me" step, after the app is on screen.
 *
 * Shown in two places: the unlock sheet on /p/<slug> (after the email + zip) and the preview
 * booking page /medspa/book/<slug>. Same two separate, unchecked boxes and the same wording as
 * lib/preview/consent.ts (what the A2P registration describes). Neither box is required.
 *
 * Body { slug, phone, sms_consent, sms_marketing_consent, hp } → { ok, texted }
 *   · saves contact_phone and the time of each box ticked on the preview
 *     (contact_consent_at = informational, contact_marketing_consent_at = marketing);
 *   · informational box ticked → texts their app link once, now (only if PREVIEW_SMS_SEND is on);
 *   · the marketing box is what lets the follow-up texts in Admin → Lead funnel go out
 *     (lead-sequence-run: smsOk = phone + contact_marketing_consent_at).
 * Unticking never clears an earlier consent here (STOP does that). CORS: the med spa origin
 * (the unlock sheet) and same-origin (the booking page). Rate limited.
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
  const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { ...h, "Cache-Control": "no-store" } });
  const rl = await rateLimit(clientKey(req, "pv-sms-optin"), 6, 600);
  if (!rl.ok) return reply(429, { error: "Too many tries. Please wait a few minutes." });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  if (b.hp) return reply(200, { ok: true, texted: false });

  const slug = typeof b.slug === "string" ? b.slug.toLowerCase() : "";
  if (!SLUG_RE.test(slug)) return reply(404, { error: "Preview not found." });
  const phone = e164(clean(b.phone, 40));
  if (!phone) return reply(400, { error: "Please enter a US mobile number with area code." });
  const info = b.sms_consent === true;
  const marketing = b.sms_marketing_consent === true;
  if (!info && !marketing) return reply(400, { error: "Tick a box to get texts, or skip this step." });

  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row)) return reply(404, { error: "This preview has expired." });

  const now = new Date().toISOString();
  const patch: Record<string, string> = { contact_phone: phone };
  if (info) patch.contact_consent_at = now;
  if (marketing) patch.contact_marketing_consent_at = now;
  const { error } = await previewDb().from("app_previews").update(patch).eq("id", row.id);
  if (error) {
    console.error("[preview] sms opt-in save failed", error.message);
    return reply(500, { error: "We couldn't save that. Please try again." });
  }

  // The informational box covers their app link: send it now, once.
  const texted = info && row.status !== "building" && row.status !== "failed" ? await sendSms(phone, linkText(row.business_name, row.slug)) : false;
  waitUntil(notifyLead(`Texts on: ${row.business_name}`, [
    ["Mobile", phone],
    ["App link + reminders", info ? "yes" : "no"],
    ["Offers (follow-up texts)", marketing ? "yes" : "no"],
    ["App link texted", texted ? "yes" : "no (sending off or failed)"],
  ]).then(() => undefined));
  return reply(200, { ok: true, texted });
}
