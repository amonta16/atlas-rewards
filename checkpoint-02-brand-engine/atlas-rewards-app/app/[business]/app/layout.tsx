import { redirect, notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getFeaturedOffer, getMyMembership } from "@/lib/data/customer-app";
import { CustomerAppShell } from "@/components/customer/app-shell";
import { CelebrateWatcher } from "@/components/customer/celebrate-watcher";
import { PWAInstall } from "@/components/customer/pwa-install";
import { FeaturedOfferBanner } from "@/components/customer/featured-offer-banner";
// CP-86: business-wide announcement banner (manager-posted, dismissible).
import { AnnouncementBanner } from "@/components/customer/announcement-banner";
import { OfferRevealWatcher } from "@/components/customer/offer-reveal-watcher";
import { patternStyle, readableTextColor } from "@/lib/patterns";
import { designVars } from "@/lib/design-styles";
import { CustomerHeader } from "@/components/customer/customer-header";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function CustomerAppLayout({
  children, params,
}: { children: React.ReactNode; params: { business: string } }) {
  // CP-89: request-memoized — the page and metadata share these lookups.
  const user = await getCachedUser();
  // CP-45: slug-prefixed so path-based access (/<slug>/app, used by the
  // agency live preview + "Customer app" button) lands on this business's
  // login instead of 404ing. Subdomain access also resolves correctly.
  if (!user) redirect(`/${params.business}/login`);

  const business = await getBusinessBySlug(params.business);
  if (!business) notFound(); // CP-36: invalid slug → 404 instead of crash

  // CP-89: enroll_member is a WRITE and used to run on EVERY page view of
  // every tab. For an existing member it only ever backfilled a missing
  // referral_code (verified in checkpoint-25/01_enrollment_hardening.sql —
  // it touches no activity timestamps), so it's now gated: run it only for
  // brand-new members or a membership missing its code, then re-fetch
  // fresh (bypassing the request memo, which would hand back the pre-enroll
  // null).
  const supabase = createClient();
  let membership: Membership | null = await getMyMembership(business.id);
  if (!membership || !membership.referral_code) {
    await supabase.rpc("enroll_member", { p_user_id: user.id, p_business_id: business.id });
    const { data: fresh } = await supabase.rpc("my_membership", { p_business_id: business.id });
    membership = ((fresh as Membership[] | null)?.[0] ?? null);
  }
  const membershipId = membership?.id ?? null;

  // CP-52.4: is a paid membership live? Gates the VIP quick-action in the
  // shared header (same as the Home page does).
  // CP-21: the featured offer loads once at the layout level so the sticky
  // banner persists across every tab. CP-89: both fetches run in parallel,
  // and featured_offer is request-memoized (the Home page reuses it free).
  const [{ data: billing }, bannerOffer] = await Promise.all([
    supabase.rpc("membership_billing_public", { p_business_id: business.id }),
    getFeaturedOffer(business.id),
  ]);
  const billingRow = (Array.isArray(billing) ? billing[0] : billing) as { is_enabled?: boolean } | null;
  const vipEnabled = !!billingRow?.is_enabled;

  // CP-52: faint tiled background pattern (Design picker) for a warmer feel.
  // CP-54: customizable surface (page) + header colors. Default light when
  // unset. Content cards stay white; on-bg text auto-flips for contrast.
  const surfaceColor = business.surface_color ?? null;
  const headerColor = business.header_color ?? null;
  const bgStyle = patternStyle(
    business.background_pattern,
    // CP-57: pattern tint is customizable; defaults to the brand primary.
    business.pattern_color ?? business.brand_colors.primary,
    business.logo_url,
    business.brand_colors.secondary,
    business.brand_colors.accent,
    surfaceColor,
  );
  const surfaceFg = readableTextColor(surfaceColor);
  // CP-103.2: solid fill for the status-bar / notch strip. Every patternStyle
  // branch sets backgroundColor, so this is always the same base the page is
  // painted on — the strip stays visually identical to the at-rest layout.
  const notchFill = (bgStyle.backgroundColor as string | undefined) ?? surfaceColor ?? "#faf9f7";

  return (
    // CP-58: `atlas-surface` scopes the card-style utility remaps (globals.css)
    // and designVars() supplies the card/button tokens for this business.
    <div
      // CP-103.1 (QA M-04): the real fix is the NATIVE portrait lock
      // (AndroidManifest screenOrientation + Info.plist), so the app simply
      // never rotates. The column stays phone-width — an earlier
      // `landscape:max-w-2xl` also matched DESKTOP browsers (they are
      // landscape too) and blew the app out to 672px there.
      className="atlas-surface max-w-md mx-auto min-h-screen relative"
      // CP-92: start content below the iPhone status bar (safe-area inset)
      // while the background color/pattern still paints behind it — the
      // notch area blends with the app instead of eating the top banner.
      // env() is 0 in regular browsers/PWA, so nothing changes there.
      style={{ ...bgStyle, ...designVars(business.card_style, business.button_style, business.cta_glow, business.brand_colors.primary), paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <CelebrateWatcher
        businessName={business.name}
        primary={business.brand_colors.primary}
        membershipId={membershipId}
        businessId={business.id}
      />
      <PWAInstall primary={business.brand_colors.primary} businessName={business.name} />
      <FeaturedOfferBanner
        primary={business.brand_colors.primary}
        offer={bannerOffer}
        offersEnabled={!!business.widget_config.offers}
        businessId={business.id}
        /* CP-56: customizable banner style (themes, gradients, etc.). */
        bannerStyleId={business.banner_style}
        secondary={business.brand_colors.secondary}
        accent={business.brand_colors.accent}
        /* CP-85.1: a featured OPEN raffle takes over this banner; tapping it
           jumps to the Rewards tab where the entry flow lives. */
        slug={params.business}
      />
      {/* CP-86: manager-posted announcement ("closing early Tuesday") —
          renders on every tab, realtime, dismissible per device. */}
      <AnnouncementBanner
        businessId={business.id}
        primary={business.brand_colors.primary}
        secondary={business.brand_colors.secondary}
      />
      {/* CP-29.1: auto-popping offer reveal — only renders if the customer
          hasn't already seen this offer on this device. */}
      {!!business.widget_config.offers && (
        <OfferRevealWatcher
          businessId={business.id}
          businessName={business.name}
          primary={business.brand_colors.primary}
          secondary={business.brand_colors.secondary}
          /* CP-45: per-member welcome-gift reveal (server-tracked). */
          membershipId={membershipId}
        />
      )}
      <CustomerAppShell
        primary={business.brand_colors.primary}
        widgetConfig={business.widget_config}
        /* CP-32: wired so the bottom-nav Rewards tab can show the
           red/orange "!" Google-review nudge badge. */
        businessId={business.id}
        membershipId={membershipId}
        /* CP-52.2: the pattern lives on the shell wrapper (which otherwise
           painted bg-zinc-50 over it). */
        backgroundStyle={bgStyle}
        /* CP-54: surface text color (auto-contrast) + chrome (header/nav) color. */
        surfaceFg={surfaceFg}
        chromeColor={headerColor}
        /* CP-103 (QA S-03): no Google review link → no review nudge badge. */
        reviewUrl={business.google_review_url}
        /* CP-52.4: shared header (logo + quick actions) on every tab. */
        header={
          <CustomerHeader
            business={business}
            membershipId={membershipId}
            membership={membership}
            vipEnabled={vipEnabled}
            headerColor={headerColor}
          />
        }
      >
        {children}
      </CustomerAppShell>

      {/* ═══════════ CP-103.2: STATUS-BAR STRIP ═══════════
          BUG: FeaturedOfferBanner is `sticky` with `top: env(safe-area-inset-top)`
          (CP-92, so it pins just under the clock rather than beneath it). That
          leaves the band from y=0 to the inset with NOTHING pinned in it. The
          wrapper's paddingTop paints that band only while the page is at rest —
          it scrolls away with everything else, so as soon as you scroll past the
          inset, page content slides up behind the clock/battery and appears to
          "leak" above the banner. The same leak happens on tabs with no featured
          offer at all, since nothing is pinned there either.

          FIX: one fixed, non-interactive strip that always occupies exactly that
          band and paints the page's own base color. Height is env(...) so it
          collapses to 0px on Android, on notchless phones and in desktop
          browsers — no device-specific numbers anywhere. z-40 matches the banner
          (which starts BELOW this strip, so they never overlap) and stays under
          the z-50 popups/toasts, which keep their own top spacing. */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 max-w-md mx-auto z-40 pointer-events-none"
        style={{ height: "env(safe-area-inset-top, 0px)", background: notchFill }}
      />
    </div>
  );
}
