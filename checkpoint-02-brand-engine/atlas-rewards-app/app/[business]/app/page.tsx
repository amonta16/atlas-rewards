import { Gift, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getFeaturedOffer, getMyMembership, type FeaturedOfferRow } from "@/lib/data/customer-app";
import { offerCardMeta, offerCardStyle } from "@/lib/offer-card-styles";
import { SectionDivider, SectionHeading } from "@/components/customer/section-elements";
import { NewsSection } from "@/components/customer/news-section";
import { TopRewardsGrid } from "@/components/customer/top-rewards-grid";
import { LiveMemberCard } from "@/components/customer/live-member-card";
import { WinbackBanner } from "@/components/customer/winback-banner";
// CP-87: referred friends see their "spend $X to unlock your bonus" progress.
import { ReferralProgressCard } from "@/components/customer/referral-progress-card";
import { MembershipSection } from "@/components/customer/membership-section";
import { LocationCard } from "@/components/customer/location-card";
import { NotificationBell } from "@/components/notifications/notification-bell";
// CP-85.1: raffle edition of the Featured card — renders itself only when a
// featured raffle is scheduled/open, ABOVE the featured offer card.
import { FeaturedRaffleCard } from "@/components/customer/featured-raffle-card";
// CP-42: reuse the existing Daily Spin button (the same one Andrew has
// on Rewards) under the Featured offer on Home.
import { DailySpinButton } from "@/components/customer/daily-spin-button";
// CP-43.3: mini streak teaser — shows progress to the first streak reward.
import { StreakMini } from "@/components/customer/streak-mini";
// CP-43.3: PwaWelcomeOverlay (the installed "welcome + enable notifications"
// modal) was removed — it competed with the bell nudge for the notification
// ask. The bell nudge (EnablePushNudge in the app shell) is now the single
// notification-activation moment, and the welcome gift reveal follows it.
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type TopReward = {
  id: string; name: string; point_cost: number; image_url: string | null;
  // CP-99: additional gallery photos returned by top_rewards_public.
  images?: string[] | null;
};

type NewsRow = {
  id: string; title: string; body: string | null;
  image_url: string | null; published_at: string;
};

export default async function CustomerHome({ params }: { params: { business: string } }) {
  // CP-89: business / user / membership / featured offer are all request-
  // memoized (lib/data/customer-app.ts + getCachedUser) — the layout already
  // fetched them in this same request, so these four "calls" are free here.
  // Only top_rewards and latest_news are page-specific network calls.
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();

  const supabase = createClient();
  const [user, mem, offer, { data: rewards }, { data: news }] = await Promise.all([
    getCachedUser(),
    getMyMembership(business.id),
    getFeaturedOffer(business.id),
    // CP-52: show at least 4 top rewards on Home (was 2).
    supabase.rpc("top_rewards_public", { p_business_id: business.id, p_limit: 4 }),
    supabase.rpc("latest_news",        { p_business_id: business.id, p_limit: 3 }),
  ]);

  const topRewards = (rewards ?? []) as TopReward[];
  const newsPosts = (news ?? []) as NewsRow[];

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const firstName = (profile?.full_name ?? user!.email?.split("@")[0] ?? "there").split(" ")[0];

  const greeting = business.welcome_message || `Welcome back, ${firstName}!`;
  const points = mem?.points_balance ?? 0;
  // CP-73: Bronze/Silver/Gold tiers removed from the customer app.

  // Days-left for the in-page Featured Offer card lower down.
  // Note: the sticky offer banner that used to live here was lifted to the
  // customer layout in CP-21 (components/customer/featured-offer-banner.tsx)
  // so it persists across every tab — not just Home. The Featured Offer
  // *card* below still renders here so the Home page keeps its hero spot.
  const offerDaysLeft = offer?.expires_at
    ? Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="relative">
      {/* CP-89: OffersRevalidator mount removed — CP-88 neutralised it (the
          router.refresh() stampede); the featured-offer banner + limited
          offers keep their own targeted realtime listeners. */}

      {/* CP-52.4: header (logo + quick actions) now lives in the app shell so
          it appears on every tab — not just here. */}

      {/* Hero */}
      <div className="relative h-44 overflow-hidden">
        {business.hero_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={business.hero_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
          />
        )}
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white/85 text-[10px] font-semibold tracking-widest uppercase">{business.name}</div>
            <h2 className="text-white text-xl font-bold leading-tight mt-1">{greeting}</h2>
          </div>
          {/* CP-32: notification bell — only when the customer is a member. */}
          {mem?.id && (
            <NotificationBell
              primary={business.brand_colors.primary}
              membershipId={mem.id}
              businessId={business.id}
            />
          )}
        </div>
      </div>

      {/* Member card — live-updates via Realtime */}
      {business.widget_config.points_card && (
        <div className="px-4 -mt-7 relative z-10">
          <LiveMemberCard
            business={business}
            membershipId={mem?.id ?? null}
            initialPoints={points}
            isMember={!!mem}
          />
        </div>
      )}

      {/* Win-back banner — surfaces personal messages from the Come-Back AI */}
      <WinbackBanner business={business} membershipId={mem?.id ?? null} />

      {/* CP-87: pending-referral progress (referee side) — hides itself
          unless this member was referred and hasn't hit the spend goal. */}
      <ReferralProgressCard
        businessId={business.id}
        membershipId={mem?.id ?? null}
        primary={business.brand_colors.primary}
        secondary={business.brand_colors.secondary}
      />

      {/* CP-85.1: featured RAFFLE card — the giveaway takes the hero spot
          above the featured offer (client component; hides itself when no
          featured raffle is scheduled or open). */}
      {business.widget_config.offers && (
        <FeaturedRaffleCard business={business} slug={params.business} />
      )}

      {/* Featured offer — only when one exists in DB. CP-26: poppy glow border
          per Andrew's mock — a thick cyan/brand ring with a soft outer glow
          so the featured card grabs attention on the home feed. */}
      {business.widget_config.offers && offer && (
        <div className="px-4 mt-5">
          <div
            className="relative rounded-3xl p-[3px]"
            style={{
              // CP-53: ring now uses the business's own brand colors
              // (was a fixed cyan that clashed with some brands).
              background: `linear-gradient(135deg, ${business.brand_colors.secondary} 0%, ${business.brand_colors.primary} 50%, ${business.brand_colors.accent} 100%)`,
              boxShadow: `0 0 0 4px ${business.brand_colors.primary}11, 0 12px 30px -8px ${business.brand_colors.primary}55`,
            }}
          >
            {/* Tiny ⭐ FEATURED ribbon top-left */}
            <span
              className="absolute -top-2.5 left-3 z-10 inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-full text-white shadow"
              style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})` }}
            >
              <Gift className="h-2.5 w-2.5" /> Featured
            </span>
            {/* CP-66.1: the featured card's inner surface now wears the same
                offer-card style as the Limited-offers cards (was fixed white).
                The glow ring stays — that's the "featured" signal. */}
            {(() => {
              const cardCss = offerCardStyle(business.offer_card_style, business.brand_colors.primary, business.brand_colors.secondary);
              const dark = offerCardMeta(business.offer_card_style).dark;
              return (
            <div className="rounded-[20px] overflow-hidden" style={cardCss}>
              {offer.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={offer.image_url} alt={offer.title} className="h-40 w-full object-cover" />
              ) : (
                <div className="h-40 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${business.brand_colors.accent} 0%, ${business.brand_colors.secondary} 100%)` }}>
                  <Gift className="h-12 w-12 text-white/80" />
                </div>
              )}
              <div className="p-4">
                {/* CP-46: punchier featured-offer headline — bigger, blacker
                    weight, tighter tracking + leading so a short promo like
                    "10% OFF MATCHA!" reads like a real billboard line. */}
                <div className={`text-xl font-black leading-[1.05] tracking-[-0.02em] ${dark ? "text-white" : "text-zinc-900"}`}>{offer.title}</div>
                {offer.description && <div className={`text-[13px] mt-1.5 leading-snug ${dark ? "text-white/65" : "text-zinc-500"}`}>{offer.description}</div>}
                {offerDaysLeft !== null && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${dark ? "bg-red-300" : "bg-red-500"}`} />
                    <span className={`font-extrabold ${dark ? "text-red-300" : "text-red-600"}`}>Expires in {offerDaysLeft} day{offerDaysLeft === 1 ? "" : "s"}</span>
                  </div>
                )}
              </div>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* CP-67: optional divider under the featured offer */}
      {business.widget_config.offers && offer && <SectionDivider business={business} />}

      {/* Top rewards */}
      {business.widget_config.rewards_store && topRewards.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <SectionHeading business={business} className="text-sm">Top rewards</SectionHeading>
            {/* CP-47: make "See all" pop — a filled brand pill with a soft
                glow so customers notice there's a full rewards catalog. */}
            <a
              href={`/${params.business}/app/rewards`}
              className="inline-flex items-center gap-1 text-xs font-extrabold text-white rounded-full pl-3 pr-2 py-1.5 shadow-md active:scale-95 transition"
              style={{
                background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                boxShadow: `0 6px 16px -4px ${business.brand_colors.primary}88`,
              }}
            >
              See all <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
          {/* CP-53: locked rewards now open a detail popup right here on Home
              (client component); unlocked still deep-link to the redeem flow. */}
          <TopRewardsGrid
            businessSlug={params.business}
            rewards={topRewards}
            points={points}
            primary={business.brand_colors.primary}
            secondary={business.brand_colors.secondary}
          />

          {/* CP-52.1: jump STRAIGHT to the full rewards catalog (no double-step
              through the rewards tab). */}
          <a
            href={`/${params.business}/app/shop`}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
            style={{
              background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
              boxShadow: `0 10px 22px -8px ${business.brand_colors.primary}aa`,
            }}
          >
            View more rewards <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      )}

      {/* CP-52: Daily Spin + Streak now sit BELOW rewards, side by side
          (half-width each) instead of stacked full-width above. */}
      {mem?.id && (
        <div className="px-4 mt-4 grid grid-cols-2 gap-3 items-stretch">
          <DailySpinButton business={business} membershipId={mem.id} compact />
          <StreakMini business={business} membershipId={mem.id} compact />
        </div>
      )}

      {/* Membership — single-tier exclusive card with billing CTA */}
      <MembershipSection
        business={business}
        membership={mem}
        userId={user!.id}
      />

      {/* News & updates — CP-69: billboard cards + tappable detail sheet
          (was tiny non-clickable rows). */}
      {newsPosts.length > 0 && <NewsSection business={business} posts={newsPosts} />}

      {/* CP-52.6: location map + Call-now card at the very bottom of Home. */}
      {business.widget_config.location && <LocationCard business={business} />}
    </div>
  );
}
