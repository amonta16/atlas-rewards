// Server-side Supabase client. Used in Server Components and Route Handlers.
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sharedCookieOptions } from "./cookie-domain";

/**
 * CP-89: wrapped in React cache().
 *
 * cache() memoizes per request render pass, so every Server Component,
 * generateMetadata and generateViewport in one page view now shares ONE
 * client instance instead of building a fresh one each call. Inside route
 * handlers (no React render pass) cache() simply executes the function —
 * behaviour there is unchanged.
 */
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
  const { data: { user } } = await createClient().auth.getUser();
  return user;
});
