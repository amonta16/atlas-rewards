// Server-side Supabase client. Used in Server Components and Route Handlers.
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sharedCookieOptions } from "./cookie-domain";
import { HANDOFF_HEADER, authCookieHash, verifyHandoff } from "./session-handoff";

/**
 * CP-89: wrapped in React cache().
 *
 * cache() memoizes per request render pass, so every Server Component,
 * generateMetadata and generateViewport in one page view now shares ONE
 * client instance instead of building a fresh one each call. Inside route
 * handlers (no React render pass) cache() simply executes the function —
 * behaviour there is unchanged.
 */
/**
 * CP-218: server → Supabase reads get a time limit too. Without one, a
 * request stuck on a bad connection held the whole page render (and the
 * customer's loading screen) until the function's max duration. After
 * SERVER_REQUEST_TIMEOUT_MS the call fails like any other error and the
 * route's error.tsx offers Try again. Only PostgREST (/rest/v1) is limited:
 * Auth calls (token refresh) and Storage keep their own behaviour, since
 * aborting a refresh mid-flight could cost the customer their session.
 */
const SERVER_REQUEST_TIMEOUT_MS = 15_000;
const serverFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (init?.signal || !/\/rest\/v1\//.test(url)) return fetch(input, init);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SERVER_REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export const createClient = cache(function createClientForRequest() {
  const cookieStore = cookies();
  // CP-81: one login across every business subdomain.
  let host: string | null = null;
  try { host = headers().get("host"); } catch { /* static render — no request */ }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...sharedCookieOptions(host),
      global: { fetch: serverFetch },
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet: { name: string; value: string; options?: any }[]) {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Server Component — can't set; middleware handles it. */ }
        },
      },
    }
  );
});

/**
 * CP-89: request-memoized auth lookup.
 *
 * `supabase.auth.getUser()` is a NETWORK call to Supabase Auth every time
 * it runs. Before this, one customer Home view fired it three times
 * (middleware + layout + page) — and the July 25/30 incidents were both,
 * at root, "too many auth calls at once." Every Server Component should
 * use this instead of calling `auth.getUser()` directly: first caller
 * pays the round-trip, the rest of the render pass gets the memo.
 *
 * (Middleware runs outside the render pass and keeps its own call — that
 * one refreshes the session cookie and can't be deduped from here.)
 */
export const getCachedUser = cache(async () => {
  // CP-211: middleware already validated this request's session with
  // Supabase Auth; reuse its signed result instead of a second round trip.
  // Anything that doesn't verify (missing secret, prefetch, tampering,
  // stale) falls through to the network check below — old behaviour.
  try {
    const handoff = headers().get(HANDOFF_HEADER);
    if (handoff) {
      const u = await verifyHandoff(handoff, await authCookieHash(cookies().getAll()));
      if (u) return u;
    }
  } catch { /* no request context (static render) — fall through */ }
  const { data: { user } } = await createClient().auth.getUser();
  return user;
});
