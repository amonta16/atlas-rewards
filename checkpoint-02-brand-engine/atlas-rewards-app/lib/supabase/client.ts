// Browser-side Supabase client. Used inside Client Components.
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieOptions } from "./cookie-domain";

/**
 * CP-212: no browser request to Supabase may hang forever.
 *
 * supabase-js uses plain fetch with no timeout. On a front-desk tablet that
 * slept or switched Wi-Fi, a request (often the token refresh every other
 * query waits on) can sit on a dead connection indefinitely — every panel
 * then shows its spinner forever and only a reload fixes it. After
 * REQUEST_TIMEOUT_MS the request is aborted; supabase-js turns that into a
 * normal `{ error }` result, so callers' loading flags clear and the next
 * refresh starts on a fresh connection.
 *
 * Storage uploads and Edge Functions are left alone (they can legitimately
 * take longer), as is any request that already carries its own signal.
 */
const REQUEST_TIMEOUT_MS = 20_000;

const fetchWithTimeout: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (init?.signal || /\/(storage|functions)\/v1\//.test(url) || typeof AbortController === "undefined") {
    return fetch(input, init);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export function createClient() {
  // CP-81: parent-domain cookie so one login covers every business
  // subdomain (see lib/supabase/cookie-domain.ts).
  const opts =
    typeof window === "undefined"
      ? {}
      : sharedCookieOptions(window.location.hostname);
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { ...opts, global: { fetch: fetchWithTimeout } },
  );
}
