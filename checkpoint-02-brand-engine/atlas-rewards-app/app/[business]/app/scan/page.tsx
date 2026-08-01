import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { ScanClient } from "@/components/customer/scan-client";
import { CheckinCountdownChip } from "@/components/customer/checkin-countdown-chip";

export const dynamic = "force-dynamic";

export default async function ScanTab({ params }: { params: { business: string } }) {
  // CP-89: request-memoized — dedupes with the app layout's fetches.
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const supabase = createClient();
  const mem = await getMyMembership(business.id);

  const user = await getCachedUser();
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
