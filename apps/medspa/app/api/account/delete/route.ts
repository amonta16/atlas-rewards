import { NextResponse } from "next/server";
import { createClient } from "@atlas/core/supabase/server";
import { createAdminClient } from "@atlas/core/supabase/admin";

/**
 * POST /api/account/delete { confirm: "DELETE" }
 * Deletes the signed-in person's own account through the shared
 * delete_my_account() function (staff are refused there). That function
 * doesn't touch Stripe, so a plan that would charge again blocks it: checked
 * at every business, because the account is shared by all of them.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BILLING = ["trialing", "active", "past_due", "unpaid", "incomplete"];
const TRY_AGAIN = "We couldn't delete your account just now. Nothing was deleted. Please try again.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  try {
    const { data: subs, error } = await createAdminClient()
      .from("membership_subscriptions")
      .select("businesses(name), business_memberships!inner(user_id)")
      .eq("business_memberships.user_id", user.id)
      .eq("plan_kind", "monthly").neq("provider", "manual").eq("cancel_at_period_end", false)
      .in("status", BILLING);
    if (error) throw error;
    if (subs?.length) {
      const names = Array.from(new Set((subs as unknown as { businesses: { name: string } | null }[]).map((s) => s.businesses?.name).filter(Boolean)));
      return NextResponse.json({ error: `You have an active membership${names.length ? ` at ${names.join(" and ")}` : ""}. Cancel it first so you aren't charged again, then delete your account.` }, { status: 409 });
    }
    const { error: del } = await supabase.rpc("delete_my_account");
    if (del) {
      if (/staff accounts/i.test(del.message)) return NextResponse.json({ error: "Staff accounts can't be deleted here. Ask your clinic's manager to remove you first." }, { status: 403 });
      throw del;
    }
  } catch (e) {
    console.error("[account delete] failed:", (e as { message?: string })?.message);
    return NextResponse.json({ error: TRY_AGAIN }, { status: 500 });
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return NextResponse.json({ ok: true });
}
