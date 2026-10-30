import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsClient } from "@/components/agency/analytics-client";
import type {
  PipelineOpportunity, MrrSnapshot, AgencyAdminLite, SalesActivityDay,
  RecurringBill, ExpenseCategory,
} from "@/lib/types/database";
import { todayInTz, DEFAULT_AGENCY_TZ } from "@/lib/founder-hq";

export const dynamic = "force-dynamic";

/**
 * CP-60: dedicated Analytics tab.
 * CP-111: rebuilt as Revenue Analytics — Actual Live MRR vs Potential
 * Pipeline MRR, with the opportunity manager underneath. Admin-only:
 * the role check runs here on the server, and every table this page
 * reads is additionally RLS-gated to agency admins.
 */
export default async function AgencyAnalytics() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows || roleRows.length === 0) redirect("/agency");

  const activitySince = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const snapshotSince = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  const [
    { data: opps },
    { data: snapshots },
    { data: liveDaily },
    { data: billing },
    { data: mrrBiz },
    { data: admins },
    { data: settings },
    { data: activity },
    { data: bizList },
    { data: liveSubs },
    { data: expenseMonthly },
    { data: bkBills },
    { data: bkCategories },
  ] = await Promise.all([
    supabase.from("agency_pipeline").select("*").order("updated_at", { ascending: false }),
    supabase.from("agency_mrr_snapshots").select("*")
      .gte("snapshot_date", snapshotSince).order("snapshot_date", { ascending: true }),
    supabase.rpc("agency_live_mrr_daily", { p_days: 365 }),
    supabase.rpc("agency_billing_summary"),
    supabase.rpc("agency_mrr_by_business"),
    supabase.rpc("list_agency_admins"),
    supabase.from("agency_settings").select("agency_timezone").eq("id", 1).maybeSingle(),
    supabase.from("agency_sales_activity").select("*").gte("activity_date", activitySince),
    supabase.from("businesses").select("id, name").order("name", { ascending: true }),
    supabase.from("agency_billing_subscriptions")
      .select("business_id, status").in("status", ["active", "past_due"]),
    // CP-112: operating-costs section (paid history + active commitments)
    supabase.rpc("agency_expense_monthly", { p_months: 12 }),
    supabase.from("recurring_bills").select("*").eq("status", "active"),
    supabase.from("expense_categories").select("*"),
  ]);

  // Keep today's snapshot current (upsert of today only — never history).
  await supabase.rpc("record_agency_revenue_snapshot"); // errors surface in-page as missing snapshot, never a crash

  const tz = (settings?.agency_timezone as string) || DEFAULT_AGENCY_TZ;
  const todayIso = todayInTz(tz);

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <AnalyticsClient
      friendlyName={friendlyName}
      todayIso={todayIso}
      initialOpps={(opps ?? []) as PipelineOpportunity[]}
      initialSnapshots={(snapshots ?? []) as MrrSnapshot[]}
      initialLiveDaily={(liveDaily ?? []) as { day: string; mrr_cents: number }[]}
      billing={(Array.isArray(billing) ? billing[0] : billing) ?? null}
      mrrByBusiness={(mrrBiz ?? []) as { business_id: string; business_name: string; monthly_cents: number; status: string }[]}
      admins={(admins ?? []) as AgencyAdminLite[]}
      businesses={(bizList ?? []) as { id: string; name: string }[]}
      activity28={(activity ?? []) as SalesActivityDay[]}
      liveBusinessIds={((liveSubs ?? []) as { business_id: string }[]).map(s => s.business_id)}
      expenseMonthly={(expenseMonthly ?? []) as { month_start: string; hosting_cents: number; recurring_cents: number; onetime_cents: number; total_cents: number }[]}
      bkBills={(bkBills ?? []) as RecurringBill[]}
      bkCategories={(bkCategories ?? []) as ExpenseCategory[]}
    />
  );
}
