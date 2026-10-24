import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkflowBuilder } from "@/components/agency/automations/workflow-builder";
import type { BusinessOption } from "@/lib/automations/types";

export const dynamic = "force-dynamic";

/**
 * /agency/automations — CP-216 · the Automation Hub. Admin-only.
 * ?business=<slug> picks the business; defaults to the first real (non-demo)
 * one. Everything else loads client-side through the contract RPCs.
 */
export default async function AgencyAutomations({ searchParams }: { searchParams?: { business?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows || roleRows.length === 0) redirect("/agency");

  const { data: rows } = await supabase
    .from("businesses").select("id, slug, name, layout_preset, is_demo")
    .neq("status", "archived").order("is_demo", { ascending: true }).order("name");
  const businesses: BusinessOption[] = ((rows ?? []) as { id: string; slug: string; name: string; layout_preset: string | null; is_demo: boolean | null }[])
    .map((b) => ({ id: b.id, slug: b.slug, name: b.name, layout_preset: b.layout_preset, is_demo: !!b.is_demo }));
  if (businesses.length === 0) redirect("/agency");

  const wanted = searchParams?.business?.trim();
  const business = (wanted && businesses.find((b) => b.slug === wanted)) || businesses.find((b) => !b.is_demo) || businesses[0];
  return <WorkflowBuilder businesses={businesses} business={business} />;
}
