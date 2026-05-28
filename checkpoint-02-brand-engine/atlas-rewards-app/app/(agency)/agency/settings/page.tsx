import { createClient } from "@/lib/supabase/server";
import { AgencySettingsClient } from "@/components/agency/agency-settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("agency_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return (
    <AgencySettingsClient
      initial={settings ?? {
        id: 1,
        stripe_account_id: null,
        default_setup_fee_cents: 50000,
        default_monthly_cents:   19900,
        support_email: null,
        support_url:   null,
      }}
    />
  );
}
