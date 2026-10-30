/**
 * lib/supabase/session-handoff.ts — CP-211 · one auth check per launch
 *
 * Every request already passes through middleware, which calls
 * `supabase.auth.getUser()` (a real round trip to Supabase Auth that
 * validates the JWT and refreshes the cookie). The render then called
 * getUser() AGAIN, because server components can't see middleware's
 * result — two sequential auth round trips on every app open, same answer.
 *
 * Now middleware hands its verified user to the render in an internal
 * request header. The header is:
 *   • HMAC-SHA256 signed with a server-only secret (forged values fail),
 *   • bound to a hash of this request's auth cookie (can't be moved to
 *     another session),
 *   • valid for 30 s (a request render, never a stored credential),
 *   • stripped from incoming requests by middleware before it's set.
 * Anything that doesn't verify falls back to the old network getUser(),
 * so the worst case is exactly the old behaviour. Security level is
 * unchanged: the JWT is still validated by Supabase Auth once per request.
 *
 * Works on the Edge runtime (middleware) and Node (render): Web Crypto only.
 */
import type { User } from "@supabase/supabase-js";

export const HANDOFF_HEADER = "x-atlas-session";
const MAX_AGE_MS = 30_000;

function secret(): string | null {
  return process.env.SESSION_HANDOFF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const utf8b64u = (s: string) => b64u(enc.encode(s));
const b64uUtf8 = (s: string) => new TextDecoder().decode(fromB64u(s));

async function key(s: string) {
  return crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** sha256 of the Supabase auth cookie(s) — ties a handoff to this session. */
export async function authCookieHash(cookies: { name: string; value: string }[]): Promise<string> {
  const v = cookies.filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("|");
  return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(v))));
}

/** Middleware: sign the user it just verified. Returns null when no secret is configured. */
export async function signHandoff(user: User, cookieHash: string): Promise<string | null> {
  const s = secret();
  if (!s) return null;
  // identities can be large and nothing in the render needs them.
  const { identities: _drop, ...slim } = user as User & { identities?: unknown };
  const body = utf8b64u(JSON.stringify({ u: slim, c: cookieHash, t: Date.now() }));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(s), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}

/** Render: the verified user, or null if anything about the header is off. */
export async function verifyHandoff(value: string | null, cookieHash: string): Promise<User | null> {
  const s = secret();
  if (!s || !value) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(s), fromB64u(value.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(b64uUtf8(body)) as { u: User; c: string; t: number };
    if (typeof p.t !== "number" || Date.now() - p.t > MAX_AGE_MS || p.t - Date.now() > 5_000) return null;
    if (p.c !== cookieHash) return null;
    return p.u?.id ? p.u : null;
  } catch {
    return null;
  }
}
