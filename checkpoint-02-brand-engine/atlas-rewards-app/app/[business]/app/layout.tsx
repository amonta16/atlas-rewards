import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomerAppShell } from "@/components/customer/app-shell";
import { CelebrateWatcher } from "@/components/customer/celebrate-watcher";
import { PWAInstall } from "@/components/customer/pwa-install";
import { FeaturedOfferBanner } from "@/components/customer/featured-offer-banner";
import { OfferRevealWatcher } from "@/components/customer/offer-reveal-watcher";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function CustomerAppLayout({
  children, params,
}: { children: React.ReactNode; params: { business: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  if (!biz) notFound(); // CP-36: invalid slug → 404 instead of crash
  const business = biz as Business;

  // Auto-enroll if not already a member
  await supabase.rpc("enroll_member", { p_user_id: user.id, p_business_id: business.id });

  // Resolve the membership_id for the Realtime celebrate watcher
  const { data: memRows } = await supabase.rpc("my_membership", { p_business_id: business.id });
  const membershipId = (memRows?.[0]?.id as string) ?? null;

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

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative">
      <CelebrateWatcher
        businessName={business.name}
        primary={business.brand_colors.primary}
        membershipId={membershipId}
      />
      <PWAInstall primary={business.brand_colors.primary} businessName={business.name} />
      <FeaturedOfferBanner
        primary={business.brand_colors.primary}
        offer={bannerOffer}
        offersEnabled={!!business.widget_config.offers}
        businessId={business.id}
      />
      {/* CP-29.1: auto-popping offer reveal — only renders if the customer
          hasn't already seen this offer on this device. */}
      {!!business.widget_config.offers && (
        <OfferRevealWatcher
          businessId={business.id}
          businessName={business.name}
          primary={business.brand_colors.primary}
          secondary={business.brand_colors.secondary}
        />
      )}
      <CustomerAppShell
        primary={business.brand_colors.primary}
        widgetConfig={business.widget_config}
        /* CP-32: wired so the bottom-nav Rewards tab can show the
           red/orange "!" Google-review nudge badge. */
        businessId={business.id}
        membershipId={membershipId}
      >
        {children}
      </CustomerAppShell>
    </div>
  );
}
