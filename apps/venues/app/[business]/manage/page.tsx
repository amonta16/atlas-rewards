import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManagerDashboard } from "@/components/manager/manager-dashboard";
import { isMedspaApp } from "@/lib/medspa-app/route";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * One med spa front desk: the soft desk in the med spa app (/<slug>/desk). A med
 * spa never renders this portal. Everyone who lands here (PIN sign-in, old
 * bookmarks, installed desk app, the monthly report email, Stripe coming back)
 * goes to the desk screen they were after; the desk handles sign-in and roles.
 */
const MEDSPA_HOST = (process.env.NEXT_PUBLIC_MEDSPA_HOST ?? "med.atlas-engine.app").replace(/^https?:\/\//, "");
const MEDSPA_ORIGIN = `${MEDSPA_HOST.startsWith("localhost") ? "http" : "https"}://${MEDSPA_HOST}`;
const DESK_VIEW_FOR_TAB: Record<string, string> = {
  overview: "overview", desk: "checkin", patients: "patients", shop: "orders", builder: "builder", team: "team",
  insights: "insights", reports: "reports", offers: "offers", campaigns: "marketing", billing: "billing", membership: "memberships",
};

export default async function ManagerHome({ params, searchParams }: { params: { business: string }; searchParams: { tab?: string; view?: string; month?: string; stripe?: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();

  if (biz && isMedspaApp(biz as Business)) {
    const view = (/^[a-z]+$/.test(searchParams.view ?? "") ? searchParams.view : null) ?? DESK_VIEW_FOR_TAB[searchParams.tab ?? ""];
    const q = new URLSearchParams();
    if (view) q.set("view", view);
    if (/^\d{4}-\d{2}$/.test(searchParams.month ?? "")) q.set("month", searchParams.month!);
    if (/^[a-z]+$/.test(searchParams.stripe ?? "")) q.set("stripe", searchParams.stripe!);
    const qs = q.toString();
    redirect(`${MEDSPA_ORIGIN}/${params.business}/desk${qs ? `?${qs}` : ""}`);
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

  return <ManagerDashboard business={business} recent={recent} />;
}
