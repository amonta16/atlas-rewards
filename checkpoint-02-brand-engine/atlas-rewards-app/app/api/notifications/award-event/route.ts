/**
 * POST /api/notifications/award-event — CP-37.20
 *
 * Fires after a successful award_points call from the front-desk.
 * Inspects whether the member just crossed any reward thresholds and,
 * if so, pushes a "Reward unlocked! 🎁" notification via the SAME
 * path the broadcast composer uses (which Andrew confirmed works).
 *
 * This sidesteps the SQL trigger / webhook chain entirely for the
 * most important auto-notification. The trigger is still in the DB
 * as a backup that inserts the in-app row; this route guarantees the
 * phone push fires without depending on Supabase webhooks.
 *
 * Body:
 *   {
 *     business_id: uuid,
 *     membership_id: uuid,
 *     old_balance: number,    // balance BEFORE the award
 *     new_balance: number,    // balance AFTER the award
 *   }
 *
 * Returns: { ok, crossed: [{ reward_name, point_cost }], push_sent }
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    business_id?: string;
    membership_id?: string;
    old_balance?: number;
    new_balance?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const { business_id, membership_id } = body;
  const oldBalance = Number(body.old_balance ?? 0);
  const newBalance = Number(body.new_balance ?? 0);

  if (!business_id || !membership_id) {
    return NextResponse.json({ error: "business_id + membership_id required" }, { status: 400 });
  }
  if (newBalance <= oldBalance) {
    // No-op — balance didn't go up.
    return NextResponse.json({ ok: true, crossed: [], push_sent: 0 });
  }

  // Permission: caller must staff this business (same gate as the
  // award_points RPC, so anyone who could award can also fire this).
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: isStaff } = await server.rpc("staffs_business", { b_id: business_id });
  if (!isStaff) {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  // Look up rewards that were just crossed. CP-87: prize-only rewards
  // (show_in_store=false) can't be redeemed from the store, so crossing
  // their threshold shouldn't fire a "you can now redeem" notification.
  const admin = createAdminClient();
  const { data: crossed } = await admin
    .from("rewards")
    .select("id, name, point_cost")
    .eq("business_id", business_id)
    .eq("is_active", true)
    .eq("show_in_store", true)
    .lte("point_cost", newBalance)
    .gt("point_cost", oldBalance)
    .order("point_cost", { ascending: true });

  const crossings = (crossed ?? []) as Array<{ id: string; name: string; point_cost: number }>;
  if (crossings.length === 0) {
    return NextResponse.json({ ok: true, crossed: [], push_sent: 0 });
  }

  // Find the recipient user_id from membership_id.
  const { data: mem } = await admin
    .from("business_memberships")
    .select("user_id")
    .eq("id", membership_id)
    .maybeSingle();
  const userId = (mem as any)?.user_id as string | undefined;
  if (!userId) {
    return NextResponse.json({ ok: true, crossed: crossings, push_sent: 0 });
  }

  // Look up the business name once so the push body reads nicely.
  const { data: biz } = await admin
    .from("businesses")
    .select("name")
    .eq("id", business_id)
    .maybeSingle();
  const businessName = (biz as any)?.name ?? "your spot";

  // CP-87: ONE notification per award, no matter how many thresholds a
  // big spend clears. A $200 purchase used to fire 4-5 pushes back to
  // back ("Reward unlocked!" × N) — now multiple crossings collapse into
  // a single "You unlocked N rewards" message that names the top few.
  let pushSent = 0;
  {
    const single = crossings.length === 1;
    const title = single ? "Reward unlocked! 🎁" : `You unlocked ${crossings.length} rewards! 🎁`;
    const names = crossings.map(r => r.name);
    const preview = names.slice(0, 3).join(", ");
    const messageBody = single
      ? `You can now redeem ${names[0]} at ${businessName}.`
      : `You can now redeem ${preview}${names.length > 3 ? ` and ${names.length - 3} more` : ""} at ${businessName}.`;

    // (a) In-app row — so the bell badge updates even if push fails.
    try {
      await admin.from("notifications").insert({
        user_id: userId,
        business_id,
        kind: "reward_unlocked",
        title,
        body: messageBody,
        link_path: "/app/rewards",
      });
    } catch (e) {
      console.warn("[award-event] notification insert failed:", (e as any)?.message);
    }

    // (b) Phone push — proven path (matches broadcast / test).
    try {
      const r2 = await sendPushToUsers([userId], {
        title,
        body: messageBody,
        link_path: "/app/rewards",
        kind: "reward_unlocked",
      }, business_id);  // CP-51: scope push to this business only
      pushSent += r2.sent;
    } catch (e) {
      console.warn("[award-event] push failed:", (e as any)?.message);
    }
  }

  return NextResponse.json({
    ok: true,
    crossed: crossings.map(r => ({ reward_name: r.name, point_cost: r.point_cost })),
    push_sent: pushSent,
  });
}
