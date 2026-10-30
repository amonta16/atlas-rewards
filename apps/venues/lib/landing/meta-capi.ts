/**
 * lib/landing/meta-capi.ts — CP-201 · Meta Conversions API (server-side events).
 *
 * The browser Pixel loses a lot of events (iOS, ad blockers). Sending the same
 * event from the server with the same `event_id` lets Meta count it once and
 * still see it when the Pixel misses. Purchase only ever comes from here:
 * Andrew marks a deal Paid from the email link, long after the visitor left.
 *
 * Env (Vercel → Settings → Environment Variables):
 *   NEXT_PUBLIC_META_PIXEL_ID   — already used by the Pixel
 *   META_CAPI_TOKEN             — Events Manager → your Pixel → Settings → Conversions API → Generate access token
 *   META_TEST_EVENT_CODE        — optional, only while testing in Events Manager → Test events
 * With no token this logs and returns false; nothing else breaks.
 */
import { createHash } from "crypto";

export type CapiEventName = "Lead" | "Schedule" | "Purchase" | "QualifiedLead" | "CallConfirmed";

export type CapiUser = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  externalId?: string | null;
};

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
/** Meta wants phone digits only, with country code. US numbers without one get a leading 1. */
function normPhone(p: string) {
  const d = p.replace(/\D/g, "");
  return d.length === 10 ? `1${d}` : d;
}

export function capiConfigured(): boolean {
  return !!process.env.META_CAPI_TOKEN && /^\d{6,20}$/.test(process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "");
}

export async function sendCapiEvent(e: {
  name: CapiEventName;
  eventId: string;
  sourceUrl: string;
  user: CapiUser;
  customData?: Record<string, string | number | undefined>;
  /** "website" for things the visitor did; "system_generated" for Andrew's Paid click. */
  actionSource?: "website" | "system_generated";
}): Promise<boolean> {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!token || !pixel || !/^\d{6,20}$/.test(pixel)) {
    console.info(`[capi] not configured — would have sent ${e.name} (${e.eventId})`);
    return false;
  }
  const u = e.user;
  const user_data: Record<string, unknown> = {};
  if (u.email) user_data.em = [sha(u.email)];
  if (u.phone) user_data.ph = [sha(normPhone(u.phone))];
  if (u.firstName) user_data.fn = [sha(u.firstName)];
  if (u.lastName) user_data.ln = [sha(u.lastName)];
  if (u.externalId) user_data.external_id = [sha(u.externalId)];
  if (u.fbp) user_data.fbp = u.fbp;
  if (u.fbc) user_data.fbc = u.fbc;
  if (u.ip) user_data.client_ip_address = u.ip;
  if (u.userAgent) user_data.client_user_agent = u.userAgent;
  user_data.country = [sha("us")];

  const body: Record<string, unknown> = {
    data: [{
      event_name: e.name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: e.eventId,
      event_source_url: e.sourceUrl,
      action_source: e.actionSource ?? "website",
      user_data,
      custom_data: Object.fromEntries(Object.entries(e.customData ?? {}).filter(([, v]) => v !== undefined && v !== "")),
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error("[capi] rejected", e.name, r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (err) {
    console.error("[capi] failed", e.name, err);
    return false;
  }
}

/** First IP from the proxy headers (raw; only ever sent to Meta, never stored). */
export function requestIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  return xff.split(",")[0].trim() || null;
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
}
