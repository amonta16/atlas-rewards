import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FieldClient } from "./field-client";
import type { FieldApp, RepEarnings } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * /field — Atlas Command Field App (CP-63). Phone-first, agency_admin only
 * (the door-sales reps). VAs and everyone else are bounced.
 */
export default async function FieldPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!adminRows || adminRows.length === 0) redirect("/agency");

  const [{ data: apps }, { data: earnings }] = await Promise.all([
    supabase.rpc("list_field_apps"),
    supabase.rpc("my_rep_earnings"),
  ]);

  const firstName = (user.email?.split("@")[0] ?? "there").replace(/[\W_]+/g, " ").split(" ")[0];
  const friendlyName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  const e = (Array.isArray(earnings) ? earnings[0] : earnings) as RepEarnings | null;

  return (
    <FieldClient
      friendlyName={friendlyName}
      rootDomain={rootDomain}
      initialApps={(apps ?? []) as FieldApp[]}
      initialEarnings={e ?? { monthly_commission_cents: 0, pipeline_commission_cents: 0, won_count: 0, claimed_count: 0 }}
    />
  );
}
