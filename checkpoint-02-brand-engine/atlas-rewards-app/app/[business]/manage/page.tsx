import { createClient } from "@/lib/supabase/server";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ManagerHome({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  // Recent ledger entries for the activity log. CP-42: also pull the
  // member's name so the front-desk sees WHO each transaction is for.
  // Two-step join (ledger → memberships → profiles) avoids relying on
  // PostgREST relationship inference which can be flaky on this table.
  const { data: recentRaw } = await supabase
    .from("points_ledger")
    .select("id, delta, rule_type, notes, created_at, membership_id")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const membershipIds = Array.from(
    new Set((recentRaw ?? []).map((r: any) => r.membership_id).filter(Boolean)),
  );

  // CP-37.20 — was querying `memberships` (table doesn't exist) +
  // relying on a fragile PostgREST FK alias. Both silently failed, so
  // EVERY ledger row fell back to "Guest". Now we do a clean two-step:
  //   1) business_memberships → user_id per membership
  //   2) profiles → full_name / email per user_id
  // Then stitch the name back onto each ledger row.
  let nameByMembership = new Map<string, string>();
  if (membershipIds.length > 0) {
    const { data: members } = await supabase
      .from("business_memberships")
      .select("id, user_id")
      .in("id", membershipIds);
    const userIdByMembership = new Map<string, string>();
    const userIds: string[] = [];
    for (const m of (members ?? []) as any[]) {
      if (m.user_id) {
        userIdByMembership.set(m.id, m.user_id);
        userIds.push(m.user_id);
      }
    }
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(new Set(userIds)));
      const nameByUser = new Map<string, string>();
      for (const p of (profiles ?? []) as any[]) {
        const name =
          (p.full_name && String(p.full_name).trim()) ||
          p.email ||
          null;
        if (name) nameByUser.set(p.id, name);
      }
      for (const [mid, uid] of userIdByMembership.entries()) {
        const n = nameByUser.get(uid);
        if (n) nameByMembership.set(mid, n);
      }
    }
  }

  const recent = (recentRaw ?? []).map((r: any) => ({
    ...r,
    customer_name: r.membership_id ? nameByMembership.get(r.membership_id) ?? null : null,
  }));

  return <ManagerDashboard business={business} recent={recent} />;
}
