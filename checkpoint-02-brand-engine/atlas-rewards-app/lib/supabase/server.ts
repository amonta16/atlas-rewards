// Server-side Supabase client. Used in Server Components and Route Handlers.
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sharedCookieOptions } from "./cookie-domain";

export function createClient() {
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
}
