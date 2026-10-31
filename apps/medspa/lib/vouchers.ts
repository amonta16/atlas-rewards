/**
 * Rewards a patient has redeemed but not used yet ("vouchers").
 * redeem_reward takes the points and creates a code; the front desk scans
 * the QR (or types the code) and fulfills it, same as the venue app.
 */
import { cookies } from "next/headers";
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import type { Clinic } from "./clinic";

export const DEMO_VOUCHERS_COOKIE = "ms_demo_vouchers";

export type Voucher = { id: string; reward_name: string; point_cost: number; code: string; created_at: string; expires_at: string | null };

export function readDemoVouchers(): Voucher[] {
  try { return JSON.parse(decodeURIComponent(cookies().get(DEMO_VOUCHERS_COOKIE)?.value ?? "[]")); } catch { return []; }
}

export async function getVouchers(clinic: Clinic): Promise<Voucher[]> {
  if (clinic.isExample && clinic.id === "example") return readDemoVouchers();
  const user = await getCachedUser().catch(() => null);
  if (!user) return [];
  const { data } = await createClient().rpc("my_redemptions", { p_business_id: clinic.id });
  const now = Date.now();
  return ((data ?? []) as (Voucher & { status: string })[])
    .filter((r) => r.status === "pending" && (!r.expires_at || new Date(r.expires_at).getTime() > now))
    .map(({ id, reward_name, point_cost, code, created_at, expires_at }) => ({ id, reward_name, point_cost, code, created_at, expires_at }));
}
