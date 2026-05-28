import { createClient } from "@/lib/supabase/server";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ManagerHome({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  // Recent ledger entries for the activity log
  const { data: recent } = await supabase
    .from("points_ledger")
    .select("id, delta, rule_type, notes, created_at, membership_id")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return <ManagerDashboard business={business} recent={recent ?? []} />;
}
