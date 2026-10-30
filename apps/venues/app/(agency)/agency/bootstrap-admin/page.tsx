import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * /agency/bootstrap-admin — CP-37.8, neutralized in CP-110.
 *
 * This was a one-time self-bootstrap tool: whoever visited it could
 * promote their own account to agency_admin via the
 * bootstrap_self_agency_admin RPC. CP-110's audit found that RPC was
 * granted to `authenticated`, so ANY signed-in user (any customer)
 * could call it and take over the platform. The RPC's EXECUTE grant is
 * revoked in cp110_security_hardening.sql; this page is now a
 * server-gated no-op kept only so the old link doesn't 404. A future
 * agency admin is bootstrapped from the Supabase SQL editor, not here.
 */
export default async function BootstrapAdminPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id)
    .in("role", ["agency_admin", "agency_va"])
    .limit(1);

  // Non-agency users have no business on this page at all.
  if (!roles || roles.length === 0) redirect("/agency");

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-lg mx-auto">
        <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b bg-gradient-to-r from-zinc-50 to-white">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 text-zinc-700" />
              <h1 className="text-lg font-extrabold">Bootstrap agency admin</h1>
            </div>
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
              This self-promotion tool has been retired for security. Agency
              admins are now provisioned from the Supabase SQL editor.
            </p>
          </div>
          <div className="px-6 py-5">
            <Link
              href="/agency"
              className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-700 hover:text-zinc-900"
            >
              Go to /agency <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
