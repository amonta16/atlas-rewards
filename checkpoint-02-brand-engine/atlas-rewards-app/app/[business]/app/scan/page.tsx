import { createClient } from "@/lib/supabase/server";
import { ScanClient } from "@/components/customer/scan-client";
import { CheckinCountdownChip } from "@/components/customer/checkin-countdown-chip";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function ScanTab({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const mem = (memRows?.[0] ?? null) as Membership | null;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();

  return (
    <>
      {/* CP-52.4: header now global (app shell) — removed the per-tab copy. */}
      {/* CP-39: subtle countdown chip above the QR — small enough to
          stay deferential to the QR (which is the hero), informative
          enough to answer "can I scan now?" at a glance. */}
      <CheckinCountdownChip
        businessId={business.id}
        membershipId={mem?.id ?? null}
        primary={business.brand_colors.primary}
      />
      <ScanClient business={business} membership={mem} fullName={profile?.full_name ?? user!.email ?? "Member"} />
    </>
  );
}
