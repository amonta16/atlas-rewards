/**
 * Service-role Supabase client for server-side admin operations.
 *
 * NEVER import this from a client component. It uses the
 * SUPABASE_SERVICE_ROLE_KEY which bypasses RLS — exposing it to the
 * browser would leak everyone's data.
 *
 * Use cases:
 *   - Sending magic-link invitation emails (auth.admin.inviteUserByEmail)
 *   - Cron jobs / webhook handlers that need to write across tenants
 *
 * Pattern mirrors the existing ad-hoc createServerClient calls in
 * `app/api/stripe/webhook/route.ts` etc. — centralized here so future
 * API routes don't have to re-paste the env-var dance.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). " +
      "Add them to .env.local — service role is required for team invites.",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
