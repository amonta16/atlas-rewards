// Browser-side Supabase client. Used inside Client Components.
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieOptions } from "./cookie-domain";

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
    opts,
  );
}
