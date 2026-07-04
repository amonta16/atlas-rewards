import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppsAdminClient } from "@/components/agency/apps-admin-client";
import type { Business, BusinessFolder } from "@/lib/types/database";
import type { DeleteRequest } from "@/components/agency/delete-requests-panel";

export const dynamic = "force-dynamic";

/**
 * CP-60: /agency is the Apps command deck (folders + app tiles).
 * CP-62: also open to the new `agency_va` role. VAs get the same deck but
 * can't delete a business — the trash button files a delete request that
 * an admin approves here. Admins see the pending-requests panel up top.
 */
export default async function AgencyApps() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // CP-62: accept agency_admin OR agency_va. `limit(1)` stays tolerant of
  // duplicate rows (CP-37.9).
  const { data: roleRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id)
    .in("role", ["agency_admin", "agency_va"])
    .limit(2);

  const roles = (roleRows ?? []).map(r => r.role as string);
  const isAdmin = roles.includes("agency_admin");
  const isVa = !isAdmin && roles.includes("agency_va");

  if (!isAdmin && !isVa) {
    return (
      <div className="p-10 max-w-md">
        <h1 className="text-xl font-semibold">Not an agency user</h1>
        <p className="text-muted-foreground mt-2">
          Ask an admin to add you in business_users with role=agency_admin or agency_va.
        </p>
      </div>
    );
  }

  const role: "agency_admin" | "agency_va" = isAdmin ? "agency_admin" : "agency_va";

  const [{ data: businesses }, { data: folders }, { data: requests }] = await Promise.all([
    supabase.from("businesses").select("*").order("created_at", { ascending: false }),
    supabase.from("business_folders").select("*").order("sort", { ascending: true }).order("name", { ascending: true }),
    // Admin: every request. VA: RLS returns only their own (used to badge tiles).
    supabase.rpc("list_business_delete_requests"),
  ]);

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <AppsAdminClient
      role={role}
      friendlyName={friendlyName}
      initialBusinesses={(businesses ?? []) as Business[]}
      initialFolders={(folders ?? []) as BusinessFolder[]}
      initialDeleteRequests={(requests ?? []) as DeleteRequest[]}
    />
  );
}
