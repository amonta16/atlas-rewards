import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AgencyPipeline } from "@/components/agency/agency-pipeline";

export const dynamic = "force-dynamic";

export default async function AgencyPipelinePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <AgencyPipeline />;
}
