/**
 * Who is looking at the app: a guest, or a signed-in patient of this clinic.
 *
 * Signed in = a Supabase session (phone + texted code). The first time a
 * patient opens a clinic they are enrolled with the same enroll_member RPC
 * the venue app uses, so points, the desk and reports all keep working.
 *
 * The example clinic never touches the database: "signing in" there sets a
 * demo cookie so a sales demo can show the signed-in app.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import type { Clinic } from "./clinic";
import { readDemoVouchers } from "./vouchers";

export const DEMO_COOKIE = "ms_demo_patient";

export type Patient = {
  signedIn: boolean;
  userId: string | null;
  firstName: string | null;
  fullName: string | null;
  phone: string | null;
  points: number;
  membershipId: string | null;
  isMember: boolean;
  memberSince: string | null;
  /** The plan they joined ("Glow Club"), stamped by the Stripe webhook. */
  planName: string | null;
  /** The patient's check-in code at this clinic (business_memberships.referral_code); the desk scans it. */
  memberCode: string | null;
};

const GUEST: Patient = {
  signedIn: false, userId: null, firstName: null, fullName: null, phone: null,
  points: 0, membershipId: null, isMember: false, memberSince: null, planName: null, memberCode: null,
};

export const getPatient = cache(async (clinic: Clinic): Promise<Patient> => {
  if (clinic.isExample && clinic.id === "example") {
    const raw = cookies().get(DEMO_COOKIE)?.value;
    if (!raw) return GUEST;
    try {
      const d = JSON.parse(decodeURIComponent(raw)) as { name?: string; phone?: string; plan?: string };
      const full = d.name?.trim() || "Alex Rivera";
      return {
        ...GUEST, signedIn: true, fullName: full, firstName: full.split(" ")[0], phone: d.phone ?? null, points: Math.max(0, 240 - readDemoVouchers().reduce((n, v) => n + v.point_cost, 0)), membershipId: "demo",
        isMember: !!d.plan, planName: d.plan ?? null, memberCode: "ALEX24", memberSince: d.plan ? new Date().toISOString() : null,
      };
    } catch { return GUEST; }
  }

  const user = await getCachedUser();
  if (!user) return GUEST;
  const supabase = createClient();

  let { data: m } = await supabase.rpc("my_membership", { p_business_id: clinic.id });
  let mem = (Array.isArray(m) ? m[0] : m) as { id?: string; points_balance?: number; joined_at?: string; referral_code?: string | null } | null;
  if (!mem?.id) {
    // First visit to this clinic: enroll (a write, so only when needed).
    await supabase.rpc("enroll_member", { p_user_id: user.id, p_business_id: clinic.id });
    ({ data: m } = await supabase.rpc("my_membership", { p_business_id: clinic.id }));
    mem = (Array.isArray(m) ? m[0] : m) as typeof mem;
  }

  const [{ data: profile }, status, { data: memRow }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    supabase.rpc("member_membership_status", { p_business_id: clinic.id }),
    mem?.id
      ? supabase.from("business_memberships").select("membership_plan_label").eq("id", mem.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const s = ((Array.isArray(status.data) ? status.data[0] : status.data) ?? null) as { is_paid?: boolean; paid_at?: string | null } | null;
  const full = (profile as { full_name?: string | null } | null)?.full_name?.trim() || null;
  return {
    signedIn: true,
    userId: user.id,
    fullName: full,
    firstName: full ? full.split(" ")[0] : null,
    phone: (profile as { phone?: string | null } | null)?.phone ?? user.phone ?? null,
    points: mem?.points_balance ?? 0,
    membershipId: mem?.id ?? null,
    isMember: !status.error && !!s?.is_paid,
    memberSince: s?.paid_at ?? null,
    memberCode: mem?.referral_code ?? null,
    planName: (memRow as { membership_plan_label?: string | null } | null)?.membership_plan_label ?? null,
  };
});
