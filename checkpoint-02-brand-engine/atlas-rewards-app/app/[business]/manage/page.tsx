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

  let nameByMembership = new Map<string, string>();
  if (membershipIds.length > 0) {
    const { data: members } = await supabase
      .from("memberships")
      .select("id, user_id, profiles:profiles!memberships_user_id_fkey(full_name, email)")
      .in("id", membershipIds);
    for (const m of (members ?? []) as any[]) {
      const name =
        (m.profiles?.full_name && String(m.profiles.full_name).trim()) ||
        m.profiles?.email ||
        null;
      if (name) nameByMembership.set(m.id, name);
    }
  }

  const recent = (recentRaw ?? []).map((r: any) => ({
    ...r,
    customer_name: r.membership_id ? nameByMembership.get(r.membership_id) ?? null : null,
  }));

  return <ManagerDashboard business={business} recent={recent} />;
}
