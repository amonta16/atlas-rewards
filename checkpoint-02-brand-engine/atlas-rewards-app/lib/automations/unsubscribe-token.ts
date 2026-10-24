/**
 * lib/automations/unsubscribe-token.ts — CP-217 · signed one-click unsubscribe tokens.
 *
 * token = base64url(membership_id) + "." + base64url(HMAC-SHA256(secret, membership_id))
 * secret = EMAIL_UNSUB_SECRET, falling back to SUPABASE_SERVICE_ROLE_KEY.
 *
 * SERVER ONLY: imports node:crypto and reads secrets. Never import from a client component.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const s = process.env.EMAIL_UNSUB_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("No EMAIL_UNSUB_SECRET / SUPABASE_SERVICE_ROLE_KEY configured for unsubscribe tokens");
  return s;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const mac = (membershipId: string) => createHmac("sha256", secret()).update(`unsub:${membershipId.toLowerCase()}`).digest();

export function signUnsubscribeToken(membershipId: string): string {
  return `${b64url(Buffer.from(membershipId.toLowerCase(), "utf8"))}.${b64url(mac(membershipId))}`;
}

/** Returns the membership id when the token is valid, otherwise null. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const [idPart, sigPart] = token.split(".");
  if (!idPart || !sigPart) return null;
  let id: string;
  try { id = fromB64url(idPart).toString("utf8"); } catch { return null; }
  if (!UUID_RE.test(id)) return null;
  let given: Buffer;
  try { given = fromB64url(sigPart); } catch { return null; }
  const expected = mac(id);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id.toLowerCase();
}
