/**
 * A patient's Shop purchases at one clinic (medspa_shop_orders, CP-190).
 * Patients can read their own rows (RLS medspa_orders_self_read).
 */
import { cookies } from "next/headers";
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import type { ShopKind, ShopOrderRow } from "./medspa";
import type { Clinic } from "./clinic";

export const DEMO_ORDERS_COOKIE = "ms_demo_orders";

export type DemoOrder = {
  id: string; item_name: string; kind: ShopKind; quantity: number; amount_cents: number;
  sessions_total: number | null; gift_code: string | null; recipient_name: string | null; created_at: string;
};

export type Purchase = Pick<ShopOrderRow,
  "id" | "item_name" | "kind" | "quantity" | "amount_cents" | "status" | "pay_method" | "sessions_total" | "sessions_used" |
  "gift_code" | "gift_balance_cents" | "recipient_name" | "created_at">;

export async function getPurchases(clinic: Clinic): Promise<Purchase[]> {
  if (clinic.isExample && clinic.id === "example") {
    let list: DemoOrder[] = [];
    try { list = JSON.parse(decodeURIComponent(cookies().get(DEMO_ORDERS_COOKIE)?.value ?? "[]")); } catch { /* none */ }
    return list.map((o) => ({ ...o, status: "paid", pay_method: "stripe", sessions_used: 0, gift_balance_cents: o.gift_code ? o.amount_cents : null }));
  }
  const user = await getCachedUser();
  if (!user) return [];
  const { data } = await createClient().from("medspa_shop_orders")
    .select("id, item_name, kind, quantity, amount_cents, status, pay_method, sessions_total, sessions_used, gift_code, gift_balance_cents, recipient_name, created_at")
    .eq("business_id", clinic.id).eq("user_id", user.id)
    .in("status", ["pending", "reserved", "paid", "fulfilled", "refunded"])
    .order("created_at", { ascending: false }).limit(40);
  return (data ?? []) as Purchase[];
}
