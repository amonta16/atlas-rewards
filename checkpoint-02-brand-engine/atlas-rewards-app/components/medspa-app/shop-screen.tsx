/**
 * MedspaShop — CP-193 · /<slug>/app/store for med spas (Dermis Shop)
 *
 * Browse · <membership name> · Treatments, with the membership living inside
 * the Shop (Dermis keeps it there too). The bag icon opens "Your orders"
 * (?tab=mine). Item → detail sheet → Checkout screen → Stripe on the
 * practice's connected account, or reserve-and-pay-at-the-desk.
 */
import type { Business, Membership } from "@/lib/types/database";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { liveStripeAccount } from "@/lib/payments/accounts";
import { bookingEnabled } from "@/lib/booking";
import { readMedspaConfig, type ShopOrderRow } from "@/lib/medspa";
import { getMsMembership, getMsOpenOrderCount } from "@/lib/medspa-app/data";
import { MedspaShopClient } from "./shop-client";

export async function MedspaShop({ business, membership, searchParams }: {
  business: Business; membership: Membership | null;
  searchParams: { tab?: string; item?: string; paid?: string; cancelled?: string };
}) {
  const cfg = readMedspaConfig(business.medspa_config);
  const user = await getCachedUser();
  const uid = user?.id ?? "";
  const [ms, bag, { data: orders }, connected] = await Promise.all([
    getMsMembership(business.id, membership?.id ?? null),
    getMsOpenOrderCount(business.id, uid),
    createClient().from("medspa_shop_orders").select("*").eq("business_id", business.id).eq("user_id", uid)
      .in("status", ["pending", "reserved", "paid", "fulfilled"]).order("created_at", { ascending: false }).limit(40),
    cfg.shop.pay_mode === "stripe" ? liveStripeAccount(business.id) : Promise.resolve(null),
  ]);

  return (
    <MedspaShopClient
      business={business}
      userId={uid}
      membershipId={membership?.id ?? null}
      shop={cfg.shop}
      treatments={cfg.treatments.filter((t) => t.is_active)}
      orders={(orders ?? []) as ShopOrderRow[]}
      membershipInfo={ms}
      payOnline={!!connected}
      canBook={bookingEnabled(business)}
      bagCount={bag}
      initial={{ tab: searchParams.tab ?? null, item: searchParams.item ?? null, flash: searchParams.paid ? "paid" : searchParams.cancelled ? "cancelled" : null }}
    />
  );
}
