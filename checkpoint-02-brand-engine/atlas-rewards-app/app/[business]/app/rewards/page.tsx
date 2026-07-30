import { createClient } from "@/lib/supabase/server";
import { RewardsClient } from "@/components/customer/rewards-client";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function RewardsTab({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const mem = (memRows?.[0] ?? null) as Membership | null;

  // CP-87: prize-only rewards (wheel/streak/offer gifts) stay out of the store.
  const { data: rewards } = await supabase
    .from("rewards").select("*").eq("business_id", business.id).eq("is_active", true)
    .eq("show_in_store", true).order("sort_order");

  const { data: redemptions } = await supabase.rpc("my_redemptions", { p_business_id: business.id });
  const { data: featured }    = await supabase.rpc("featured_offer", { p_business_id: business.id });

  const { data: { user } } = await supabase.auth.getUser();
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
        initialFeaturedOffer={(featured?.[0] ?? null) as any}
      />
    </>
  );
}
