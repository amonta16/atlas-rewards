import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsClient } from "@/components/agency/analytics-client";

export const dynamic = "force-dynamic";

/**
 * CP-60: dedicated Analytics tab — the KPI header + revenue/portfolio charts
 * that used to sit under the business list on /agency.
 */
export default async function AgencyAnalytics() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roleRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);

  if (!roleRows || roleRows.length === 0) {
    return (
      <div className="p-10 max-w-md">
        <h1 className="text-xl font-semibold">Not an agency admin</h1>
        <p className="text-muted-foreground mt-2">Promote yourself in business_users with role=agency_admin.</p>
      </div>
    );
  }

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return <AnalyticsClient friendlyName={friendlyName} />;
}
