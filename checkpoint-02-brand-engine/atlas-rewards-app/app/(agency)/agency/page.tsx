import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgencyDashboardClient } from "@/components/agency/agency-dashboard-client";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function AgencyDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // CP-36: redirect unauthenticated visitors instead of crashing on user!.id
  if (!user) redirect("/login");

  const { data: role } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").maybeSingle();

  if (!role) {
    return (
      <div className="p-10 max-w-md">
        <h1 className="text-xl font-semibold">Not an agency admin</h1>
        <p className="text-muted-foreground mt-2">Promote yourself in business_users with role=agency_admin.</p>
      </div>
    );
  }

  const { data: businesses } = await supabase.from("businesses").select("*").order("created_at", { ascending: false });

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return <AgencyDashboardClient friendlyName={friendlyName} initialBusinesses={(businesses ?? []) as Business[]} />;
}
