"use client";
import { useEffect, useRef, useState } from "react";
import { Gift, Lock, Users, ShoppingBag, Star, Calendar, ChevronRight, ExternalLink, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RedeemFlow } from "./redeem-flow";
import { ActiveRedemptions, type ActiveRedemption } from "./active-redemptions";
import { ReferFriendModal } from "./refer-friend-modal";
import { ReviewSubmitModal } from "./review-submit-modal";
import { TiltLoyaltyCard } from "./tilt-loyalty-card";
// CP-43: rewards page now shares the SAME Daily Spin component as Home
// (was a separate inline button that only tracked check-in, so the two
// widgets could disagree). One component = always in sync.
// CP-70: DailySpinButton + StreakTrail removed from this tab — Home only.
// CP-43: DailyMysteryModal is no longer opened directly here — DailySpinButton
// owns the slot-machine modal now.
import { LimitedOffersSection } from "./limited-offers-section";
// CP-85: Raffle Giveaways — a new offer type. Cards live in the same area
// as Limited offers, with a more premium treatment + live countdown.
import { RafflesSection } from "./raffle-section";
import { rewardsLayout } from "@/lib/section-layouts";
import { rewardCardChrome, rewardCardMeta } from "@/lib/reward-card-styles";
// CP-67: element pack — themed headings, dividers, badges.
import { SectionDivider, SectionHeading } from "./section-elements";
import { badgeCss } from "@/lib/element-styles";
import { SavedGiftsSection } from "./saved-gifts-section";
import type { Business, Membership } from "@/lib/types/database";

type Reward = {
  id: string; name: string; description: string | null;
  reward_type: string; point_cost: number; image_url: string | null;
};

type FeaturedOffer = {
  id: string; title: string; description: string | null; expires_at: string | null;
};

export function RewardsClient({
  business, membership, rewards, fullName, initialRedemptions, initialFeaturedOffer,
}: {
  business: Business; membership: Membership | null; rewards: Reward[]; fullName: string;
  initialRedemptions: ActiveRedemption[];
  initialFeaturedOffer: FeaturedOffer | null;
}) {
  const [featuredOffer, setFeaturedOffer] = useState<FeaturedOffer | null>(initialFeaturedOffer);
  // CP-66: rewards-store layout preset (grid / list / carousel / spotlight).
  const storeLayout = rewardsLayout(business.rewards_layout);
  // CP-99 3b.1: reward-panel style preset (classic/outline/glow/tint/
  // midnight/luxe) — picked in the brand editor. Dark presets flip the
  // card text to white.
  const rcStyle = business.reward_card_style ?? null;
  const rcDark = rewardCardMeta(rcStyle).dark;
  const initialPts = membership?.points_balance ?? 0;
  const [points, setPoints] = useState(initialPts);
  // CP-73: tier state removed — Bronze/Silver/Gold tiers are gone.
  const [displayed, setDisplayed] = useState(initialPts);
  const prevRef = useRef(initialPts);
  const [redeemingReward, setRedeemingReward] = useState<Reward | null>(null);
  const [referOpen, setReferOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<"none" | "pending" | "verified" | "rejected">("none");

  // CP-35: if the customer arrived from the bottom-nav "!" badge,
  // scroll the review row into view + flash a brief ring. Triggered
  // by ?focus=review on the URL OR a #review-row hash. We do both —
  // hash is what Next.js's Link puts in window.location, query is
  // what programmatic navigation uses.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    // CP-80: generalized focus targets — same scroll+flash treatment for
    // the review row (?focus=review) and the whole "Need more points?"
    // earn section (?focus=earn, used by "See ways to earn" on Home).
    const target =
      sp.get("focus") === "review" || window.location.hash === "#review-row"
        ? { id: "review-row", ring: "ring-rose-300" }
        : sp.get("focus") === "earn" || window.location.hash === "#earn-section"
          ? { id: "earn-section", ring: "ring-amber-300" }
          : null;
    if (!target) return;
    // Wait one tick for the DOM to settle then scroll.
    const t = setTimeout(() => {
      const el = document.getElementById(target.id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("animate-pulse", "ring-4", "rounded-3xl", target.ring);
      setTimeout(
        () => el.classList.remove("animate-pulse", "ring-4", "rounded-3xl", target.ring),
        2200,
      );
    }, 250);
    return () => clearTimeout(t);
  }, []);

  // CP-37.3: ?redeem=<reward_id> opens the RedeemFlow on this reward
  // immediately. Used by the Home-tab "Top rewards" cards + the
  // /app/shop "Ready to redeem" strip so customers can redeem from
  // anywhere in the app — not just the Rewards tab grid.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const want = sp.get("redeem");
    if (!want) return;
    const match = rewards.find(r => r.id === want);
    if (match) {
      setRedeemingReward(match);
      // Clean up the URL so a refresh doesn't re-open the modal.
      const url = new URL(window.location.href);
      url.searchParams.delete("redeem");
      window.history.replaceState({}, "", url.toString());
    }
  }, [rewards]);

  // CP-43: check-in tracking for the Daily Spin moved into DailySpinButton
  // (shared with Home) so both widgets compute the same lock state.

  // Load and live-watch the customer's review status
  useEffect(() => {
    if (!membership?.id) return;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.rpc("my_review_status", { p_business_id: business.id });
      setReviewStatus(((data?.[0]?.status as typeof reviewStatus) ?? "none"));
    };
    load();
    const ch = supabase
      .channel(`reviews-${membership.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "reviews", filter: `membership_id=eq.${membership.id}` },
        load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membership?.id, business.id]);

  // Realtime: featured offer (so the banner reflects what the agency just changed)
  useEffect(() => {
    const supabase = createClient();
    const reload = async () => {
      const { data } = await supabase.rpc("featured_offer", { p_business_id: business.id });
      const row = (data?.[0] ?? null) as FeaturedOffer | null;
      setFeaturedOffer(row);
    };
    const ch = supabase
      .channel(`offers-rewards-${business.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${business.id}` },
        reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business.id]);

  // Realtime live points
  useEffect(() => {
    if (!membership?.id) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`rewards-${membership.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "business_memberships", filter: `id=eq.${membership.id}` },
        (payload) => {
          const next = payload.new as { points_balance: number };
          setPoints(next.points_balance);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membership?.id]);

  // Count-up animation
  useEffect(() => {
    const from = prevRef.current;
    const to = points;
    if (from === to) return;
    const duration = 900;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  const earnRules = business.point_rules;
  const joined = membership?.joined_at
    ? Math.max(1, Math.floor((Date.now() - new Date(membership.joined_at).getTime()) / 86400000))
    : 0;

  const offerDaysLeft = featuredOffer?.expires_at
    ? Math.max(0, Math.ceil((new Date(featuredOffer.expires_at).getTime() - Date.now()) / 86_400_000))
    : null;

  // Note: the sticky offer banner is rendered by FeaturedOfferBanner in
  // app/[business]/app/layout.tsx (CP-21) — it follows the customer across
  // every tab. We deliberately don't render one here to avoid a double bar.

  return (
    <div className="pb-4">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--surf-fg)" }}>Rewards</h1>
      </div>

      {/* 3D tilt-with-device loyalty card — CP-28: cash slot removed */}
      <TiltLoyaltyCard
        business={business}
        points={displayed}
        fullName={fullName}
        joinedDays={joined}
        membershipImageUrl={business.membership_image_url}
      />

      {/* CP-36: gifts the customer explicitly tapped "Save to my rewards"
          on land here, immediately above their active rewards. Hidden
          when the list is empty so the page stays tight. */}
      <SavedGiftsSection
        businessId={business.id}
        primary={business.brand_colors.primary}
        secondary={business.brand_colors.secondary}
        membershipId={membership?.id ?? null}
      />

      {/* Active redemptions (above store) */}
      <ActiveRedemptions
        business={business}
        initialRedemptions={initialRedemptions}
        membershipId={membership?.id ?? null}
      />

      {/* CP-85: Raffle giveaways — same area as limited offers, richer
          card. Hidden when the business has none running. Balance comes
          from the live `displayed` counter so affordability states track
          the same number the customer sees on their loyalty card. */}
      <RafflesSection
        business={business}
        membershipId={membership?.id ?? null}
        points={displayed}
      />

      {/* CP-29.1: Limited-time offers — automated + one-off promos with
          live countdowns. Hidden when nothing's active. */}
      <LimitedOffersSection
        businessId={business.id}
        businessName={business.name}
        primary={business.brand_colors.primary}
        secondary={business.brand_colors.secondary}
        cardStyle={business.offer_card_style}
        layout={business.offers_layout}
        headingStyle={business.heading_style}
        badgeStyle={business.badge_style}
      />

      {/* CP-42 hotfix: MysteryRewardCard removed — Andrew already has the
          "Daily spin · Check in to unlock" button working below; mine was
          a duplicate. The existing UI is the source of truth. */}

      {/* Rewards grid */}
      {business.widget_config.rewards_store && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <SectionHeading business={business}>Rewards store</SectionHeading>
          </div>
          {/* CP-66: layout presets — grid (default) / list / carousel /
              spotlight. Structure only; the cards keep the same content. */}
          <div
            className={
              storeLayout === "list"
                ? "space-y-2.5"
                : storeLayout === "carousel"
                  ? "flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
                  : "grid grid-cols-2 gap-3"
            }
          >
            {rewards.map((r, ri) => {
              const locked = displayed < r.point_cost;
              // CP-27: progress = current points / cost, capped at 100%.
              const pct = r.point_cost > 0
                ? Math.min(100, (displayed / r.point_cost) * 100)
                : 100;
              const remaining = Math.max(0, r.point_cost - displayed);
              const big = storeLayout === "spotlight" && ri === 0;

              // CP-66: compact list rows — image left, slim progress, chevron.
              if (storeLayout === "list") {
                return (
                  <button
                    key={r.id}
                    onClick={() => !locked && setRedeemingReward(r)}
                    disabled={locked}
                    className="w-full flex items-center gap-3 rounded-2xl border bg-white p-2.5 text-left shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                    /* CP-99 3b.1: row shell chrome from the business's
                       reward-panel preset (default "classic" keeps the 3b
                       look — quiet locked rows, brand accents when ready). */
                    style={rewardCardChrome(rcStyle, business.brand_colors.primary, business.brand_colors.secondary, locked)}
                  >
                    <div className="relative shrink-0">
                      {r.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={r.image_url} alt={r.name} className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded-xl flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}15 0%, ${business.brand_colors.primary}30 100%)` }}>
                          <Gift className="h-6 w-6" style={{ color: business.brand_colors.primary }} />
                        </div>
                      )}
                      {locked && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white/95 backdrop-blur-sm shadow-sm ring-1 ring-black/10 flex items-center justify-center">
                          <Lock className="h-2.5 w-2.5 text-zinc-500" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold leading-tight truncate ${rcDark ? "text-white" : ""}`}>{r.name}</div>
                      <div className="text-[10px] font-bold mt-0.5" style={{ color: rcDark ? "#ffffff" : business.brand_colors.primary }}>
                        {r.point_cost.toLocaleString()} POINTS
                      </div>
                      <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${rcDark ? "bg-white/15" : "bg-zinc-100"}`}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: locked
                              ? `linear-gradient(90deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`
                              : "linear-gradient(90deg, #10b981, #059669)",
                          }}
                        />
                      </div>
                    </div>
                    {/* CP-95: claimable = gradient chip (matches Home), no emoji. */}
                    {locked ? (
                      <span className={`shrink-0 text-[10px] font-extrabold ${rcDark ? "text-white/50" : "text-zinc-400"}`}>
                        {remaining.toLocaleString()} to go
                      </span>
                    ) : (
                      <span
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-black tracking-wide text-white"
                        style={{
                          background: `linear-gradient(90deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                          boxShadow: `0 4px 12px -4px ${business.brand_colors.primary}`,
                        }}
                      >
                        <Gift className="h-3 w-3" /> REDEEM
                      </span>
                    )}
                  </button>
                );
              }

              return (
                <button
                  key={r.id}
                  onClick={() => !locked && setRedeemingReward(r)}
                  disabled={locked}
                  className={`rounded-2xl border bg-white overflow-hidden text-left shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow ${
                    storeLayout === "carousel" ? "w-40 shrink-0 snap-start" : ""
                  } ${big ? "col-span-2" : ""}`}
                  /* CP-99 3b.1: card shell chrome comes from the business's
                     reward-panel preset (lib/reward-card-styles.ts). Default
                     "classic" = the 3b look: quiet locked cards, brand glow
                     when ready. Radius and base shadow stay class-driven →
                     the per-business card_style presets (CP-58) keep working. */
                  style={rewardCardChrome(rcStyle, business.brand_colors.primary, business.brand_colors.secondary, locked)}
                >
                  {/* CP-24: render the reward image (was hardcoded Gift icon) so
                      Rewards tab matches Home tab. Falls back to brand gradient
                      with Gift icon only when no image was uploaded.
                      CP-99 3b: subtle bottom scrim for depth + a frosted lock
                      chip on locked cards — the photo stays full-color (food
                      should look delicious even when locked). */}
                  <div className="relative">
                    {r.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.image_url}
                        alt={r.name}
                        className={`${big ? "aspect-video" : "aspect-[4/3]"} w-full object-cover`}
                      />
                    ) : (
                      <div className={`${big ? "aspect-video" : "aspect-[4/3]"} flex items-center justify-center`}
                        style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}15 0%, ${business.brand_colors.primary}30 100%)` }}>
                        <Gift className="h-10 w-10" style={{ color: business.brand_colors.primary }} />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/15 to-transparent pointer-events-none" />
                    {locked && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-2 py-0.5 text-[9px] font-black tracking-wide text-zinc-600 shadow-sm ring-1 ring-black/10">
                        <Lock className="h-2.5 w-2.5" /> LOCKED
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={rcDark
                        ? { background: "rgba(255,255,255,0.15)", color: "#ffffff" }
                        : { background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                      {locked
                        ? <Lock className="h-2.5 w-2.5" />
                        : <Zap className="h-2.5 w-2.5" />} {r.point_cost.toLocaleString()} POINTS
                    </div>
                    <div className={`${big ? "text-base" : "text-sm"} font-bold mt-1 leading-tight ${rcDark ? "text-white" : ""}`}>{r.name}</div>

                    {/* CP-27: progress to this reward.
                        CP-95: claimable cards trade the 10px whisper for a
                        full-width gradient REDEEM NOW button (matches Home). */}
                    <div className="mt-2">
                      {locked ? (
                        <>
                          <div className={`h-1.5 rounded-full overflow-hidden ${rcDark ? "bg-white/15" : "bg-zinc-100"}`}>
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${pct}%`,
                                background: `linear-gradient(90deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                              }}
                            />
                          </div>
                          <div className={`text-[10px] font-bold mt-1 tabular-nums ${rcDark ? "text-white/60" : "text-zinc-500"}`}>
                            {`${displayed.toLocaleString()} / ${r.point_cost.toLocaleString()} · ${remaining.toLocaleString()} to go`}
                          </div>
                        </>
                      ) : (
                        <span
                          className="flex items-center justify-center gap-1 w-full rounded-lg py-1.5 text-[10px] font-black tracking-wide text-white"
                          style={{
                            background: `linear-gradient(90deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                            boxShadow: `0 4px 12px -4px ${business.brand_colors.primary}`,
                          }}
                        >
                          <Gift className="h-3 w-3" /> REDEEM NOW
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {rewards.length === 0 && (
              <div className="col-span-2 w-full rounded-2xl border bg-white p-6 text-center text-sm text-muted-foreground">
                No rewards yet — the agency will add some soon.
              </div>
            )}
          </div>

          {/* CP-52.1: same high-contrast "View more rewards" button as Home —
              goes straight to the full categorized catalog. */}
          {rewards.length > 0 && (
            <a
              href={`/${business.slug}/app/shop`}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
              style={{
                background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                boxShadow: `0 10px 22px -8px ${business.brand_colors.primary}aa`,
              }}
            >
              View more rewards <ChevronRight className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

      {/* CP-70: the Streak trail + Daily Spin cards were REMOVED from the
          Rewards tab — they live on Home only now (Andrew's call: Rewards
          stays focused on the store + offers + earning). */}

      {/* CP-67: optional divider between the big sections */}
      <SectionDivider business={business} />

      {/* Need more points? — CP-28: livelier, on-brand.
          CP-80: anchored (#earn-section) so "See ways to earn" lands here
          with the same scroll+flash the review "!" uses. */}
      <div id="earn-section" className="px-4 mt-6 scroll-mt-24">
        <div className="flex items-center gap-2 mb-3">
          <SectionHeading business={business}>Need more points?</SectionHeading>
          <span
            className="inline-flex items-center gap-0.5 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full shadow-sm"
            style={badgeCss(business.badge_style, business.brand_colors.primary, business.brand_colors.secondary)}
          >
            <Zap className="h-2.5 w-2.5" /> Earn
          </span>
        </div>
        <div className="space-y-2.5">
          {business.widget_config.referrals && (
            <EarnRow icon={<Users className="h-4 w-4" />} title="Refer a friend"
              points={earnRules.referral_referrer}
              primary={business.brand_colors.primary}
              secondary={business.brand_colors.secondary}
              actionable onClick={() => setReferOpen(true)} />
          )}
          {business.widget_config.visit_tracker && (
            <EarnRow icon={<ShoppingBag className="h-4 w-4" />} title="Purchase in-app"
              subtitle={`${earnRules.purchase_per_dollar} point per $1 spent`}
              points={earnRules.purchase_per_dollar}
              primary={business.brand_colors.primary}
              secondary={business.brand_colors.secondary} />
          )}
          {business.widget_config.reviews && (
            <EarnRow
              /* CP-35: anchor target for the Rewards-tab "!" badge nudge.
                 Combined with the useEffect at the top of this file that
                 detects ?focus=review (or #review-row hash), this scrolls
                 the row into view + flashes a brief ring. */
              anchorId="review-row"
              icon={<Star className="h-4 w-4" />} title="Review on Google"
              subtitle={
                reviewStatus === "pending"  ? "Pending verification…" :
                reviewStatus === "verified" ? "✓ Done — thanks for your review!" :
                reviewStatus === "rejected" ? "Try again — last submission rejected" :
                "Open Google, leave a review, submit for verification"
              }
              points={earnRules.review}
              primary={business.brand_colors.primary}
              secondary={business.brand_colors.secondary}
              /* CP-35: verified = one-and-done. Row is not actionable
                 anymore so tapping it doesn't reopen the submit modal. */
              actionable={reviewStatus !== "verified"}
              onClick={reviewStatus === "verified" ? undefined : () => setReviewOpen(true)}
              badge={reviewStatus === "pending" ? "Pending" : reviewStatus === "verified" ? "Verified" : null}
              alert={
                /* CP-32: red "!" when no review yet, orange "!" while
                   pending review verification, hidden once verified. */
                reviewStatus === "none"    ? "red"
                : reviewStatus === "pending" ? "orange"
                : reviewStatus === "rejected" ? "red"
                : false
              } />
          )}
          {business.widget_config.birthdays && (
            <EarnRow icon={<Calendar className="h-4 w-4" />} title="Birthday bonus"
              subtitle="Auto-awarded once a year on your birthday"
              points={earnRules.birthday}
              primary={business.brand_colors.primary}
              secondary={business.brand_colors.secondary} />
          )}
        </div>
      </div>

      {/* Redeem flow modal */}
      {redeemingReward && (
        <RedeemFlow
          business={business}
          reward={redeemingReward}
          currentPoints={displayed}
          onClose={() => setRedeemingReward(null)}
        />
      )}

      {/* Refer-a-friend modal */}
      {referOpen && membership?.referral_code && (
        <ReferFriendModal
          business={business}
          referralCode={membership.referral_code}
          onClose={() => setReferOpen(false)}
        />
      )}

      {/* Review submit modal */}
      {reviewOpen && (
        <ReviewSubmitModal
          business={business}
          points={earnRules.review}
          existingStatus={reviewStatus}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}

function EarnRow({
  icon, title, subtitle, points, primary, secondary, actionable, onClick, external, badge, alert, anchorId,
}: {
  icon: React.ReactNode; title: string; subtitle?: string; points: number;
  /** CP-35: optional DOM id so the row can be scrolled to via #review-row */
  anchorId?: string;
  /** Brand primary — used for the icon tile, the pill button gradient start,
   *  and the soft tinted card background. */
  primary: string;
  /** Brand secondary — gradient end. Falls back to primary if missing. */
  secondary?: string;
  actionable?: boolean; onClick?: () => void; external?: string;
  badge?: string | null;
  /** CP-32: attention badge tone.
   *    "red"    — unclaimed action (e.g. no Google review submitted)
   *    "orange" — pending verification (review submitted, awaiting staff)
   *    false    — no badge shown */
  alert?: false | "red" | "orange";
}) {
  const sec = secondary || primary;
  const alertTone =
    alert === "red"    ? { bg: "bg-rose-500",   ring: "ring-white" } :
    alert === "orange" ? { bg: "bg-amber-500",  ring: "ring-white" } :
    null;
  const content = (
    <>
      <div className="relative shrink-0">
        {/* Brand-gradient icon tile — replaces the flat ${color}15 swatch
            so the row reads as "points-earning" instead of "neutral info". */}
        <div
          className="h-11 w-11 rounded-xl flex items-center justify-center text-white shadow-md"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)`,
            boxShadow: `0 4px 12px ${primary}40`,
          }}
        >
          {icon}
        </div>
        {alertTone && (
          <span
            aria-label={alert === "orange" ? "Pending verification" : "Action available"}
            className={`absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full ${alertTone.bg} text-white text-[11px] font-extrabold flex items-center justify-center shadow-md ring-2 ${alertTone.ring} animate-pulse`}
          >!</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold leading-tight flex items-center gap-2 text-zinc-900">
          {title}
          {badge === "Pending"  && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pending</span>}
          {badge === "Verified" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Verified</span>}
        </div>
        {subtitle && <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{subtitle}</div>}
      </div>
      {/* Pill button — brand gradient with glow */}
      <div
        className="text-xs font-extrabold px-3 py-1.5 rounded-full text-white flex items-center gap-1 shrink-0 shadow-md ring-1 ring-white/40"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)`,
          boxShadow: `0 4px 12px ${primary}55`,
        }}
      >
        +{points} Points
        {external && <ExternalLink className="h-3 w-3" />}
      </div>
    </>
  );

  // CP-28: card itself gets a soft brand tint (was flat white) so the section
  // feels like one cohesive "earn zone" instead of three neutral cards.
  // CP-52.4: solid white card (was a faint tint that let the background
  // pattern bleed through) + a defined ring + soft shadow so the "earn"
  // rows sit cleanly above the patterned background.
  const baseClass =
    "flex items-center gap-3 rounded-2xl border p-3.5 transition-all shadow-sm ring-1 ring-black/5";
  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    borderColor: `${primary}26`,
  };

  if (external) {
    return (
      <a id={anchorId} href={external} target="_blank" rel="noopener noreferrer"
         className={`${baseClass} hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 scroll-mt-24`}
         style={cardStyle}>
        {content}
      </a>
    );
  }
  if (actionable) {
    return (
      <button id={anchorId} onClick={onClick}
              className={`w-full text-left ${baseClass} hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] scroll-mt-24`}
              style={cardStyle}>
        {content}
      </button>
    );
  }
  return (
    <div id={anchorId} className={`${baseClass} scroll-mt-24`} style={cardStyle}>{content}</div>
  );
}
