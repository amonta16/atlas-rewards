/**
 * lib/medspa-app/data.ts — CP-193 · server lookups for the med spa app
 *
 * Everything the med spa screens read, in one place. All request-memoized
 * with React cache(), so the frame (bag badge, nav dots) and the page it
 * wraps share one query each. Server components only. Nothing outside
 * components/medspa-app imports this file.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { readMembership, type MembershipRow, type MembershipView } from "@/lib/membership";

export type MsProfile = { full_name: string | null; email: string | null; phone: string | null; birthday: string | null };

export type MsReward = {
  id: string; name: string; description: string | null; reward_type: string;
  point_cost: number; image_url: string | null; terms?: string | null; images?: string[] | null; category?: string | null;
};

export const getMsProfile = cache(async (userId: string): Promise<MsProfile | null> => {
  const { data } = await createClient().from("profiles").select("full_name, email, phone, birthday").eq("id", userId).maybeSingle();
  return (data as MsProfile | null) ?? null;
});

/** Orders the patient still has open with the practice: the bag badge. */
export const getMsOpenOrderCount = cache(async (businessId: string, userId: string): Promise<number> => {
  const { count } = await createClient()
    .from("medspa_shop_orders").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).eq("user_id", userId).in("status", ["reserved", "paid"]);
  return count ?? 0;
});

/** Active rewards in the catalog, cheapest first. */
export const getMsRewards = cache(async (businessId: string): Promise<MsReward[]> => {
  const { data } = await createClient()
    .from("rewards").select("*").eq("business_id", businessId).eq("is_active", true)
    .eq("show_in_store", true).order("point_cost", { ascending: true });
  return (data ?? []) as MsReward[];
});

export type MsMembership = { view: MembershipView; imageUrl: string | null; isPaid: boolean; isPending: boolean; pendingLabel: string | null; renewsAt: string | null; paidAt: string | null };

export const getMsMembership = cache(async (businessId: string, membershipId: string | null): Promise<MsMembership> => {
  const supabase = createClient();
  const [b, s, m] = await Promise.all([
    supabase.rpc("membership_billing_public", { p_business_id: businessId }),
    supabase.rpc("member_membership_status", { p_business_id: businessId }),
    membershipId
      ? supabase.from("business_memberships").select("membership_payment_status, membership_pending_plan").eq("id", membershipId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const row = ((Array.isArray(b.data) ? b.data[0] : b.data) ?? null) as MembershipRow;
  const paid = ((Array.isArray(s.data) ? s.data[0] : s.data) ?? null) as { is_paid?: boolean; paid_at?: string | null; renewal_due_at?: string | null; expires_at?: string | null } | null;
  const mine = (m as { data: { membership_payment_status?: string | null; membership_pending_plan?: { label?: string } | null } | null }).data;
  const isPaid = !s.error && !!paid?.is_paid;
  return {
    view: readMembership(row),
    imageUrl: (row as { image_url?: string | null } | null)?.image_url ?? null,
    isPaid,
    isPending: !isPaid && mine?.membership_payment_status === "pending",
    pendingLabel: mine?.membership_pending_plan?.label ?? null,
    renewsAt: paid?.expires_at ?? paid?.renewal_due_at ?? null,
    paidAt: paid?.paid_at ?? null,
  };
});

/** Birthday points credited in the last 7 days (process_birthdays), or null. */
export const getMsBirthdayGift = cache(async (membershipId: string | null): Promise<number | null> => {
  if (!membershipId) return null;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await createClient()
    .from("points_ledger").select("delta, created_at").eq("membership_id", membershipId)
    .eq("rule_type", "birthday").gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  const row = (data ?? [])[0] as { delta?: number } | undefined;
  return row?.delta && row.delta > 0 ? row.delta : null;
});

export function firstNameOf(p: MsProfile | null, email: string | null | undefined) {
  return (p?.full_name ?? email?.split("@")[0] ?? "there").split(" ")[0];
}
