/**
 * lib/landing/funnel-sign.ts — CP-201 · signed links for the /medspa funnel.
 *
 * Andrew's "Showed / No-show / Paid" buttons arrive by email and must work
 * without logging in, so each link carries an HMAC of (request id + outcome).
 * Nobody can mark a lead Paid without the secret.
 *
 * Env: LANDING_LINK_SECRET (any long random string). Falls back to CRON_SECRET,
 * then SUPABASE_SERVICE_ROLE_KEY, so it works the day it ships.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.LANDING_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("LANDING_LINK_SECRET is not set");
  return s;
}

export function sign(...parts: string[]): string {
  return createHmac("sha256", secret()).update(parts.join("|")).digest("base64url").slice(0, 32);
}

export function verify(sig: string | null | undefined, ...parts: string[]): boolean {
  if (!sig) return false;
  const want = Buffer.from(sign(...parts));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Unguessable token for the prospect's pre-call page URL. */
export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/** Short id shared by the browser Pixel and the server CAPI call so Meta counts one event. */
export function newEventId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}
