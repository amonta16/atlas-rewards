/** MedspaScan — CP-193 · /<slug>/app/scan for med spas: top bar + the shared check-in QR. */
import type { Business, Membership } from "@/lib/types/database";
import { getCachedUser } from "@/lib/supabase/server";
import { ScanClient } from "@/components/customer/scan-client";
import { getMsOpenOrderCount, getMsProfile } from "@/lib/medspa-app/data";
import { MsTopBar } from "./chrome";

export async function MedspaScan({ business, membership }: { business: Business; membership: Membership | null }) {
  const user = await getCachedUser();
  const uid = user?.id ?? "";
  const [profile, bag] = await Promise.all([getMsProfile(uid), getMsOpenOrderCount(business.id, uid)]);
  return (
    <div className="bg-[var(--ms-bg)] pb-4">
      <MsTopBar slug={business.slug} title="Scan" bagCount={bag} />
      <p className="px-5 pt-5 text-[16px] leading-relaxed" style={{ color: "var(--ms-sub)" }}>Show this code at the front desk to collect points for your visit.</p>
      <ScanClient business={business} membership={membership} fullName={profile?.full_name ?? user?.email ?? "Member"} />
    </div>
  );
}
