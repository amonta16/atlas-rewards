import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookkeepingClient } from "@/components/agency/bookkeeping/bookkeeping-client";
import type {
  ExpenseCategory, ExpenseDocument, RecurringBill, ExpenseTransaction, ExpenseSplit,
  MileageEntry, MileageRate, FieldSalesEvent, AgencyAdminLite,
} from "@/lib/types/database";
import { todayInTz, DEFAULT_AGENCY_TZ } from "@/lib/founder-hq";

export const dynamic = "force-dynamic";

/**
 * CP-112: /agency/bookkeeping — internal expense management for the LLC.
 *
 * Admin-only: the role check runs HERE on the server, and every table the
 * page touches is additionally RLS-gated to agency admins (including the
 * private expense-receipts storage bucket). Organizes financial evidence
 * for the accountant — never makes tax determinations.
 */
export default async function AgencyBookkeeping() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!adminRows || adminRows.length === 0) redirect("/agency");

  const [
    { data: categories },
    { data: bills },
    { data: txns },
    { data: splits },
    { data: mileage },
    { data: rates },
    { data: docs },
    { data: events },
    { data: admins },
    { data: businesses },
    { data: billing },
    { data: mrrBiz },
    { data: settings },
  ] = await Promise.all([
    supabase.from("expense_categories").select("*").order("sort", { ascending: true }),
    supabase.from("recurring_bills").select("*").order("next_due_date", { ascending: true }),
    supabase.from("expense_transactions").select("*").order("txn_date", { ascending: false }).limit(2000),
    supabase.from("expense_splits").select("*"),
    supabase.from("mileage_entries").select("*").order("trip_date", { ascending: false }).limit(1000),
    supabase.from("mileage_rates").select("*"),
    supabase.from("expense_documents").select("*"),
    supabase.from("field_sales_events").select("*").order("event_date", { ascending: false }),
    supabase.rpc("list_agency_admins"),
    supabase.from("businesses").select("id, name").order("name", { ascending: true }),
    supabase.rpc("agency_billing_summary"),
    supabase.rpc("agency_mrr_by_business"),
    supabase.from("agency_settings").select("agency_timezone").eq("id", 1).maybeSingle(),
  ]);

  const tz = (settings?.agency_timezone as string) || DEFAULT_AGENCY_TZ;
  const todayIso = todayInTz(tz);
  const billingRow: any = Array.isArray(billing) ? billing[0] : billing;

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <BookkeepingClient
      friendlyName={friendlyName}
      todayIso={todayIso}
      liveMrrCents={Number(billingRow?.mrr_cents ?? 0)}
      activeClients={Number(billingRow?.active_subscriptions ?? 0)}
      initialCategories={(categories ?? []) as ExpenseCategory[]}
      initialBills={(bills ?? []) as RecurringBill[]}
      initialTxns={(txns ?? []) as ExpenseTransaction[]}
      initialSplits={(splits ?? []) as ExpenseSplit[]}
      initialMileage={(mileage ?? []) as MileageEntry[]}
      initialRates={(rates ?? []) as MileageRate[]}
      initialDocs={(docs ?? []) as ExpenseDocument[]}
      events={(events ?? []) as FieldSalesEvent[]}
      admins={(admins ?? []) as AgencyAdminLite[]}
      businesses={(businesses ?? []) as { id: string; name: string }[]}
      mrrByBusiness={(mrrBiz ?? []) as { business_id: string; business_name: string; monthly_cents: number; status: string }[]}
    />
  );
}
