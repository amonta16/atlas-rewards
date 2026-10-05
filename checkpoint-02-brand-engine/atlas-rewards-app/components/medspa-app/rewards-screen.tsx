/**
 * MedspaRewards — CP-193 · /<slug>/app/rewards for med spas (Dermis Rewards)
 * Glass points card → rewards rail (See more → grid) → ready-to-use codes →
 * "Need more points?" ways to earn.
 */
import type { Business, Membership } from "@/lib/types/database";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getMedspaPatientContext } from "@/lib/data/medspa";
import { getMsMembership, getMsOpenOrderCount, getMsProfile, getMsRewards } from "@/lib/medspa-app/data";
import type { ActiveRedemption } from "@/components/customer/active-redemptions";
import { MedspaRewardsClient } from "./rewards-client";

export async function MedspaRewards({ business, membership }: { business: Business; membership: Membership | null }) {
  const user = await getCachedUser();
  const uid = user?.id ?? "";
  const [profile, rewards, bag, ms, ctx, { data: redemptions }] = await Promise.all([
    getMsProfile(uid), getMsRewards(business.id), getMsOpenOrderCount(business.id, uid),
    getMsMembership(business.id, membership?.id ?? null), getMedspaPatientContext(business, uid || null),
    createClient().rpc("my_redemptions", { p_business_id: business.id }),
  ]);
  return (
    <MedspaRewardsClient
      business={business}
      membership={membership}
      rewards={rewards}
      redemptions={(redemptions ?? []) as ActiveRedemption[]}
      fullName={profile?.full_name ?? user?.email?.split("@")[0] ?? "Member"}
      profileIncomplete={!!profile && (!profile.birthday || !profile.phone)}
      memberLabel={ms.isPaid ? `${ms.view.name} member` : null}
      creditCents={ctx.credits && ctx.credits.balance_cents > 0 ? ctx.credits.balance_cents : null}
      bagCount={bag}
    />
  );
}
