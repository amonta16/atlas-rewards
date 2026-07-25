import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sharedCookieDomain, sharedCookieOptions } from "./cookie-domain";

/**
 * Refreshes the Supabase auth cookie on every request, so sessions persist
 * correctly.
 *
 * CP-84 — refresh-token storm fix (Jul 25 2026 incident).
 * ---------------------------------------------------------------------
 * Symptom: 54k auth requests/hour, Vercel logs full of
 *   `AuthApiError: Invalid Refresh Token: Already Used`
 *   (code: refresh_token_already_used)
 * and Supabase auth logs full of `429: Request rate limit reached` on
 * POST /token, which locked real people out of signing in.
 *
 * Two causes, both fixed here:
 *
 *   1. LEGACY HOST-ONLY COOKIE (the big one). Before CP-81 the auth
 *      cookie was host-only (`www.atlas-engine.app`). CP-81 re-scoped it
 *      to the parent domain (`.atlas-engine.app`) so one login covers
 *      every business subdomain. Anyone who had signed in BEFORE that
 *      change now carries BOTH cookies under the same name. The browser
 *      sends both; we read the stale host-only one, refresh with its
 *      long-dead token, and write the rotated token to the DOMAIN cookie
 *      — so the stale copy never updates and never expires. Every
 *      subsequent request re-reads it and fails the same way, forever.
 *      That is a self-sustaining loop, and it is why clearing site data
 *      "fixed" it for individual users.
 *
 *      Fix: when a refresh fails as already-used/not-found, expire the
 *      host-only copy (Set-Cookie with NO domain attribute). The
 *      parent-domain cookie is a distinct cookie to the browser and
 *      survives untouched, so this does NOT sign anyone out.
 *
 *   2. PREFETCH RACES. The landing page has <Link href="/login"> and
 *      <Link href="/agency">, so Next prefetches both — three requests
 *      land in the same millisecond (visible in the Vercel logs), each
 *      running this middleware, each spending the SAME rotating refresh
 *      token. One wins; the others get `already_used`. Prefetches are
 *      speculative and nobody is waiting on their session, so they no
 *      longer refresh at all.
 *
 * Also: getUser() is now wrapped. An auth hiccup must never throw out of
 * middleware — that turns a recoverable session blip into a dead request.
 */

/** Supabase SSR auth cookies: `sb-<ref>-auth-token`, optionally chunked `.0`, `.1`. */
const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * True for Next.js speculative link prefetches. These must not spend a
 * refresh token — the user may never navigate there, and concurrent
 * prefetches are what create the rotation race in the first place.
 */
export function isPrefetchRequest(request: NextRequest): boolean {
  const h = request.headers;
  if (h.get("next-router-prefetch") === "1") return true;
  if (h.get("purpose") === "prefetch") return true;
  return (h.get("sec-purpose") ?? "").includes("prefetch");
}

/** Did this failure mean "the refresh token in the cookie is spent/gone"? */
function isStaleRefreshToken(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code ?? "";
  if (code === "refresh_token_already_used" || code === "refresh_token_not_found") {
    return true;
  }
  const message = ((err as { message?: string }).message ?? "").toLowerCase();
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
}

/**
 * Expire the PRE-CP-81 host-only duplicates of the auth cookies.
 *
 * Uses headers.append rather than response.cookies.set on purpose:
 * ResponseCookies de-dupes by name, so setting the same name would
 * clobber the freshly-rotated parent-domain cookie that setAll just
 * wrote. Appending emits a second, independent Set-Cookie line — and
 * because it carries no Domain attribute it only matches the host-only
 * copy.
 */
function expireLegacyHostOnlyAuthCookies(request: NextRequest, response: NextResponse) {
  // Only meaningful where CP-81's parent-domain cookie is actually in
  // play. On localhost / preview URLs the host-only cookie IS the real
  // session and clearing it would sign the developer out.
  if (!sharedCookieDomain(request.headers.get("host"))) return;

  const seen = new Set<string>();
  for (const { name } of request.cookies.getAll()) {
    if (!AUTH_COOKIE_RE.test(name) || seen.has(name)) continue;
    seen.add(name);
    response.headers.append(
      "set-cookie",
      `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`,
    );
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // CP-84: speculative prefetches never touch the refresh token.
  if (isPrefetchRequest(request)) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // CP-81: one login across every business subdomain.
      ...sharedCookieOptions(request.headers.get("host")),
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(toSet: { name: string; value: string; options?: any }[]) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Triggers cookie refresh.
  try {
    const { error } = await supabase.auth.getUser();
    if (isStaleRefreshToken(error)) {
      expireLegacyHostOnlyAuthCookies(request, response);
    }
  } catch (err) {
    // A thrown AuthApiError must not take the request down with it.
    if (isStaleRefreshToken(err)) {
      expireLegacyHostOnlyAuthCookies(request, response);
    }
  }

  return response;
}
