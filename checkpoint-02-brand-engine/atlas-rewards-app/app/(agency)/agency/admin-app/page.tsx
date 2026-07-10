import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminAppClient } from "@/components/agency/admin-app-client";
import type { RepLeaderRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * /agency/admin-app — configure hub for the mobile Field App (CP-63).
 * Admin-only (VAs are bounced).
 */
export default async function AdminAppPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!adminRows || adminRows.length === 0) redirect("/agency");

  const [{ data: config }, { data: leaderboard }] = await Promise.all([
    supabase.from("admin_app_config").select("owner_user_id, default_commission_pct").eq("id", 1).maybeSingle(),
    supabase.rpc("rep_leaderboard"),
  ]);

  const ownerId = (config?.owner_user_id as string | null) ?? null;
  let ownerEmail: string | null = null;
  if (ownerId) {
    const { data: prof } = await supabase.from("profiles").select("email, full_name").eq("id", ownerId).maybeSingle();
    ownerEmail = (prof?.full_name as string) || (prof?.email as string) || null;
  }

  return (
    <AdminAppClient
      myUserId={user.id}
      myEmail={user.email ?? ""}
      initialOwnerId={ownerId}
      ownerEmail={ownerEmail}
      initialDefaultPct={Number(config?.default_commission_pct ?? 30)}
      leaderboard={(leaderboard ?? []) as RepLeaderRow[]}
    />
  );
}
