import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppsAdminClient } from "@/components/agency/apps-admin-client";
import type { Business, BusinessFolder } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * CP-60: /agency is now the Apps command deck (folders + app tiles). The
 * metrics/charts that used to live here moved to /agency/analytics.
 */
export default async function AgencyApps() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // CP-37.9: tolerant `limit(1)` — any agency_admin row = admin, no error even
  // if duplicate rows exist.
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

  const [{ data: businesses }, { data: folders }] = await Promise.all([
    supabase.from("businesses").select("*").order("created_at", { ascending: false }),
    supabase.from("business_folders").select("*").order("sort", { ascending: true }).order("name", { ascending: true }),
  ]);

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <AppsAdminClient
      friendlyName={friendlyName}
      initialBusinesses={(businesses ?? []) as Business[]}
      initialFolders={(folders ?? []) as BusinessFolder[]}
    />
  );
}
