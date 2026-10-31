/**
 * Automated gifts (welcome, birthday, anniversary, win-back, holiday offers),
 * same data as the venue app's med spa Home (CP-212/224):
 *  · getScratchGift: the ONE gift the Home scratch card shows, or null.
 *  · getSavedGifts: claimed, unused gifts with their desk codes (Rewards).
 */
import { cache } from "react";
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import { EXAMPLE_GIFT } from "./example";
import type { Clinic } from "./clinic";

export type MsScratchGift = {
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

export type SavedGift = { saved_id: string; offer_id: string; title: string; redeem_code: string | null; expires_at: string | null; gift_reward_name: string | null };

const isDemo = (c: Clinic) => c.isExample && c.id === "example";

export const getScratchGift = cache(async (clinic: Clinic, membershipId: string | null): Promise<MsScratchGift | null> => {
  if (isDemo(clinic)) {
    return {
      kind: "demo", savedId: null, offerId: "example-gift", title: EXAMPLE_GIFT.title, description: EXAMPLE_GIFT.description,
      imageUrl: EXAMPLE_GIFT.imageUrl, voiceUrl: null, discountType: "reward", discountValue: null,
      rewardName: EXAMPLE_GIFT.rewardName, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };
  }
  if (!clinic.offersOn || !membershipId) return null;
  const supabase = createClient();
  const { data: g } = await supabase.rpc("my_unrevealed_welcome_gift", { p_business_id: clinic.id });
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
  // Holiday / dated automated offers the patient hasn't claimed. Points-only ones can't be claimed (save_offer refuses them).
  const now = new Date().toISOString();
  const { data: offers } = await supabase.from("offers")
    .select("id, title, description, image_url, voice_message_url, discount_type, discount_value, gift_reward_id, expires_at")
    .eq("business_id", clinic.id).eq("is_active", true).eq("is_automated", true).is("welcome_config_id", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`).order("created_at", { ascending: false }).limit(5);
  type O = { id: string; title: string; description: string | null; image_url: string | null; voice_message_url: string | null; discount_type: string | null; discount_value: number | null; gift_reward_id: string | null; expires_at: string | null };
  const open = ((offers ?? []) as O[]).filter((o) => (o.discount_type ?? "none") !== "points_bonus");
  if (!open.length) return null;
  const { data: mine } = await supabase.from("customer_saved_offers").select("offer_id").eq("membership_id", membershipId).in("offer_id", open.map((o) => o.id));
  const claimed = new Set(((mine ?? []) as { offer_id: string }[]).map((r) => r.offer_id));
  const o = open.find((x) => !claimed.has(x.id));
  if (!o) return null;
  let rewardName: string | null = null;
  if (o.gift_reward_id) {
    const { data: r } = await supabase.from("rewards").select("name").eq("id", o.gift_reward_id).maybeSingle();
    rewardName = (r as { name?: string } | null)?.name ?? null;
  }
  return { kind: "offer", savedId: null, offerId: o.id, title: o.title, description: o.description, imageUrl: o.image_url,
    voiceUrl: o.voice_message_url, discountType: o.discount_type, discountValue: o.discount_value, rewardName, expiresAt: o.expires_at };
});

export async function getSavedGifts(clinic: Clinic): Promise<SavedGift[]> {
  if (isDemo(clinic)) return [];
  const user = await getCachedUser().catch(() => null);
  if (!user) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("my_saved_offers", { p_business_id: clinic.id });
  if (error) return [];
  const all = ((data ?? []) as (SavedGift & { fulfilled_at: string | null })[])
    .filter((g) => !g.fulfilled_at && (!g.expires_at || new Date(g.expires_at).getTime() > Date.now()));
  if (!all.length) return [];
  // Per-patient gifts stay a surprise until they're scratched on Home.
  const [{ data: rows }, { data: offers }] = await Promise.all([
    supabase.from("customer_saved_offers").select("id, revealed_at").in("id", all.map((g) => g.saved_id)),
    supabase.from("offers").select("id, welcome_config_id").in("id", all.map((g) => g.offer_id)),
  ]);
  const unrevealed = new Set(((rows ?? []) as { id: string; revealed_at: string | null }[]).filter((r) => !r.revealed_at).map((r) => r.id));
  const perPatient = new Set(((offers ?? []) as { id: string; welcome_config_id: string | null }[]).filter((o) => o.welcome_config_id).map((o) => o.id));
  return all.filter((g) => !(perPatient.has(g.offer_id) && unrevealed.has(g.saved_id)));
}
