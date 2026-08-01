import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getFeaturedOffer, getMyMembership } from "@/lib/data/customer-app";
import { RewardsClient } from "@/components/customer/rewards-client";

export const dynamic = "force-dynamic";

export default async function RewardsTab({ params }: { params: { business: string } }) {
  // CP-89: request-memoized — dedupes with the app layout's fetches.
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const supabase = createClient();
  const mem = await getMyMembership(business.id);

  // CP-87: prize-only rewards (wheel/streak/offer gifts) stay out of the store.
  const { data: rewards } = await supabase
    .from("rewards").select("*").eq("business_id", business.id).eq("is_active", true)
    .eq("show_in_store", true).order("sort_order");

  const { data: redemptions } = await supabase.rpc("my_redemptions", { p_business_id: business.id });
  const featured = await getFeaturedOffer(business.id);   // CP-89: memoized (layout already fetched it)

  const user = await getCachedUser();                     // CP-89: memoized (layout already fetched it)
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const fullName = profile?.full_name ?? user!.email ?? "Member";

  return (
    <>
      {/* CP-52.4: per-tab header removed — the logo + quick actions now render
          once, globally, from the app shell (avoids a double-mounted
          HeaderActions colliding on the same realtime channel). */}
      <RewardsClient
        business={business}
        membership={mem}
        rewards={rewards ?? []}
        fullName={fullName}
        initialRedemptions={redemptions ?? []}
        initialFeaturedOffer={featured as any}
      />
    </>
  );
}
