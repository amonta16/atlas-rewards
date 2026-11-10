import { rateLimit } from "@/lib/rate-limit";
import { notifyLead } from "@/lib/landing/notify";
import { postGhlLead } from "@/lib/preview/ghl";
import { e164 } from "@/lib/preview/sms";
import { linkText, smsSendEnabled, validTwilioSignature } from "@/lib/preview/twilio-sms";
import { getPreviewBySlug, isExpired, previewDb, previewUrl } from "@/lib/preview/store";

/**
 * POST /api/preview/sms-inbound — CP-237 · Twilio's "A message comes in" webhook for +1 775 252 4211.
 *
 * The "Text me my app" button on med.atlas-engine.app/p/<slug> opens Messages with
 * "Hi! Send me my <spa> app (pv-…)". When that text arrives, this replies (TwiML) with
 * their preview link and front desk link, marks the preview claimed and tells GHL.
 * Any other text gets a short "Andrew will text you back" and is emailed to Andrew.
 *
 *   · Only Twilio can call it: the X-Twilio-Signature is checked against TWILIO_AUTH_TOKEN.
 *   · STOP / START / HELP (and their variants) get no reply here: Twilio's opt-out handles them.
 *   · While PREVIEW_SMS_SEND isn't "1", it answers with an empty reply (nothing is texted).
 *   · At most 5 replies per sender per hour, so two auto-responders can't loop.
 *
 * Set in Twilio Console → Phone Numbers → +1 775 252 4211 → Messaging → "A message comes in"
 * (or the Messaging Service's Integration → "Send a webhook"):
 *   https://www.atlas-engine.app/api/preview/sms-inbound   (HTTP POST)
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const OPT_WORDS = /^(stop|stopall|unsubscribe|cancel|end|quit|start|unstop|yes|help|info|revoke|optout|opt out)$/i;
const SLUG_IN_TEXT = /\bpv-[a-z0-9-]{3,64}\b/i;
const SITE = "https://www.atlas-engine.app";

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const twiml = (msg?: string) => new Response(
  `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${xml(msg)}</Message>` : ""}</Response>`,
  { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } },
);

/** The URL Twilio signed: what it called, as seen through Vercel's proxy (plus an explicit override). */
function signedUrls(req: Request): string[] {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const urls = [`${proto}://${host}${u.pathname}${u.search}`, req.url];
  if (process.env.PREVIEW_SMS_WEBHOOK_URL) urls.push(process.env.PREVIEW_SMS_WEBHOOK_URL);
  return Array.from(new Set(urls));
}

export async function POST(req: Request) {
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  const sig = req.headers.get("x-twilio-signature");
  if (!signedUrls(req).some((u) => validTwilioSignature(u, params, sig))) {
    return new Response("Forbidden", { status: 403 });
  }

  const from = e164(params.From ?? "");
  const body = (params.Body ?? "").trim();

  // Audit step 6: ANY reply from an owner in the follow-up sequence (STOP, a question, "send me my
  // app") ends the sequence's texts for them. Andrew gets the message; emails and calls carry on.
  if (from) {
    const db = previewDb();
    const { data: inSeq } = await db.from("app_previews").select("id, business_name").eq("contact_phone", from).gt("seq_step", 0).is("sms_stopped_at", null).limit(5);
    if (inSeq?.length) {
      await db.from("app_previews").update({ sms_stopped_at: new Date().toISOString() }).in("id", inSeq.map((r) => r.id));
      await notifyLead(`Text reply: ${inSeq.map((r) => r.business_name).join(", ")}`, [["From", from], ["Message", body.slice(0, 500)], ["Follow-up texts", "stopped (they replied)"]]).catch(() => false);
    }
  }
  if (!from || OPT_WORDS.test(body)) return twiml();

  const rl = await rateLimit(`sms-in:${from}`, 5, 3600);
  if (!rl.ok) return twiml();

  const slug = body.match(SLUG_IN_TEXT)?.[0].toLowerCase() ?? null;
  const row = slug ? await getPreviewBySlug(slug).catch(() => null) : null;

  if (!row) {
    await notifyLead("Text to the Atlas number", [["From", from], ["Message", body.slice(0, 500)]]).catch(() => false);
    return twiml(smsSendEnabled() ? "Atlas Engine: thanks for your text! Andrew will reply shortly. Reply STOP to opt out." : undefined);
  }
  if (isExpired(row)) {
    return twiml(smsSendEnabled() ? `Atlas Engine: that app preview has expired. Build a fresh one in about a minute: ${SITE}/medspa/app Reply STOP to opt out.` : undefined);
  }

  // They texted us first: claim the preview (keeps it viewable) and tell GHL, like the button's beacon.
  const patch: Record<string, unknown> = { status: row.status === "building" ? row.status : "claimed", claimed_at: new Date().toISOString() };
  if (!row.contact_phone) patch.contact_phone = from;
  const { error } = await previewDb().from("app_previews").update(patch).eq("id", row.id);
  if (error) console.error("[sms-in] claim update failed", error.message);
  await postGhlLead({
    event: "app_preview_text_me",
    business_name: row.business_name, business_phone: row.phone, website: row.website, address: row.address,
    slug: row.slug, preview_url: previewUrl(row.slug), contact_phone: from, area_open: row.area_open, source: row.source,
    utm_source: row.utm_source, utm_medium: row.utm_medium, utm_campaign: row.utm_campaign, utm_content: row.utm_content, utm_term: row.utm_term,
  }).catch(() => false);

  if (!smsSendEnabled()) return twiml();
  if (row.status === "building") return twiml(`Atlas Engine: ${row.business_name.slice(0, 60)}'s app is almost ready. Open it in a minute: ${previewUrl(row.slug)} Reply STOP to opt out.`);
  return twiml(linkText(row.business_name, row.slug));
}
