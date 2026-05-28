"use client";
import { Home, ShoppingBag, ScanLine, Gift, User, ChevronRight, Lock, Star, Calendar, Users, CalendarClock, Tag, Flame, Sparkles } from "lucide-react";
import type { Business } from "@/lib/types/database";

export type PreviewTab = "home" | "shop" | "book" | "scan" | "rewards" | "profile";

export type PreviewOffer = { title: string; description?: string | null; image_url?: string | null; days_left?: number };
export type PreviewReward = { id: string; name: string; point_cost: number; image_url?: string | null };
export type PreviewNewsPost = { id: string; title: string; body?: string | null; image_url?: string | null; published_at?: string | null };
export type PreviewBookingTag = { id: string; name: string; emoji?: string | null; duration_minutes: number; price_cents?: number | null; image_url?: string | null };

/**
 * Customer-app preview. Single source of truth for what the customer sees.
 * Used both in the agency brand editor (inside a phone frame) and as the
 * basis for the real customer routes.
 *
 * Now supports:
 *   - hero_image_url as background (falls back to gradient)
 *   - configurable offer (defaults to a demo offer if none passed)
 *   - reward images
 *   - tab switching (Home / Shop / Scan / Rewards / Profile)
 */
export function CustomerPreview({
  business: b, activeTab = "home", offer, rewards = [], onTabChange, news = [], membershipImageUrl, bookingTags = [],
}: {
  business: Business;
  activeTab?: PreviewTab;
  offer?: PreviewOffer | null;
  rewards?: PreviewReward[];
  /** When provided, the bottom tab nav becomes interactive. */
  onTabChange?: (tab: PreviewTab) => void;
  /** Latest 2-3 news/blog posts for the Home tab. */
  news?: PreviewNewsPost[];
  /** Background image for the loyalty card (Rewards tab). */
  membershipImageUrl?: string | null;
  /** Service widgets rendered on the Book tab. */
  bookingTags?: PreviewBookingTag[];
}) {
  const w = b.widget_config;
  const greeting = b.welcome_message || `Welcome back!`;
  // CP-22 fix: always show a banner placeholder when no real featured offer is
  // loaded yet — that way the agency can see what the banner will look like
  // before they create their first offer, and the preview doesn't go blank
  // between offer-save and the next preview refetch.
  const liveOffer: PreviewOffer = offer ?? { title: "Your featured offer will appear here", days_left: 8 };
  const bannerIsPlaceholder = !offer;

  return (
    <div className="relative bg-zinc-50 min-h-full flex flex-col">
      {/* STICKY OFFER BANNER — visible on every tab. Matches the production
          banner in components/customer/featured-offer-banner.tsx pixel-for-pixel
          so the agency preview accurately reflects what the customer will see.
          CP-28: the live banner now always carries a diagonal stripe pattern.
          The placeholder gets a denser stripe so the agency can tell at a
          glance "this isn't a real offer yet". */}
      {w.offers && (
        <div
          className="sticky top-0 z-30 px-3 py-2.5 flex items-center justify-between text-white text-[12px] font-medium shadow-sm relative overflow-hidden"
          style={{
            background: b.brand_colors.primary,
            backgroundImage: bannerIsPlaceholder
              ? `repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 6px, rgba(255,255,255,0) 6px 12px)`
              : `repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 8px, rgba(255,255,255,0) 8px 18px)`,
          }}
        >
          <span className="truncate pr-2 flex items-center gap-1.5 relative">
            <Tag className="h-3 w-3 shrink-0 opacity-90 drop-shadow-sm" />
            <span className="drop-shadow-sm font-semibold">{liveOffer.title}</span>
          </span>
          {liveOffer.days_left !== undefined && (
            <span className="shrink-0 bg-white text-zinc-900 rounded-full pl-2 pr-2.5 py-0.5 flex items-center gap-1.5 relative shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[11px] font-semibold">
                Expires in {liveOffer.days_left}d
              </span>
            </span>
          )}
        </div>
      )}

      {/* HEADER — CP-26: pill-shaped quick-action buttons (mirrors the
          live <HeaderActions/> component). Icon + text label. The middle
          slot is "Member" with a Star icon — not a profile button. */}
      <div className="px-4 pt-3 pb-3 flex items-center justify-between bg-white">
        <BusinessLogo business={b} />
        <div className="flex items-center gap-1.5">
          {/* Daily check-in */}
          <div
            className="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full shadow-md ring-1 ring-black/5"
            style={{
              background: `linear-gradient(135deg, ${b.brand_colors.primary}33 0%, ${b.brand_colors.primary}1a 100%)`,
            }}
            title="Daily check-in"
          >
            <Gift className="h-[13px] w-[13px]" style={{ color: b.brand_colors.primary }} />
            <span className="text-[10px] font-extrabold leading-none" style={{ color: b.brand_colors.primary }}>
              Check in
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center shadow">
              <Lock className="h-2.5 w-2.5 text-zinc-500" />
            </span>
          </div>
          {/* Membership (Star icon, NOT profile) */}
          <div
            className="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full shadow-md ring-1 ring-black/5"
            style={{
              background: `linear-gradient(135deg, ${b.brand_colors.primary} 0%, ${b.brand_colors.primary}cc 100%)`,
            }}
            title="Membership"
          >
            <Star className="h-[13px] w-[13px] text-white fill-white" />
            <span className="text-[10px] font-extrabold leading-none text-white">Member</span>
          </div>
          {/* Streak */}
          {(b.widget_config as { streaks?: boolean }).streaks !== false && (
            <div
              className="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full shadow-md ring-1 ring-black/5"
              style={{
                background: "linear-gradient(135deg, #fb923c 0%, #ef4444 100%)",
              }}
              title="Streak"
            >
              <Flame className="h-[13px] w-[13px] text-white" />
              <span className="text-[10px] font-extrabold leading-none text-white">Streak</span>
            </div>
          )}
        </div>
      </div>

      {/* TAB BODIES */}
      {activeTab === "home"    && <HomeBody business={b} liveOffer={liveOffer} rewards={rewards} greeting={greeting} news={news} />}
      {activeTab === "shop"    && <ShopBody business={b} />}
      {activeTab === "book"    && <BookBody business={b} tags={bookingTags} />}
      {activeTab === "scan"    && <ScanBody business={b} />}
      {activeTab === "rewards" && <RewardsBody business={b} rewards={rewards} membershipImageUrl={membershipImageUrl} />}
      {activeTab === "profile" && <ProfileBody business={b} />}

      <div className="flex-1 min-h-[20px]" />

      {/* BOTTOM TAB NAV — adapts to widget_config so disabled features don't show */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-1 py-1.5 flex items-center justify-around">
        {(() => {
          const tabs: { id: PreviewTab; label: string; icon: React.ReactNode }[] = [
            { id: "home", label: "Home", icon: <Home className="h-5 w-5" /> },
          ];
          // Shop + Book tabs removed — Atlas is loyalty-only.
          tabs.push({ id: "scan",    label: "Scan",    icon: <ScanLine className="h-5 w-5" /> });
          tabs.push({ id: "rewards", label: "Rewards", icon: <Gift     className="h-5 w-5" /> });
          if (tabs.length < 5) tabs.push({ id: "profile", label: "Profile", icon: <User className="h-5 w-5" /> });
          return tabs.map(t => (
            <TabItem
              key={t.id}
              icon={t.icon}
              label={t.label}
              active={activeTab === t.id}
              color={b.brand_colors.primary}
              onClick={onTabChange ? () => onTabChange(t.id) : undefined}
            />
          ));
        })()}
      </div>
    </div>
  );
}

/* ===================== HOME ===================== */
function HomeBody({ business: b, liveOffer, rewards, greeting, news = [] }: {
  business: Business; liveOffer: PreviewOffer; rewards: PreviewReward[]; greeting: string;
  news?: PreviewNewsPost[];
}) {
  return (
    <>
      {/* Hero — uses uploaded hero_image_url when present */}
      <div className="relative h-44 overflow-hidden">
        {b.hero_image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={b.hero_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary} 0%, ${b.brand_colors.secondary} 100%)` }} />
        )}
        <div className="absolute inset-0 bg-black/30" />
        {b.logo_url && !b.hero_image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={b.logo_url} alt="" className="absolute -right-2 -bottom-2 h-24 opacity-20" />
        )}
        <div className="absolute top-0 left-0 right-0 p-4">
          <div className="text-white/85 text-[10px] font-semibold tracking-widest uppercase">{b.name}</div>
          <h2 className="text-white text-xl font-bold leading-tight mt-1">{greeting}</h2>
        </div>
      </div>

      {/* Compact member card */}
      {b.widget_config.points_card && (
        <div className="px-4 -mt-7 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg border border-zinc-100 p-3.5 flex items-center gap-3">
            <div className="text-2xl font-bold tracking-tight" style={{ color: b.brand_colors.primary }}>50</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold leading-tight text-zinc-900">{b.name}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">points</div>
            </div>
            <div className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ background: `${b.brand_colors.primary}15`, color: b.brand_colors.primary }}>
              Not A Member
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
          </div>
        </div>
      )}

      {/* Featured offer — CP-26 poppy glow border */}
      {b.widget_config.offers && (
        <div className="px-4 mt-5">
          <div
            className="relative rounded-3xl p-[3px]"
            style={{
              background: `linear-gradient(135deg, #06b6d4 0%, ${b.brand_colors.primary} 50%, #06b6d4 100%)`,
              boxShadow: `0 0 0 4px ${b.brand_colors.primary}11, 0 12px 30px -8px ${b.brand_colors.primary}55`,
            }}
          >
            <span
              className="absolute -top-2.5 left-3 z-10 inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-full text-white shadow"
              style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary}, #06b6d4)` }}
            >
              <Gift className="h-2.5 w-2.5" /> Featured
            </span>
            <div className="bg-white rounded-[20px] overflow-hidden">
              {liveOffer.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={liveOffer.image_url} alt={liveOffer.title} className="h-32 w-full object-cover" />
              ) : (
                <div className="h-32 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${b.brand_colors.accent} 0%, ${b.brand_colors.secondary} 100%)` }}>
                  <Gift className="h-12 w-12 text-white/80" />
                </div>
              )}
              <div className="p-3">
                <div className="text-base font-extrabold leading-tight text-zinc-900">{liveOffer.title}</div>
                {liveOffer.description && <div className="text-xs text-zinc-500 mt-1">{liveOffer.description}</div>}
                {liveOffer.days_left !== undefined && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-rose-600 font-bold">Expires in {liveOffer.days_left} day{liveOffer.days_left === 1 ? "" : "s"}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top rewards preview */}
      {b.widget_config.rewards_store && rewards.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">Top rewards</h2>
            <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: b.brand_colors.primary }}>
              See all <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {rewards.slice(0, 2).map(r => {
              // CP-27: representative progress in the preview — uses the
              // 50-point demo balance shown on the member card above so the
              // agency sees what the bar will look like.
              const demoPoints = 50;
              const pct = r.point_cost > 0
                ? Math.min(100, (demoPoints / r.point_cost) * 100)
                : 100;
              return (
                <div key={r.id} className="rounded-xl border bg-white overflow-hidden">
                  {r.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.image_url} alt={r.name} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="aspect-[4/3] flex items-center justify-center"
                      style={{ background: `${b.brand_colors.primary}15` }}>
                      <Gift className="h-8 w-8" style={{ color: b.brand_colors.primary }} />
                    </div>
                  )}
                  <div className="p-2.5">
                    <div className="text-[10px] font-bold" style={{ color: b.brand_colors.primary }}>
                      {r.point_cost} POINTS
                    </div>
                    <div className="text-xs font-bold mt-0.5">{r.name}</div>
                    <div className="mt-1.5">
                      <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})`,
                          }}
                        />
                      </div>
                      <div className="text-[9px] font-bold mt-0.5 tabular-nums text-zinc-500">
                        {demoPoints} / {r.point_cost}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CP-24: Membership preview now mirrors the live MembershipSection card
          pixel-for-pixel — branded gradient instead of the off-looking black. */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-bold">Membership preview</h2>
        </div>
        <div
          className="rounded-2xl overflow-hidden p-4 relative"
          style={{
            background: `linear-gradient(160deg, ${b.brand_colors.primary}f2 0%, ${b.brand_colors.primary} 60%, ${b.brand_colors.primary}cc 100%)`,
            border: `1px solid ${b.brand_colors.primary}55`,
            boxShadow: `0 8px 24px ${b.brand_colors.primary}33`,
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)` }}
          />
          <div className="relative">
            <div className="inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full mb-2 bg-white/25 text-white">
              ★ EXCLUSIVE
            </div>
            <div className="text-white text-sm font-extrabold leading-tight drop-shadow-sm">
              {b.name} Membership
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-extrabold text-white">$9.99</span>
              <span className="text-white/80 text-[10px]">/ month</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {/* CP-28: cash credit removed — points-only product. */}
              {[
                { label: "Member savings" },
                { label: "Priority booking" },
                { label: "x1.2 Points" },
                { label: "VIP perks" },
              ].map(b2 => (
                <div
                  key={b2.label}
                  className="text-white text-[10px] font-semibold rounded-lg px-2 py-1.5 bg-white/20"
                  style={{ border: `1px solid rgba(255,255,255,0.35)` }}
                >
                  {b2.label}
                </div>
              ))}
            </div>
            <div
              className="mt-3 text-center text-[10px] font-bold py-2 rounded-xl bg-white"
              style={{ color: b.brand_colors.primary }}
            >
              Become a member →
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-zinc-500 italic">
          Real values pulled from the Membership tab. Configure them once and they replace this preview.
        </p>
      </div>

      {/* News & updates — blog-style feed from the business */}
      {news.length > 0 && (
        <div className="px-4 mt-5 pb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold">News &amp; updates</h2>
            <span className="text-xs font-semibold flex items-center gap-0.5" style={{ color: b.brand_colors.primary }}>
              See all <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="space-y-2">
            {news.slice(0, 3).map(post => (
              <div key={post.id} className="rounded-xl border bg-white overflow-hidden flex">
                {post.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={post.image_url} alt="" className="h-16 w-16 object-cover shrink-0" />
                )}
                <div className="p-2.5 flex-1 min-w-0">
                  <div className="text-xs font-bold leading-tight text-zinc-900 truncate">{post.title}</div>
                  {post.body && <div className="text-[11px] text-zinc-500 leading-snug mt-0.5 line-clamp-2">{post.body}</div>}
                  {post.published_at && (
                    <div className="text-[10px] text-zinc-400 mt-1">
                      {new Date(post.published_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ===================== SHOP ===================== */
function ShopBody({ business: b }: { business: Business }) {
  const services = (b.services ?? []) as Array<{ name: string; category?: string; price_cents?: number }>;
  return (
    <div className="px-4 pt-4">
      <h2 className="text-2xl font-bold mb-3">Shop</h2>
      {services.length === 0 ? (
        <div className="rounded-2xl border bg-white p-10 text-center text-sm text-muted-foreground">
          No products yet — add them in the Products tab.
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((s, i) => (
            <div key={i} className="rounded-xl border bg-white p-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">{s.name}</div>
                {s.category && <div className="text-[11px] text-muted-foreground">{s.category}</div>}
              </div>
              {s.price_cents != null && (
                <div className="text-sm font-bold" style={{ color: b.brand_colors.primary }}>
                  ${(s.price_cents / 100).toFixed(0)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== BOOK ===================== */
function BookBody({ business: b, tags = [] }: { business: Business; tags?: PreviewBookingTag[] }) {
  const placeholders: PreviewBookingTag[] = tags.length === 0
    ? [
        { id: "p1", name: "Consult",  emoji: "✨", duration_minutes: 30 },
        { id: "p2", name: "Service",  emoji: "💼", duration_minutes: 60 },
        { id: "p3", name: "Premium",  emoji: "💎", duration_minutes: 90 },
      ]
    : tags;
  const primary = b.brand_colors.primary;
  return (
    <div className="px-4 pt-4">
      {/* Call Now hero — mirrors the live BookFlow */}
      {b.contact_info?.phone && (
        <div className="rounded-2xl p-3.5 text-white shadow"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-base">📞</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-wider opacity-80 font-bold">Talk to us now</div>
              <div className="text-base font-extrabold leading-tight truncate">{b.contact_info.phone}</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-px bg-zinc-200" />
        <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">or book online</div>
        <div className="flex-1 h-px bg-zinc-200" />
      </div>

      <h2 className="text-base font-bold mt-3">Pick a service</h2>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {placeholders.map(t => (
          <div key={t.id} className="rounded-xl border bg-white overflow-hidden">
            <div className="aspect-video bg-zinc-100 overflow-hidden">
              {t.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.image_url} alt={t.name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-3xl"
                  style={{ background: `${primary}10` }}>
                  {t.emoji ?? "✨"}
                </div>
              )}
            </div>
            <div className="p-2">
              <div className="text-[11px] font-bold leading-tight line-clamp-1">{t.name}</div>
              <div className="text-[9px] text-muted-foreground mt-0.5">
                {t.duration_minutes}m{t.price_cents != null && ` · $${(t.price_cents / 100).toFixed(0)}`}
              </div>
            </div>
          </div>
        ))}
        <div className="rounded-xl border-2 border-dashed bg-white overflow-hidden">
          <div className="aspect-video bg-zinc-50 flex items-center justify-center text-3xl">✨</div>
          <div className="p-2">
            <div className="text-[11px] font-bold">Other</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">Custom request</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===================== SCAN ===================== */
function ScanBody({ business: b }: { business: Business }) {
  return (
    <div className="px-4 pt-4 text-center">
      <h2 className="text-lg font-bold">Show this to staff</h2>
      <p className="text-xs text-muted-foreground mt-1">They'll scan it to find your account.</p>
      <div className="mt-4 rounded-3xl p-6"
        style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary} 0%, ${b.brand_colors.secondary} 100%)` }}>
        <div className="bg-white rounded-2xl p-4 flex items-center justify-center mx-auto" style={{ maxWidth: 220 }}>
          <div className="h-40 w-40 flex items-center justify-center text-zinc-300 text-xs">QR appears here</div>
        </div>
        <div className="mt-3">
          <div className="text-white/85 text-[10px] uppercase tracking-widest">Member code</div>
          <div className="text-white font-mono font-bold text-xl tracking-[0.2em] mt-0.5">ABC123</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== REWARDS ===================== */
function RewardsBody({ business: b, rewards, membershipImageUrl }: { business: Business; rewards: PreviewReward[]; membershipImageUrl?: string | null }) {
  return (
    <>
      <div className="px-4 pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Rewards</h1>
      </div>

      {/* 3D loyalty card — uses membership image if uploaded */}
      <div className="px-4 pt-3">
        <div className="relative rounded-2xl p-5 text-white overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${b.brand_colors.primary} 0%, ${b.brand_colors.secondary} 60%, ${b.brand_colors.primary} 100%)`,
            boxShadow: `0 20px 40px -12px ${b.brand_colors.primary}55`,
          }}>
          {membershipImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={membershipImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
          ) : b.logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={b.logo_url} alt="" className="absolute -right-6 -top-6 h-32 opacity-15 mix-blend-luminosity" />
          )}
          <div className="absolute inset-0 opacity-25 pointer-events-none"
            style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)" }} />
          <div className="relative">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">1,240</span>
              <span className="text-xs font-medium opacity-90">Loyalty Points</span>
            </div>
            <div className="mt-6 flex items-end justify-between">
              <div className="min-w-0">
                <div className="text-base font-semibold">Customer</div>
                <div className="text-[10px] opacity-75 mt-0.5">Joined 1 day ago</div>
              </div>
              {/* CP-28: cash slot removed — points-only. */}
              <div className="text-right shrink-0 ml-3">
                <div className="text-[10px] opacity-75 uppercase tracking-widest font-bold">Tier</div>
                <div className="text-lg font-extrabold leading-none mt-1">Silver</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rewards grid */}
      {rewards.length > 0 && (
        <div className="px-4 mt-5">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-bold">Rewards store</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {rewards.map(r => {
              const demoPoints = 1240; // matches the demo Rewards card above
              const pct = r.point_cost > 0
                ? Math.min(100, (demoPoints / r.point_cost) * 100)
                : 100;
              return (
                <div key={r.id} className="rounded-2xl border bg-white overflow-hidden">
                  {r.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={r.image_url} alt={r.name} className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="aspect-[4/3] flex items-center justify-center"
                      style={{ background: `${b.brand_colors.primary}15` }}>
                      <Gift className="h-10 w-10" style={{ color: b.brand_colors.primary }} />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${b.brand_colors.primary}15`, color: b.brand_colors.primary }}>
                      <Lock className="h-2.5 w-2.5" /> {r.point_cost.toLocaleString()} POINTS
                    </div>
                    <div className="text-sm font-bold mt-1 leading-tight">{r.name}</div>
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})`,
                          }}
                        />
                      </div>
                      <div className="text-[10px] font-bold mt-0.5 tabular-nums text-zinc-500">
                        {demoPoints} / {r.point_cost}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Earn rows — CP-28: matches the livelier live design */}
      <div className="px-4 mt-5">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-bold">Need more points?</h2>
          <span
            className="inline-flex items-center gap-0.5 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full text-white shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})`,
            }}
          >
            <Sparkles className="h-2.5 w-2.5" /> Earn
          </span>
        </div>
        <div className="space-y-2.5">
          {b.widget_config.referrals && <EarnRow icon={<Users   className="h-4 w-4"/>} title="Refer a friend"    points={b.point_rules.referral_referrer} primary={b.brand_colors.primary} secondary={b.brand_colors.secondary} />}
          {b.widget_config.reviews   && <EarnRow icon={<Star    className="h-4 w-4"/>} title="Review on Google"  points={b.point_rules.review}            primary={b.brand_colors.primary} secondary={b.brand_colors.secondary} />}
          {b.widget_config.birthdays && <EarnRow icon={<Calendar className="h-4 w-4"/>} title="Birthday bonus"    points={b.point_rules.birthday}          primary={b.brand_colors.primary} secondary={b.brand_colors.secondary} />}
        </div>
      </div>
    </>
  );
}

/* ===================== PROFILE ===================== */
function ProfileBody({ business: b }: { business: Business }) {
  return (
    <>
      <div className="px-4 pt-6 pb-8 text-white"
        style={{ background: `linear-gradient(135deg, ${b.brand_colors.primary} 0%, ${b.brand_colors.secondary} 100%)` }}>
        <h2 className="text-2xl font-bold">Profile</h2>
        <div className="mt-5 flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold">A</div>
          <div>
            <div className="font-bold">Andrew</div>
            <div className="text-xs text-white/85">Silver member</div>
          </div>
        </div>
      </div>
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-2xl border divide-y">
          <Row label="Email"    value="customer@example.com" />
          <Row label="Phone"    value="(555) 555-5555" />
          <Row label="Birthday" value="Set yours to earn yearly" />
          <Row label="Tier"     value="Silver" />
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 flex items-center justify-between">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}

function BusinessLogo({ business: b }: { business: Business }) {
  if (b.logo_url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={b.logo_url} alt={b.name} className="h-9 max-w-[140px] object-contain" />;
  }
  return (
    <div className="h-9 px-3 rounded-full flex items-center text-white text-xs font-bold max-w-[160px]"
      style={{ background: b.brand_colors.primary }}>
      <span className="truncate">{b.name}</span>
    </div>
  );
}

function TabItem({ icon, label, active, color, onClick }: { icon: React.ReactNode; label: string; active: boolean; color: string; onClick?: () => void }) {
  const content = (
    <>
      <div style={{ color: active ? color : "#9ca3af" }}>{icon}</div>
      <span className="text-[10px] font-semibold" style={{ color: active ? color : "#9ca3af" }}>{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex flex-col items-center gap-0.5 py-1 px-2 flex-1 active:scale-95 transition-transform">
        {content}
      </button>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5 py-1 px-2 flex-1">{content}</div>
  );
}

function EarnRow({ icon, title, points, primary, secondary }: { icon: React.ReactNode; title: string; points: number; primary: string; secondary?: string }) {
  const sec = secondary || primary;
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-3.5"
      style={{
        background: `linear-gradient(135deg, ${primary}08 0%, ${sec}05 100%)`,
        borderColor: `${primary}22`,
      }}
    >
      <div
        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)`,
          boxShadow: `0 4px 12px ${primary}40`,
        }}
      >{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold leading-tight text-zinc-900">{title}</div>
      </div>
      <div
        className="text-xs font-extrabold px-3 py-1.5 rounded-full text-white shrink-0 shadow-md ring-1 ring-white/40"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)`,
          boxShadow: `0 4px 12px ${primary}55`,
        }}
      >
        +{points} Points
      </div>
    </div>
  );
}
