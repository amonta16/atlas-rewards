import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { ShopClient } from "./shop-client";

export const dynamic = "force-dynamic";

/**
 * Customer Rewards Shop — CP-42
 *
 * The full categorized catalog the customer sees when they tap "See
 * more" on the Rewards-store strip on Home. McDonald's / Starbucks
 * style: rewards grouped by category, scrollable, with the customer's
 * current points always visible at the top.
 */
export default async function ShopPage({
  params,
}: {
  params: { business: string };
}) {
  const supabase = createClient();

  // CP-89: request-memoized — dedupes with the app layout's fetches.
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();

  // Pull all active rewards for this business. The page groups by
  // `category` client-side — "Uncategorized" gets its own bucket.
  const { data: rewards } = await supabase
    .from("rewards")
    .select("id, name, description, point_cost, image_url, category, sort_order")
    .eq("business_id", business.id)
    .eq("is_active", true)
    // CP-87: prize-only rewards are hidden from the shop.
    .eq("show_in_store", true)
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });

  // Customer's current points balance
  const user = await getCachedUser();  // CP-89: memoized (layout already fetched it)
  let pointsBalance = 0;
  if (user) {
    const { data: mem } = await supabase
      .from("business_memberships")
      .select("points_balance")
      .eq("user_id", user.id)
      .eq("business_id", business.id)
      .maybeSingle();
    pointsBalance = (mem?.points_balance as number) ?? 0;
  }

  return (
    <ShopClient
      business={business}
      rewards={(rewards ?? []) as any[]}
      pointsBalance={pointsBalance}
    />
  );
}
