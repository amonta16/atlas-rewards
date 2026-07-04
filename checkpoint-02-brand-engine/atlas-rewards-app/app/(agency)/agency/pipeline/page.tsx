import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgencyPipeline } from "@/components/agency/agency-pipeline";

export const dynamic = "force-dynamic";

export default async function AgencyPipelinePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // CP-62: Pipeline is admin-only — VAs are bounced back to the Apps deck.
  const { data: adminRows } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!adminRows || adminRows.length === 0) redirect("/agency");

  return <AgencyPipeline />;
}
