import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient, getCachedUser } from "@atlas/core/supabase/server";
import { getClinic } from "@/lib/clinic";
import { DEMO_COOKIE, getPatient } from "@/lib/patient";
import { DEMO_VOUCHERS_COOKIE, readDemoVouchers, type Voucher } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

/**
 * POST /api/<clinic>/redeem  { rewardId } → { code, newBalance }
 * Calls redeem_reward as the signed-in patient (it checks the balance, takes
 * the points and creates the code, all in the database).
 */
export async function POST(req: NextRequest, { params }: { params: { clinic: string } }) {
  const { rewardId } = (await req.json().catch(() => ({}))) as { rewardId?: string };
  const clinic = await getClinic(params.clinic).catch(() => null);
  if (!clinic) return NextResponse.json({ error: "Clinic not found." }, { status: 404 });
  const reward = clinic.rewards.find((r) => r.id === rewardId);
  if (!reward) return NextResponse.json({ error: "That reward isn't available anymore." }, { status: 404 });

  if (clinic.isExample && clinic.id === "example") {
    if (!cookies().get(DEMO_COOKIE)?.value) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const patient = await getPatient(clinic);
    if (patient.points < reward.point_cost) return NextResponse.json({ error: "Not enough points yet." }, { status: 400 });
    const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
    const v: Voucher = { id: `demo_${Date.now()}`, reward_name: reward.name, point_cost: reward.point_cost, code, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() };
    const res = NextResponse.json({ code, newBalance: patient.points - reward.point_cost, expiresAt: v.expires_at });
    res.cookies.set(DEMO_VOUCHERS_COOKIE, encodeURIComponent(JSON.stringify([v, ...readDemoVouchers()].slice(0, 8))), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
    return res;
  }

  const user = await getCachedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const { data, error } = await createClient().rpc("redeem_reward", { p_reward_id: reward.id });
  const row = (Array.isArray(data) ? data[0] : data) as { code?: string; new_balance?: number } | null;
  if (error || !row?.code) {
    const m = (error?.message ?? "").toLowerCase();
    return NextResponse.json({ error: m.includes("point") || m.includes("balance") ? "Not enough points yet." : "Couldn't redeem right now. Please try again." }, { status: 400 });
  }
  return NextResponse.json({ code: row.code, newBalance: row.new_balance ?? null });
}
