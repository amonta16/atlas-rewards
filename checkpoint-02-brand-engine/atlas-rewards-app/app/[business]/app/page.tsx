import { Gift, ChevronRight, Lock, Newspaper } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LiveMemberCard } from "@/components/customer/live-member-card";
import { OffersRevalidator } from "@/components/customer/offers-revalidator";
import { WinbackBanner } from "@/components/customer/winback-banner";
import { HeaderActions } from "@/components/customer/header-actions";
import { MembershipSection } from "@/components/customer/membership-section";
import { NotificationBell } from "@/components/notifications/notification-bell";
import type { Business, Membership } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type FeaturedOffer = {
  id: string; title: string; description: string | null;
  image_url: string | null; expires_at: string | null;
};

type TopReward = { id: string; name: string; point_cost: number; image_url: string | null };

type NewsRow = {
  id: string; title: string; body: string | null;
  image_url: string | null; published_at: string;
};

export default async function CustomerHome({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  const [{ data: memRows }, { data: { user } }, { data: featured }, { data: rewards }, { data: news }] = await Promise.all([
    supabase.rpc("my_membership", { p_business_id: business.id }),
    supabase.auth.getUser(),
    supabase.rpc("featured_offer", { p_business_id: business.id }),
    supabase.rpc("top_rewards_public", { p_business_id: business.id, p_limit: 2 }),
    supabase.rpc("latest_news",        { p_business_id: business.id, p_limit: 3 }),
  ]);

  const mem = (memRows?.[0] ?? null) as Membership | null;
  const offer = (featured?.[0] ?? null) as FeaturedOffer | null;
  const topRewards = (rewards ?? []) as TopReward[];
  const newsPosts = (news ?? []) as NewsRow[];

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();
  const firstName = (profile?.full_name ?? user!.email?.split("@")[0] ?? "there").split(" ")[0];

  const greeting = business.welcome_message || `Welcome back, ${firstName}!`;
  const points = mem?.points_balance ?? 0;
  const tier = mem?.tier ?? "Bronze";

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
      <OffersRevalidator businessId={business.id} />

      {/* Header */}
      <div className="px-4 pt-3 pb-3 flex items-center justify-between bg-white">
        {business.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={business.logo_url} alt={business.name} className="h-9 max-w-[140px] object-contain" />
        ) : (
          <div
            className="h-9 px-3 rounded-full flex items-center text-white text-xs font-bold max-w-[160px]"
            style={{ background: business.brand_colors.primary }}
          >
            <span className="truncate">{business.name}</span>
          </div>
        )}
        {/* Streak · Member · Mystery icons — all client-side so they stay reactive */}
        <HeaderActions
          business={business}
          membershipId={mem?.id ?? null}
          membership={mem}
        />
      </div>

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
          <div>
            <div className="text-white/85 text-[10px] font-semibold tracking-widest uppercase">{business.name}</div>
            <h2 className="text-white text-xl font-bold leading-tight mt-1">{greeting}</h2>
          </div>
          {/* CP-32: notification bell — unread badge + push opt-in. Only
              shown when the customer actually has a membership (the
              notifications RPCs need a signed-in member). */}
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
            initialTier={tier}
            isMember={!!mem}
          />
        </div>
      )}

      {/* Win-back banner — surfaces personal messages from the Come-Back AI */}
      <WinbackBanner business={business} membershipId={mem?.id ?? null} />

      {/* Featured offer — only when one exists in DB. CP-26: poppy glow border
          per Andrew's mock — a thick cyan/brand ring with a soft outer glow
          so the featured card grabs attention on the home feed. */}
      {business.widget_config.offers && offer && (
        <div className="px-4 mt-5">
          <div
            className="relative rounded-3xl p-[3px]"
            style={{
              background: `linear-gradient(135deg, #06b6d4 0%, ${business.brand_colors.primary} 50%, #06b6d4 100%)`,
              boxShadow: `0 0 0 4px ${business.brand_colors.primary}11, 0 12px 30px -8px ${business.brand_colors.primary}55`,
            }}
          >
            {/* Tiny ⭐ FEATURED ribbon top-left */}
            <span
              className="absolute -top-2.5 left-3 z-10 inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-full text-white shadow"
              style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}, #06b6d4)` }}
            >
              <Gift className="h-2.5 w-2.5" /> Featured
            </span>
            <div className="bg-white rounded-[20px] overflow-hidden">
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
                <div className="text-base font-extrabold leading-tight text-zinc-900">{offer.title}</div>
                {offer.description && <div className="text-xs text-zinc-500 mt-1">{offer.description}</div>}
                {offerDaysLeft !== null && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-rose-600 font-bold">Expires in {offerDaysLeft} day{offerDaysLeft === 1 ? "" : "s"}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top rewards */}
      {business.widget_config.rewards_store && topRewards.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Top rewards</h2>
            <a href={`/app/rewards`} className="text-xs font-semibold flex items-center gap-0.5" style={{ color: business.brand_colors.primary }}>
              See all <ChevronRight className="h-3 w-3" />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {topRewards.map(r => {
              // CP-27: progress bar — how close is the customer to this reward?
              const pct = r.point_cost > 0
                ? Math.min(100, (points / r.point_cost) * 100)
                : 100;
              const unlocked = points >= r.point_cost;
              const remaining = Math.max(0, r.point_cost - points);
              return (
                <div key={r.id} className="rounded-xl border bg-white overflow-hidden">
                  {r.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.image_url} alt={r.name} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="aspect-[4/3] flex items-center justify-center"
                      style={{ background: `${business.brand_colors.primary}15` }}>
                      <Gift className="h-8 w-8" style={{ color: business.brand_colors.primary }} />
                    </div>
                  )}
                  <div className="p-2.5">
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold"
                      style={{ color: business.brand_colors.primary }}>
                      <Lock className="h-2.5 w-2.5" /> {r.point_cost.toLocaleString()} POINTS
                    </div>
                    <div className="text-xs font-bold mt-0.5">{r.name}</div>
                    {/* CP-27: progress bar */}
                    <div className="mt-1.5">
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: unlocked
                              ? "linear-gradient(90deg, #10b981, #059669)"
                              : `linear-gradient(90deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                          }}
                        />
                      </div>
                      <div className={`text-[9px] font-bold mt-0.5 tabular-nums ${unlocked ? "text-emerald-600" : "text-zinc-500"}`}>
                        {unlocked
                          ? "Ready to redeem ✨"
                          : `${points.toLocaleString()} / ${r.point_cost.toLocaleString()} · ${remaining.toLocaleString()} to go`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Membership — single-tier exclusive card with billing CTA */}
      <MembershipSection
        business={business}
        membership={mem}
        userId={user!.id}
      />

      {/* News & updates */}
      {newsPosts.length > 0 && (
        <div className="px-4 mt-5 pb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold flex items-center gap-1.5"><Newspaper className="h-3.5 w-3.5" /> News &amp; updates</h2>
          </div>
          <div className="space-y-2">
            {newsPosts.map(post => (
              <div key={post.id} className="rounded-xl border bg-white overflow-hidden flex">
                {post.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={post.image_url} alt="" className="h-16 w-16 object-cover shrink-0" />
                )}
                <div className="p-2.5 flex-1 min-w-0">
                  <div className="text-xs font-bold leading-tight text-zinc-900 truncate">{post.title}</div>
                  {post.body && <div className="text-[11px] text-zinc-500 leading-snug mt-0.5 line-clamp-2">{post.body}</div>}
                  <div className="text-[10px] text-zinc-400 mt-1">{new Date(post.published_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
