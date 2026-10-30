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
import { EXAMPLE_GIFT } from "@/lib/medspa-example";
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

/* ───────────── CP-212 · automated offers as a scratch card on Home ───────────── */

export type MsScratchGift = {
  /** "member": a per-patient automated gift (welcome, birthday, anniversary,
   *  win-back) already saved by _grant_automated_offer, waiting to be revealed.
   *  "offer": a date-based automated offer (holiday) the patient hasn't claimed.
   *  "demo": CP-213 — demo / mockup apps always show the example gift; it is
   *  never saved, so it comes back on every refresh. */
  kind: "member" | "offer" | "demo";
  savedId: string | null;
  offerId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  voiceUrl: string | null;
  discountType: string | null;
  discountValue: number | null;
  rewardName: string | null;
  expiresAt: string | null;
};

/**
 * The one automated offer the Home scratch card should show, or null.
 * Per-patient gifts win over holiday offers. Points-only holiday offers are
 * skipped (they can't be claimed — save_offer refuses them).
 */
export const getMsScratchGift = cache(async (businessId: string, membershipId: string | null, isDemo = false): Promise<MsScratchGift | null> => {
  const real = await realScratchGift(businessId, membershipId);
  if (real || !isDemo) return real;
  return {
    kind: "demo", savedId: null, offerId: "example-gift", title: EXAMPLE_GIFT.title, description: EXAMPLE_GIFT.description,
    imageUrl: EXAMPLE_GIFT.imageUrl, voiceUrl: null, discountType: "reward", discountValue: null,
    rewardName: EXAMPLE_GIFT.rewardName, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  };
});

async function realScratchGift(businessId: string, membershipId: string | null): Promise<MsScratchGift | null> {
  if (!membershipId) return null;
  const supabase = createClient();
  const { data: g } = await supabase.rpc("my_unrevealed_welcome_gift", { p_business_id: businessId });
  const gift = (Array.isArray(g) ? g[0] : null) as {
    saved_id: string; offer_id: string; title: string; description: string | null; image_url: string | null;
    voice_message_url: string | null; discount_type: string | null; discount_value: number | null;
    gift_reward_name: string | null; expires_at: string | null;
  } | null;
  if (gift?.saved_id) {
    return {
      kind: "member", savedId: gift.saved_id, offerId: gift.offer_id, title: gift.title, description: gift.description,
      imageUrl: gift.image_url, voiceUrl: gift.voice_message_url, discountType: gift.discount_type,
      discountValue: gift.discount_value, rewardName: gift.gift_reward_name, expiresAt: gift.expires_at,
    };
  }

  const now = new Date().toISOString();
  const { data: offers } = await supabase
    .from("offers")
    .select("id, title, description, image_url, voice_message_url, discount_type, discount_value, gift_reward_id, expires_at")
    .eq("business_id", businessId).eq("is_active", true).eq("is_automated", true).is("welcome_config_id", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false }).limit(5);
  const open = ((offers ?? []) as {
    id: string; title: string; description: string | null; image_url: string | null; voice_message_url: string | null;
    discount_type: string | null; discount_value: number | null; gift_reward_id: string | null; expires_at: string | null;
  }[]).filter((o) => (o.discount_type ?? "none") !== "points_bonus");
  if (open.length === 0) return null;

  const { data: mine } = await supabase
    .from("customer_saved_offers").select("offer_id").eq("membership_id", membershipId).in("offer_id", open.map((o) => o.id));
  const claimed = new Set(((mine ?? []) as { offer_id: string }[]).map((r) => r.offer_id));
  const o = open.find((x) => !claimed.has(x.id));
  if (!o) return null;

  let rewardName: string | null = null;
  if (o.gift_reward_id) {
    const { data: r } = await supabase.from("rewards").select("name").eq("id", o.gift_reward_id).maybeSingle();
    rewardName = (r as { name?: string } | null)?.name ?? null;
  }
  return {
    kind: "offer", savedId: null, offerId: o.id, title: o.title, description: o.description, imageUrl: o.image_url,
    voiceUrl: o.voice_message_url, discountType: o.discount_type, discountValue: o.discount_value, rewardName, expiresAt: o.expires_at,
  };
}

export type MsSavedGift = {
  saved_id: string; offer_id: string; title: string; description: string | null; image_url: string | null;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus" | "reward" | null; discount_value: number | null;
  expires_at: string | null; voice_message_url: string | null; redeem_code: string | null; fulfilled_at: string | null;
  saved_at: string | null; gift_reward_id: string | null; gift_reward_name: string | null;
};

/** Claimed, unused, unexpired gifts (codes to show at the desk). */
export const getMsSavedGifts = cache(async (businessId: string): Promise<MsSavedGift[]> => {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("my_saved_offers", { p_business_id: businessId });
  if (error) return [];
  const all = (data ?? []) as MsSavedGift[];
  if (all.length === 0) return all;
  // Per-patient automated gifts stay a surprise until they're scratched on Home.
  const [{ data: rows }, { data: offers }] = await Promise.all([
    supabase.from("customer_saved_offers").select("id, revealed_at").in("id", all.map((g) => g.saved_id)),
    supabase.from("offers").select("id, welcome_config_id").in("id", all.map((g) => g.offer_id)),
  ]);
  const unrevealed = new Set(((rows ?? []) as { id: string; revealed_at: string | null }[]).filter((r) => !r.revealed_at).map((r) => r.id));
  const perPatient = new Set(((offers ?? []) as { id: string; welcome_config_id: string | null }[]).filter((o) => o.welcome_config_id).map((o) => o.id));
  return all.filter((g) => !(perPatient.has(g.offer_id) && unrevealed.has(g.saved_id)));
});
