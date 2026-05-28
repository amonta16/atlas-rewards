/**
 * Agency Team page — CP-31 / CP-32
 *
 * Lists agency-admin team members + pending invitations. Andrew is the
 * always-present root admin; this page is where he adds assistant admins.
 *
 * CP-32: also shows every per-business team member across the whole
 * agency (managers + front-desk), grouped by business. Inviting a
 * manager or front-desk from this page is supported via the modal's
 * new business picker.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Shield, Users2 } from "lucide-react";
import { TeamMembers } from "@/components/team/team-members";
import { AllBusinessTeams } from "@/components/team/all-business-teams";

export const dynamic = "force-dynamic";

export default async function AgencyTeamPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdminData } = await supabase.rpc("is_agency_admin");
  const isAdmin = (typeof isAdminData === "boolean" ? isAdminData : (isAdminData as any)?.[0]) === true;
  if (!isAdmin) redirect("/agency");

  return (
    <div className="px-6 lg:px-10 py-8 w-full">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agency team</h1>
          <p className="text-sm text-muted-foreground">
            Invite assistant admins, managers, and front-desk staff for any business.
          </p>
        </div>
      </div>

      {/* Agency admins (no business scope) */}
      <section className="mt-8 rounded-3xl bg-white shadow-sm ring-1 ring-zinc-100 p-6">
        <TeamMembers
          businessId={null}
          callerRole="agency_admin"
          primary="#0ea5e9"
        />
      </section>

      {/* CP-32: every team member across every business, grouped */}
      <section className="mt-8 rounded-3xl bg-white shadow-sm ring-1 ring-zinc-100 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Users2 className="h-4 w-4 text-zinc-500" />
          <h2 className="font-semibold">Managers & front-desk across every business</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Everyone with sign-in access to any of your sub-accounts.
        </p>
        <AllBusinessTeams />
      </section>
    </div>
  );
}
