"use client";
/**
 * ShopClient — CP-42
 *
 * Customer-facing rewards catalog. Rewards are grouped by `category`
 * and rendered as horizontal scroll rows (McDonald's / Starbucks UX)
 * with a sticky points-balance header at the top.
 *
 * Tapping a card you can afford opens the existing redeem flow on the
 * Rewards tab (we route via /app/rewards?redeem=<reward_id> so we
 * don't reimplement redemption here).
 */
import { useMemo, useState } from "react";
import { Gift, Lock, Sparkles, Search, ChevronRight } from "lucide-react";
import type { Business } from "@/lib/types/database";

type Reward = {
  id: string;
  name: string;
  description: string | null;
  point_cost: number;
  image_url: string | null;
  category: string | null;
  sort_order: number;
};

const UNCATEGORIZED = "Other rewards";

export function ShopClient({
  business,
  rewards,
  pointsBalance,
}: {
  business: Business;
  rewards: Reward[];
  pointsBalance: number;
}) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary ?? primary;

  const [query, setQuery] = useState("");

  // Group → ordered list of [category, rewards[]] pairs.
  // Categories that exist on this business appear in the order their
  // first reward was sorted; uncategorized goes last.
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rewards.filter(r =>
          r.name.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          (r.category ?? "").toLowerCase().includes(q),
        )
      : rewards;

    const order: string[] = [];
    const map = new Map<string, Reward[]>();
    for (const r of filtered) {
      const c = (r.category && r.category.trim()) || UNCATEGORIZED;
      if (!map.has(c)) { map.set(c, []); order.push(c); }
      map.get(c)!.push(r);
    }
    // Push UNCATEGORIZED bucket to the end
    const sortedOrder = order.filter(c => c !== UNCATEGORIZED);
    if (map.has(UNCATEGORIZED)) sortedOrder.push(UNCATEGORIZED);
    return sortedOrder.map(c => [c, map.get(c)!] as const);
  }, [rewards, query]);

  // Affordable rewards (separate "Ready to redeem" pinned row)
  const affordable = useMemo(
    () => rewards.filter(r => r.point_cost <= pointsBalance).slice(0, 8),
    [rewards, pointsBalance],
  );

  return (
    <div className="pb-8">
      {/* Sticky brand header with points balance */}
      <div
        className="sticky top-0 z-30 text-white"
        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
      >
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-90">Your balance</div>
              <div className="text-3xl font-black tabular-nums leading-tight">
                {pointsBalance.toLocaleString()}
                <span className="text-sm font-bold opacity-85 ml-1">pts</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-90">Rewards shop</div>
              <div className="text-sm font-bold">{business.name}</div>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rewards…"
              className="w-full pl-9 pr-3 py-2 rounded-full text-sm bg-white/20 backdrop-blur-sm placeholder-white/70 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
          </div>
        </div>
      </div>

      {/* Affordable strip — Starbucks "Available to redeem" style */}
      {affordable.length > 0 && !query && (
        <Section
          title="Ready to redeem"
          subtitle="You've got enough points for these right now"
          icon={<Sparkles className="h-4 w-4" />}
          accent={primary}
          highlight
        >
          <ScrollRow>
            {affordable.map(r => (
              <CardSmall
                key={r.id}
                reward={r}
                pointsBalance={pointsBalance}
                primary={primary}
                businessSlug={business.slug}
              />
            ))}
          </ScrollRow>
        </Section>
      )}

      {/* Categories */}
      {grouped.length === 0 && (
        <div className="px-6 mt-10 text-center text-sm text-zinc-500">
          {query ? "Nothing matches that search." : "No rewards in the shop yet — check back soon."}
        </div>
      )}

      {grouped.map(([category, list]) => (
        <Section
          key={category}
          title={category}
          subtitle={`${list.length} reward${list.length === 1 ? "" : "s"}`}
          icon={<Gift className="h-4 w-4" />}
          accent={primary}
        >
          <div className="grid grid-cols-2 gap-3 px-4">
            {list.map(r => (
              <CardLarge
                key={r.id}
                reward={r}
                pointsBalance={pointsBalance}
                primary={primary}
                businessSlug={business.slug}
              />
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function Section({
  title, subtitle, icon, accent, highlight, children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  accent: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={"mt-5 " + (highlight ? "pb-3" : "")}>
      <div className="px-4 flex items-baseline justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
          >
            {icon}
          </div>
          <div>
            <h2 className="text-base font-extrabold leading-tight">{title}</h2>
            {subtitle && <div className="text-[11px] text-zinc-500 leading-tight">{subtitle}</div>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
      <div className="flex gap-3 min-w-min">{children}</div>
    </div>
  );
}

function CardSmall({
  reward, pointsBalance, primary, businessSlug,
}: { reward: Reward; pointsBalance: number; primary: string; businessSlug: string }) {
  const locked = pointsBalance < reward.point_cost;
  return (
    <a
      href={`/${businessSlug}/app/rewards?redeem=${reward.id}`}
      className="shrink-0 w-40 rounded-2xl border bg-white overflow-hidden hover:shadow-md transition-shadow"
      style={{ borderColor: locked ? undefined : primary + "55" }}
    >
      <RewardImage reward={reward} primary={primary} className="aspect-square" />
      <div className="p-2.5">
        <div className="text-xs font-extrabold truncate">{reward.name}</div>
        <div className="text-[10px] font-bold mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{ background: `${primary}15`, color: primary }}>
          <Sparkles className="h-2.5 w-2.5" /> {reward.point_cost.toLocaleString()} pts
        </div>
      </div>
    </a>
  );
}

function CardLarge({
  reward, pointsBalance, primary, businessSlug,
}: { reward: Reward; pointsBalance: number; primary: string; businessSlug: string }) {
  const locked = pointsBalance < reward.point_cost;
  const pct = reward.point_cost > 0
    ? Math.min(100, (pointsBalance / reward.point_cost) * 100)
    : 100;
  const remaining = Math.max(0, reward.point_cost - pointsBalance);

  return (
    <a
      href={`/${businessSlug}/app/rewards?redeem=${reward.id}`}
      className="rounded-2xl border bg-white overflow-hidden text-left hover:shadow-md transition-shadow active:scale-[0.98]"
      style={{ borderColor: locked ? undefined : primary + "55" }}
    >
      <RewardImage reward={reward} primary={primary} className="aspect-[4/3]" />
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="text-[10px] font-extrabold inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{ background: locked ? "#f4f4f5" : `${primary}15`, color: locked ? "#71717a" : primary }}>
            {locked ? <Lock className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
            {reward.point_cost.toLocaleString()} pts
          </div>
        </div>
        <div className={"text-sm font-bold leading-snug " + (locked ? "text-zinc-500" : "text-zinc-900")}>
          {reward.name}
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: locked ? "#9ca3af" : `linear-gradient(90deg, ${primary}, ${primary}cc)`,
            }}
          />
        </div>
        <div className="text-[10px] text-zinc-500 mt-1.5 flex items-center justify-between">
          {locked
            ? <span>{remaining.toLocaleString()} to go</span>
            : <span className="font-bold flex items-center gap-0.5" style={{ color: primary }}>
                Tap to redeem <ChevronRight className="h-3 w-3" />
              </span>}
        </div>
      </div>
    </a>
  );
}

function RewardImage({
  reward, primary, className,
}: { reward: Reward; primary: string; className?: string }) {
  if (reward.image_url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={reward.image_url} alt={reward.name} className={"w-full object-cover " + (className ?? "")} />;
  }
  return (
    <div
      className={"w-full flex items-center justify-center " + (className ?? "")}
      style={{ background: `linear-gradient(135deg, ${primary}1a, ${primary}33)` }}
    >
      <Gift className="h-8 w-8" style={{ color: primary }} />
    </div>
  );
}
