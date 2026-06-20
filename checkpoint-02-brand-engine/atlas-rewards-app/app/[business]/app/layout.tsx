import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerAppShell } from "@/components/customer/app-shell";
import { CelebrateWatcher } from "@/components/customer/celebrate-watcher";
import { PWAInstall } from "@/components/customer/pwa-install";
import { FeaturedOfferBanner } from "@/components/customer/featured-offer-banner";
import { OfferRevealWatcher } from "@/components/customer/offer-reveal-watcher";
import { patternStyle, readableTextColor } from "@/lib/patterns";
import { CustomerHeader } from "@/components/customer/customer-header";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function CustomerAppLayout({
  children, params,
}: { children: React.ReactNode; params: { business: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // CP-45: slug-prefixed so path-based access (/<slug>/app, used by the
  // agency live preview + "Customer app" button) lands on this business's
  // login instead of 404ing. Subdomain access also resolves correctly.
  if (!user) redirect(`/${params.business}/login`);

  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  if (!biz) notFound(); // CP-36: invalid slug → 404 instead of crash
  const business = biz as Business;

  // Auto-enroll if not already a member
  await supabase.rpc("enroll_member", { p_user_id: user.id, p_business_id: business.id });

  // Resolve the membership for the Realtime celebrate watcher + shared header.
  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const membership = (memRows?.[0] ?? null) as Membership | null;
  const membershipId = membership?.id ?? null;

  // CP-52.4: is a paid membership live? Gates the VIP quick-action in the
  // shared header (same as the Home page does).
  const { data: billing } = await supabase.rpc("membership_billing_public", { p_business_id: business.id });
  const billingRow = (Array.isArray(billing) ? billing[0] : billing) as { is_enabled?: boolean } | null;
  const vipEnabled = !!billingRow?.is_enabled;

  // CP-21: Load featured offer once at the layout level so the sticky banner
  // persists across every tab (Home / Scan / Rewards / Profile) instead of
  // only on Home like it used to. featured_offer() is the same RPC the
  // Home page was already using — single row at most per business.
  const { data: featured } = await supabase.rpc("featured_offer", {
    p_business_id: business.id,
  });
  // CP-29: featured_offer() now returns voice_message_url so the sticky
  // banner can render an inline play button for automated offers that
  // ship with a voice note.
  const bannerOffer = (Array.isArray(featured) ? featured[0] : null) as
    | { title: string; expires_at: string | null; voice_message_url: string | null }
    | null;

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

  return (
    <div className="max-w-md mx-auto min-h-screen relative" style={bgStyle}>
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
    </div>
  );
}
