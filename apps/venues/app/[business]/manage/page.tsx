import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import { isMedspaApp } from "@/lib/medspa-app/route";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * One med spa front desk: the soft desk in the med spa app (/<slug>/desk).
 * Everyone who lands here for a med spa (PIN sign-in, old bookmarks, installed
 * desk app) is sent there. The only thing left on this portal for a med spa is
 * the managers' back office the new desk doesn't have yet (Insights + monthly
 * reports, Offers, Atlas Engine, Billing, Membership setup, Bookings), reached
 * with ?settings=1 ("More settings" on the desk) or a deep link to one of them.
 */
const MEDSPA_HOST = (process.env.NEXT_PUBLIC_MEDSPA_HOST ?? "med.atlas-engine.app").replace(/^https?:\/\//, "");
const MEDSPA_ORIGIN = `${MEDSPA_HOST.startsWith("localhost") ? "http" : "https"}://${MEDSPA_HOST}`;
const BACK_OFFICE_TABS = ["reports", "insights", "offers", "campaigns", "billing", "membership", "bookings"];
const DESK_VIEW_FOR_TAB: Record<string, string> = { overview: "overview", desk: "checkin", patients: "patients", shop: "orders", builder: "builder", team: "team" };

export default async function ManagerHome({ params, searchParams }: { params: { business: string }; searchParams: { tab?: string; view?: string; settings?: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();

  let medspaDeskUrl: string | null = null;
  if (biz && isMedspaApp(biz as Business) && process.env.NEXT_PUBLIC_MEDSPA_LIVE !== "0") {
    medspaDeskUrl = `${MEDSPA_ORIGIN}/${params.business}/desk`;
    const { data: roleRaw } = await supabase.rpc("current_app_role", { p_business_id: (biz as Business).id });
    const role = typeof roleRaw === "string" ? roleRaw : Array.isArray(roleRaw) ? roleRaw[0] : null;
    const canSeeBackOffice = role === "business_manager" || role === "agency_admin";
    const wantsBackOffice = !!searchParams.settings || BACK_OFFICE_TABS.includes(searchParams.tab ?? "");
    if (!canSeeBackOffice || !wantsBackOffice) {
      const view = (/^[a-z]+$/.test(searchParams.view ?? "") ? searchParams.view : null) ?? DESK_VIEW_FOR_TAB[searchParams.tab ?? ""];
      redirect(view ? `${medspaDeskUrl}?view=${view}` : medspaDeskUrl);
    }
  }
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

  return <ManagerDashboard business={business} recent={recent} medspaDeskUrl={medspaDeskUrl} />;
}
