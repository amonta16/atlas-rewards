/**
 * lib/data/customer-app.ts — CP-89
 *
 * Request-memoized data helpers for the customer app's server components.
 *
 * WHY: the CP-88 audit measured ONE render of the customer Home tab at
 * 17 Supabase round-trips — with the same `businesses` row fetched FIVE
 * separate times (generateViewport, generateMetadata, the business layout,
 * the app layout, and the page), and `my_membership` / `featured_offer`
 * each fetched twice (app layout + page). None of it was cached because
 * the codebase had zero React cache() usage.
 *
 * Each helper here is wrapped in React cache(), which memoizes BY ARGUMENT
 * for the duration of one request render pass. The layout and the page can
 * now both call getMyMembership(business.id) and only one RPC fires; the
 * five business-row fetches collapse to one. Nothing is cached ACROSS
 * requests — a manager's brand edit still shows up on the very next load.
 *
 * RULES:
 *   • Server components only (these use the cookie-bound server client).
 *   • Add new shared lookups HERE, wrapped in cache(), instead of calling
 *     supabase directly from both a layout and a page.
 *   • BusinessLayout's `resolve_business_by_slug` RPC is deliberately NOT
 *     replaced by getBusinessBySlug — that RPC is the anon-callable path
 *     from CP-01 (pre-login customers hit it) and may not be equivalent
 *     to a direct table select under RLS. It stays as is.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Business, Membership } from "@/lib/types/database";

/**
 * CP-110 (security): strip server-only credentials before a business row
 * can reach a client component. `businesses` carries per-business secrets
 * (ghl_api_key, webhook_secret) alongside branding; the customer app
 * selects "*" and passes the row straight into client components (points
 * card, booking, raffle…), which serializes it into the browser bundle.
 * Those secrets are only ever needed server-side (the GHL/webhook routes
 * re-fetch them via the service-role client), so we null them here — the
 * single choke-point every customer-app page loads through.
 */
function stripBusinessSecrets<T extends Record<string, any> | null>(row: T): T {
  if (!row) return row;
  return { ...row, ghl_api_key: null, webhook_secret: null } as T;
}

/** One business row per slug per request — replaces five duplicate fetches. */
export const getBusinessBySlug = cache(async (slug: string): Promise<Business | null> => {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses").select("*").eq("slug", slug).maybeSingle();
  return stripBusinessSecrets((data ?? null) as Business | null);
});

/** The signed-in customer's membership for this business, once per request. */
export const getMyMembership = cache(async (businessId: string): Promise<Membership | null> => {
  const supabase = createClient();
  const { data } = await supabase.rpc("my_membership", { p_business_id: businessId });
  return (((data as Membership[] | null)?.[0]) ?? null);
});

/** Row shape of featured_offer() — superset of what the banner and the Home card each need. */
export type FeaturedOfferRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  expires_at: string | null;
  voice_message_url: string | null;
};

/** The business's featured offer (at most one), once per request. */
export const getFeaturedOffer = cache(async (businessId: string): Promise<FeaturedOfferRow | null> => {
  const supabase = createClient();
  const { data } = await supabase.rpc("featured_offer", { p_business_id: businessId });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as FeaturedOfferRow | null;
});
