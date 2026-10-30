import { createClient } from "@/lib/supabase/server";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ManagerHome({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  // CP-110 (security): ManagerDashboard is a client component, so drop the
  // server-only per-business credentials before the row is serialized to
  // the browser (front-desk staff render this surface too). Nothing on the
  // manager dashboard reads these columns.
  const business = { ...(biz as Business), ghl_api_key: null, webhook_secret: null } as Business;

  // Recent ledger entries for the activity log, WITH the member's name.
  //
  // CP-43 — the previous client-side join (ledger → business_memberships
  // → profiles) was silently trimmed by RLS for front-desk (business_staff)
  // viewers: the profiles_staff_read policy only covers businesses the
  // caller *manages*, not ones they're merely staff at, so the name lookup
  // returned nothing and every row fell back to "Guest". We now call the
  // SECURITY DEFINER business_recent_activity RPC, which does the join
  // server-side (RLS-immune) and is itself gated to staff/manager/admin.
  const { data: recentRaw } = await supabase.rpc("business_recent_activity", {
    p_business_id: business.id,
    p_limit: 20,
  });

  const recent = (recentRaw ?? []).map((r: any) => ({
    id: r.id,
    delta: r.delta,
    rule_type: r.rule_type,
    notes: r.notes,
    created_at: r.created_at,
    membership_id: r.membership_id,
    // The RPC already coalesces full_name -> email -> 'Guest'.
    customer_name: r.customer_name ?? null,
  }));

  return <ManagerDashboard business={business} recent={recent} />;
}
