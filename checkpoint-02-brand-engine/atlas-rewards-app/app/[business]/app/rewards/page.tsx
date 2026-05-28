import { createClient } from "@/lib/supabase/server";
import { RewardsClient } from "@/components/customer/rewards-client";
import { HeaderActions } from "@/components/customer/header-actions";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function RewardsTab({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const mem = (memRows?.[0] ?? null) as Membership | null;

  const { data: rewards } = await supabase
    .from("rewards").select("*").eq("business_id", business.id).eq("is_active", true).order("sort_order");

  const { data: redemptions } = await supabase.rpc("my_redemptions", { p_business_id: business.id });
  const { data: featured }    = await supabase.rpc("featured_offer", { p_business_id: business.id });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const fullName = profile?.full_name ?? user!.email ?? "Member";

  return (
    <>
      {/* CP-24: persistent header on every tab — was missing on Rewards which made
          the Gift/Profile/Streak icons disappear when the customer navigated here.
          Mirrors the Home page header (app/[business]/app/page.tsx). */}
      <div className="px-4 pt-3 pb-3 flex items-center justify-between bg-white border-b border-zinc-100">
        {business.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={business.logo_url} alt={business.name} className="h-9 max-w-[140px] object-contain" />
        ) : (
          <div
            className="h-9 px-3 rounded-full flex items-center text-white text-xs font-bold max-w-[160px]"
            style={{ background: business.brand_colors.primary }}
          >
            <span className="truncate">{business.name}</span>
          </div>
        )}
        <HeaderActions
          business={business}
          membershipId={mem?.id ?? null}
          membership={mem}
        />
      </div>

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
