/**
 * lib/preview/sms.ts — CP-232 · "Text me my app" links. Pure, client-safe.
 *
 *   iOS:      sms:+18055550142&body=…   (iOS 8+ reads the body after "&")
 *   Android:  sms:+18055550142?body=…
 *   QR code:  SMSTO:+18055550142:…      (camera apps on both open Messages)
 */

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** E.164 for US numbers: "(805) 555-0142" → "+18055550142". null when it isn't a phone number. */
export function e164(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export function smsMessage(businessName: string, slug: string): string {
  const name = businessName.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  return `Hi! Send me my ${name} app (${slug})`;
}

export function smsHref(number: string, body: string, platform: Platform): string {
  const sep = platform === "ios" ? "&" : "?";
  return `sms:${number}${sep}body=${encodeURIComponent(body)}`;
}

export function smsQrPayload(number: string, body: string): string {
  return `SMSTO:${number}:${body}`;
}
