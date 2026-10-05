/**
 * /<slug>/app/store — CP-190 · med spa Shop
 *
 * Packages, skincare and gift cards from businesses.medspa_config.shop,
 * the practice's membership as its own section, and the patient's own
 * purchases (package sessions left, gift card codes, pickups). Only the
 * medspa layout links here; other layouts get notFound(). The existing
 * /shop route stays the points-rewards catalog for every business.
 */
import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { resolvePreset } from "@/lib/layout-presets";
import { readMedspaConfig, type ShopOrderRow } from "@/lib/medspa";
import { liveStripeAccount } from "@/lib/payments/accounts";
import { MembershipHub } from "@/components/customer/membership-hub";
import { StoreClient } from "./store-client";

export const dynamic = "force-dynamic";

export default async function StorePage({ params, searchParams }: { params: { business: string }; searchParams: { tab?: string; order?: string; paid?: string; cancelled?: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business || resolvePreset(business.layout_preset) !== "medspa") notFound();
  const cfg = readMedspaConfig(business.medspa_config);
  const supabase = createClient();
  const user = await getCachedUser();
  const [mem, { data: orders }, { data: bm }, connected] = await Promise.all([
    getMyMembership(business.id),
    user
      ? supabase.from("medspa_shop_orders").select("*").eq("business_id", business.id).eq("user_id", user.id).in("status", ["pending", "reserved", "paid", "fulfilled"]).order("created_at", { ascending: false }).limit(40)
      : Promise.resolve({ data: [] as ShopOrderRow[] }),
    user
      ? supabase.from("business_memberships").select("membership_payment_status").eq("business_id", business.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    cfg.shop.pay_mode === "stripe" ? liveStripeAccount(business.id) : Promise.resolve(null),
  ]);
  const isMember = (bm as { membership_payment_status?: string } | null)?.membership_payment_status === "paid";

  return (
    <StoreClient
      business={business}
      shop={cfg.shop}
      treatments={cfg.treatments}
      orders={(orders ?? []) as ShopOrderRow[]}
      isMember={isMember}
      payOnline={!!connected}
      initialTab={searchParams.tab ?? null}
      flash={searchParams.paid ? "paid" : searchParams.cancelled ? "cancelled" : null}
      membership={user ? <MembershipHub business={business} membership={mem} userId={user.id} standalone /> : null}
    />
  );
}
