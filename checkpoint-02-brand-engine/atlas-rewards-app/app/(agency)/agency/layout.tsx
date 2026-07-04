import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/agency/sidebar";

export const dynamic = "force-dynamic";

export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // CP-62: figure out the agency role so the sidebar can hide the tabs a VA
  // isn't allowed to see (Analytics, Pipeline, Team, Settings).
  const { data: roleRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id)
    .in("role", ["agency_admin", "agency_va"])
    .limit(2);
  const roles = (roleRows ?? []).map(r => r.role as string);
  const agencyRole: "agency_admin" | "agency_va" =
    roles.includes("agency_admin") ? "agency_admin" : "agency_va";

  return (
    <div
      className="min-h-screen flex"
      style={{
        // Soft ocean wash behind the content — gives the white cards more
        // contrast without going all-in on a colored canvas.
        background:
          "linear-gradient(180deg, #eaf3f8 0%, #f1f5f9 35%, #f8fafc 100%)",
      }}
    >
      <Sidebar role={agencyRole} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
