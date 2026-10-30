/**
 * MedspaFrame — CP-193 · the med spa app's own layout
 *
 * app/[business]/app/layout.tsx hands med spas here right after auth and
 * enrollment, so none of the venue layout runs for them: no waiver gate RPC,
 * no featured-offer banner, no streak/spin plumbing, no house promos. That is
 * fewer round-trips per tab and one place to change the med spa app without
 * touching any other template.
 *
 * Kept from the shared layout: points celebrations, install prompt,
 * announcements. (CP-212: the welcome-gift pop-up became the Home scratch card.)
 */
import type { Business, Membership } from "@/lib/types/database";
import { getCachedUser } from "@/lib/supabase/server";
import { CelebrateWatcher } from "@/components/customer/celebrate-watcher";
import { PWAInstall } from "@/components/customer/pwa-install";
import { AnnouncementBanner } from "@/components/customer/announcement-banner";
import { msFontClass } from "@/lib/medspa-app/font";
import { getMsProfile, getMsRewards } from "@/lib/medspa-app/data";
import { MsTabBar } from "./chrome";
import { TrackOpen } from "./track-open";

export async function MedspaFrame({ business, membership, children }: { business: Business; membership: Membership | null; children: React.ReactNode }) {
  const user = await getCachedUser();
  const [profile, rewards] = await Promise.all([
    user ? getMsProfile(user.id) : Promise.resolve(null),
    getMsRewards(business.id),
  ]);
  const points = membership?.points_balance ?? 0;
  const dots = {
    rewards: rewards.some((r) => r.point_cost <= points),
    profile: !!profile && (!profile.birthday || !profile.phone),
  };
  const { primary, secondary } = business.brand_colors;

  return (
    <div
      className={`ms-app ${msFontClass} relative mx-auto min-h-screen max-w-md`}
      style={{ ["--ms-p" as string]: primary, paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <CelebrateWatcher businessName={business.name} primary={primary} membershipId={membership?.id ?? null} businessId={business.id} />
      <TrackOpen businessId={business.id} enabled={!!membership} />
      <PWAInstall primary={primary} businessName={business.name} />
      <AnnouncementBanner businessId={business.id} primary={primary} secondary={secondary} />
      {/* CP-212: no reveal pop-up for med spas; automated offers are a scratch card on Home (scratch-gift.tsx). */}
      <main style={{ paddingBottom: "calc(6.75rem + env(safe-area-inset-bottom, 0px))" }}>{children}</main>
      <MsTabBar slug={business.slug} dots={dots} />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto max-w-md bg-white" style={{ height: "env(safe-area-inset-top, 0px)" }} />
    </div>
  );
}
