import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShopClient } from "./shop-client";
import type { Business } from "@/lib/types/database";

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

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", params.business)
    .maybeSingle();

  if (!bizRow) notFound();
  const business = bizRow as Business;

  // Pull all active rewards for this business. The page groups by
  // `category` client-side — "Uncategorized" gets its own bucket.
  const { data: rewards } = await supabase
    .from("rewards")
    .select("id, name, description, point_cost, image_url, category, sort_order")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name",       { ascending: true });

  // Customer's current points balance
  const { data: { user } } = await supabase.auth.getUser();
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
