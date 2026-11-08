/**
 * lib/preview/twilio-sms.ts — CP-237 · texts from Atlas's A2P 10DLC number (Twilio Messages API).
 *
 * Off until PREVIEW_SMS_SEND=1, so deploying this sends nothing. When on, it needs:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   (same values the texted-code step uses)
 *   PREVIEW_SMS_NUMBER = +17752524211        (the approved number; the "From")
 *   TWILIO_MESSAGING_SERVICE_SID (optional)  (MG…; when set, sends through the A2P
 *                                             campaign's Messaging Service instead of From)
 *
 * What it sends, and only to owners who ticked the informational SMS box:
 *   · textPreviewLink: one text with their app link once they finish the funnel;
 *   · replies to texts they send us first (the "Text me my app" button), from
 *     /api/preview/sms-inbound, as TwiML (no API call needed for those).
 * STOP / HELP are handled by Twilio's built-in opt-out on the number.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { e164 } from "./sms";
import { deskUrl, getPreviewBySlug, isExpired, previewUrl } from "./store";

export function smsFromNumber(): string | null {
  return e164(process.env.PREVIEW_SMS_NUMBER ?? null);
}

export function smsSendEnabled(): boolean {
  return process.env.PREVIEW_SMS_SEND === "1"
    && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN
    && (!!process.env.TWILIO_MESSAGING_SERVICE_SID || !!smsFromNumber());
}

/** Sends one SMS. false (and a log line) on any failure; never throws. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!smsSendEnabled()) {
    console.info(`[sms] sending is off (PREVIEW_SMS_SEND), would have texted …${to.slice(-4)}`);
    return false;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const form: Record<string, string> = { To: to, Body: body.slice(0, 600) };
  if (service) form.MessagingServiceSid = service; else form.From = smsFromNumber()!;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: ac.signal,
      cache: "no-store",
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string };
      console.error("[sms] send rejected", r.status, j.code, String(j.message ?? "").slice(0, 200));
    }
    return r.ok;
  } catch (e) {
    console.error("[sms] send failed", e instanceof Error ? e.message : e);
    return false;
  } finally {
    clearTimeout(t);
  }
}

const clip = (s: string, n: number) => s.replace(/[\r\n]+/g, " ").trim().slice(0, n);

export function linkText(businessName: string, slug: string): string {
  return `Atlas Engine: ${clip(businessName, 60)}'s app is ready: ${previewUrl(slug)} Your front desk: ${deskUrl(slug)} Reply STOP to opt out.`;
}

/** The funnel's scan animation runs at least 22 s; the text lands after it, like the email. */
const AFTER_ANIMATION_MS = 26_000;

/**
 * Texts the owner their link after they finish the funnel. Only with the informational
 * consent box ticked (contact_consent_at), only to the number on the row. Never throws.
 */
export async function textPreviewLink(slug: string): Promise<boolean> {
  if (!smsSendEnabled()) return false;
  try {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, AFTER_ANIMATION_MS));
    let row = await getPreviewBySlug(slug);
    while (row && row.status === "building" && Date.now() - t0 < 200_000) {
      await new Promise((r) => setTimeout(r, 4000));
      row = await getPreviewBySlug(slug);
    }
    const consent = (row as { contact_consent_at?: string | null } | null)?.contact_consent_at;
    if (!row || !row.contact_phone || !consent || isExpired(row) || row.status === "building" || row.status === "failed") return false;
    return await sendSms(row.contact_phone, linkText(row.business_name, row.slug));
  } catch (e) {
    console.error("[sms] preview link failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Twilio request signature (X-Twilio-Signature): base64 HMAC-SHA1 of the full webhook URL
 * followed by every POST param, sorted by name, as name+value. Keyed with the auth token.
 */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const want = Buffer.from(createHmac("sha1", token).update(data, "utf8").digest("base64"));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}
