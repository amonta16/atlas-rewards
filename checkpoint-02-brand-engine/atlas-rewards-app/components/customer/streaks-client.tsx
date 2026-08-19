"use client";
/**
 * StreaksClient — CP-99 Phase 4
 *
 * The full-page STREAK ROADMAP at /<slug>/app/streaks. A vertical,
 * battle-pass style path (top → bottom) of every check-in period, with
 * milestone rewards as big photo nodes along the way, plus a sticky hero
 * that always shows: the streak count, the personal best, a live
 * "keep it alive" expiration countdown, and progress to the next reward.
 *
 * ADDITIVE ONLY (roadmap Phase 4 rule): reads the exact same
 * get_streak_status RPC + realtime pattern as StreakWidget/StreakMini —
 * the streak ENGINE (streak_config, gift_kind, triggers, notifications)
 * is untouched, and the existing widget/mini stay exactly as they are.
 * Nothing links here yet; the quick-action retarget (#9) ships after this
 * page is verified live.
 *
 * Visual language matches StreakWidget: streak theme gradient (CP-65),
 * white milestone cells w/ gold rim (CP-69), gift_kind-authoritative
 * reward rendering (CP-49), lucide icons only (CP-94 emoji sweep).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Flame, Gift, Trophy, Lock, Check, CalendarDays, ChevronRight, QrCode,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveStreakTheme, streakGradient } from "@/lib/streak-themes";
import type { Business } from "@/lib/types/database";

type Milestone = {
  count: number;
  label: string;
  points: number;
  mystery?: boolean;            // LEGACY/deprecated — ignored for rendering.
  gift_kind?: "points" | "reward";
  reward_id?: string | null;
  reward_image_url?: string | null;
  reward_name?: string | null;
};

type StreakStatus = {
  is_enabled: boolean;
  period_type: "daily" | "weekly" | "monthly";
  checkins_required_per_period: number;
  current_streak: number;
  longest_streak: number;
  total_checkins: number;
  last_checkin_at: string | null;
  checked_in_this_period: boolean;
  milestones: Milestone[];
  claimed_milestones: number[];
  period_start?: string | null;
  period_end?: string | null;
};

// CP-49: gift_kind is authoritative (same rule as StreakWidget).
function isReward(m: Milestone): boolean {
  if (m.gift_kind === "reward") return true;
  if (m.gift_kind === "points") return false;
  return !!m.reward_id;
}

/** "2d 5h" / "5h 32m" / "42m" — compact time-left label. */
function timeLeftLabel(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rem}m`;
  return `${rem}m`;
}

export function StreaksClient({
  business,
  membershipId,
}: {
  business: Business;
  membershipId: string | null;
}) {
  const [s, setS] = useState<StreakStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Ticking clock for the live expiration countdown (1-min resolution).
  const [now, setNow] = useState(() => Date.now());
  const currentRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);

  const theme = resolveStreakTheme(business.streak_theme, business.brand_colors?.primary);
  const primary = business.brand_colors.primary;

  useEffect(() => {
    if (!membershipId) { setLoaded(true); return; }
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      const row = (Array.isArray(data) ? data[0] : data) as StreakStatus | null;
      if (!cancelled) { setS(row); setLoaded(true); }
    };
    load();
    const ch = supabase
      .channel(`streaks-page-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id, membershipId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll the path to the member's current position, once, after load.
  useEffect(() => {
    if (!s || scrolledRef.current || !currentRef.current) return;
    scrolledRef.current = true;
    const el = currentRef.current;
    const t = setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    return () => clearTimeout(t);
  }, [s]);

  const milestones = useMemo<Milestone[]>(
    () => (s ? [...(s.milestones ?? [])].sort((a, b) => a.count - b.count) : []),
    [s],
  );

  if (!loaded) {
    return (
      <div className="px-4 pt-10 flex justify-center">
        <div className="bg-white rounded-2xl px-6 py-4 text-sm text-zinc-600 shadow-sm border">Loading your streak…</div>
      </div>
    );
  }

  if (!membershipId || !s || !s.is_enabled) {
    return (
      <div className="px-4 pt-8">
        <div className="rounded-3xl bg-white border shadow-sm p-8 text-center">
          <Flame className="h-10 w-10 mx-auto text-zinc-300" />
          <div className="mt-3 text-base font-bold text-zinc-800">No streak here yet</div>
          <p className="mt-1 text-sm text-zinc-500">
            {business.name} hasn&apos;t turned on check-in streaks. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  const current = s.current_streak ?? 0;
  const longest = Math.max(s.longest_streak ?? 0, current);
  const atPersonalBest = current > 0 && current >= (s.longest_streak ?? 0);
  const periodWord =
    s.period_type === "weekly" ? "week" :
    s.period_type === "monthly" ? "month" : "day";

  const nextMilestone = milestones.find(m => m.count > current) ?? null;
  const progressPct = nextMilestone
    ? Math.min(100, (current / nextMilestone.count) * 100)
    : 100;

  // Live expiration countdown: period_end is the start of the NEXT period.
  // Not checked in yet → that's the deadline to keep the streak alive.
  // Already checked in → it's when the next check-in window opens.
  const periodEndMs = s.period_end ? new Date(s.period_end).getTime() : null;
  const msLeft = periodEndMs ? periodEndMs - now : null;
  const urgent = !s.checked_in_this_period && msLeft !== null && msLeft < 12 * 3600_000 && current > 0;

  // Path length: through the last milestone, with a little runway past the
  // member's position; minimum one week-like stretch so new members still
  // see a path.
  const lastMilestoneCount = milestones.at(-1)?.count ?? 0;
  const totalNodes = Math.max(lastMilestoneCount, current + 3, 7);
  const nodes = Array.from({ length: totalNodes }, (_, i) => i + 1);
  const milestoneByCount = new Map<number, Milestone>(milestones.map(m => [m.count, m]));

  return (
    <div className="pb-6">
      {/* ============ STICKY HERO ============ */}
      <div
        className="sticky top-0 z-30 px-3 pt-2 pb-2"
        // Native notch: when stuck, the hero sits at the physical top of the
        // screen — pad it so content clears the status bar (0 in browsers).
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        <div
          className="rounded-3xl px-4 pt-3.5 pb-4 text-white shadow-xl ring-1 ring-black/10 relative overflow-hidden"
          style={{ background: streakGradient(theme, 160) }}
        >
          <Flame className="absolute -top-5 -right-5 h-24 w-24 text-white/10 rotate-12 pointer-events-none" />
          <Flame className="absolute -bottom-6 -left-4 h-16 w-16 text-white/10 -rotate-12 pointer-events-none" />
          {/* soft top highlight — gives the gradient a glossy feel */}
          <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)" }} />

          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/40 shrink-0">
              <Flame className="h-8 w-8 drop-shadow-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-black leading-none tabular-nums drop-shadow">{current}</span>
                <span className="text-[11px] uppercase tracking-[0.18em] font-extrabold opacity-90 mb-1">
                  {periodWord} streak
                </span>
              </div>
              {/* CP-99 4b: personal best, straight from get_streak_status. */}
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                <Trophy className="h-3.5 w-3.5 text-amber-200" />
                {atPersonalBest
                  ? <span className="text-amber-100">Personal best — keep it going!</span>
                  : <span className="opacity-90">Best: {longest} {periodWord}{longest === 1 ? "" : "s"}</span>}
              </div>
            </div>
            {/* Checked-in / countdown chip */}
            <div className="shrink-0 text-right">
              {s.checked_in_this_period ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-emerald-400 text-emerald-950">
                  <Check className="h-3 w-3" /> Checked in
                </span>
              ) : msLeft !== null ? (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full ${
                    urgent ? "bg-red-500 text-white animate-pulse" : "bg-white text-zinc-900"
                  }`}
                >
                  <CalendarDays className="h-3 w-3" /> {timeLeftLabel(msLeft)} left
                </span>
              ) : null}
            </div>
          </div>

          {/* Expiration line — the live "keep it alive" timer. */}
          {!s.checked_in_this_period && msLeft !== null && current > 0 && (
            <div className="mt-2 text-[11px] font-bold text-white/95">
              {urgent ? "Your streak is about to reset — " : "Keep your streak alive — "}
              check in within <span className="tabular-nums">{timeLeftLabel(msLeft)}</span>.
            </div>
          )}

          {/* Next-reward progress bar */}
          {nextMilestone && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px] mb-1 opacity-95">
                <span className="font-bold truncate mr-2">
                  Next: {isReward(nextMilestone)
                    ? (nextMilestone.reward_name ?? nextMilestone.label)
                    : `${(nextMilestone.points ?? 0).toLocaleString()} points`}
                </span>
                <span className="tabular-nums font-extrabold shrink-0">{current} / {nextMilestone.count}</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/20 overflow-hidden ring-1 ring-white/30">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${progressPct}%`, boxShadow: "0 0 10px rgba(255,255,255,0.7)" }}
                />
              </div>
            </div>
          )}

          {/* Check-in CTA when the period is still open */}
          {!s.checked_in_this_period && (
            <a
              href={`/${business.slug}/app/scan`}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-extrabold bg-white text-zinc-900 shadow-md active:scale-[0.99] transition"
            >
              <QrCode className="h-4 w-4" /> Check in now
            </a>
          )}
        </div>
      </div>

      {/* ============ VERTICAL ROADMAP ============ */}
      <div className="px-4 mt-4">
        {/* Section title — plain words, readable by anyone. */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold" style={{ color: "var(--surf-fg, #18181b)" }}>
            Your reward road
          </h2>
          <span className="text-[10px] font-extrabold text-white px-2.5 py-1 rounded-full"
            style={{ background: streakGradient(theme) }}>
            Check in every {periodWord} to climb
          </span>
        </div>
        <div className="relative">
          {nodes.map(n => {
            const m = milestoneByCount.get(n) ?? null;
            const filled = n <= current;
            const isNext = n === current + 1;
            const locked = n > current + 1;
            const claimed = !!m && (s.claimed_milestones ?? []).includes(m.count);
            const rewardGift = !!m && isReward(m);
            const pointsGift = !!m && !rewardGift && (m.points ?? 0) > 0;

            // Connector above every node except the first — lit through the
            // member's progress, faint beyond it.
            const connector = n > 1 && (
              <div className="flex justify-center" style={{ width: "3.5rem" }}>
                <div
                  className="w-1.5 rounded-full"
                  style={{
                    height: "1.1rem",
                    background: filled
                      ? `linear-gradient(180deg, ${theme.from}, ${theme.to})`
                      : "rgba(0,0,0,0.08)",
                  }}
                />
              </div>
            );

            return (
              <div key={n} ref={isNext ? currentRef : undefined}>
                {connector}
                <div className="flex items-center gap-3">
                  {/* Node on the spine */}
                  <div className="shrink-0 flex justify-center" style={{ width: "3.5rem" }}>
                    {m ? (
                      // MILESTONE node — white cell + gold rim (CP-69 language),
                      // with the shimmer halo + ★ REWARD tag from the widget.
                      <div className="relative">
                        <div className="absolute -inset-1.5 rounded-3xl pointer-events-none animate-pulse"
                          style={{ background: "radial-gradient(circle, rgba(255,215,0,0.35) 0%, transparent 70%)" }} />
                        <div
                          className={`relative h-14 w-14 rounded-2xl overflow-hidden flex items-center justify-center ${locked ? "saturate-50 opacity-80" : ""}`}
                          style={{
                            background: "#ffffff",
                            boxShadow: filled || claimed
                              ? "0 0 0 2.5px #fff, 0 8px 20px -6px rgba(245,158,11,0.9)"
                              : "0 0 0 2px rgba(245,158,11,0.85), 0 4px 12px -6px rgba(0,0,0,0.25)",
                          }}
                        >
                          {rewardGift && m.reward_image_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={m.reward_image_url} alt={m.reward_name ?? m.label} className="absolute inset-0 h-full w-full object-cover" style={{ opacity: filled ? 1 : 0.65 }} />
                          ) : pointsGift && business.logo_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={business.logo_url} alt="" className="h-9 w-9 object-contain" />
                          ) : (
                            <Gift className="h-6 w-6" style={{ color: theme.to }} />
                          )}
                          {claimed && (
                            <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-emerald-400 ring-2 ring-white flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </span>
                          )}
                        </div>
                        {!claimed && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 text-amber-900 ring-1 ring-white shadow-md whitespace-nowrap">
                            ★ REWARD
                          </span>
                        )}
                      </div>
                    ) : (
                      // Regular period node.
                      <div
                        className={`h-9 w-9 rounded-full flex items-center justify-center ${isNext ? "animate-pulse" : ""}`}
                        style={{
                          background: filled
                            ? `linear-gradient(135deg, ${theme.cell[0]} 0%, ${theme.cell[1]} 60%, ${theme.cell[2]} 100%)`
                            : "#ffffff",
                          boxShadow: filled
                            ? `0 4px 12px -4px ${theme.glow}`
                            : isNext
                              // "you are here" halo in the brand color.
                              ? `inset 0 0 0 1.5px rgba(0,0,0,0.12), 0 0 0 4px ${primary}40`
                              : "inset 0 0 0 1.5px rgba(0,0,0,0.12)",
                        }}
                      >
                        {filled ? (
                          <Flame className="h-4 w-4 text-white drop-shadow" />
                        ) : locked ? (
                          <Lock className="h-3.5 w-3.5 text-zinc-300" />
                        ) : (
                          <Flame className="h-4 w-4 text-zinc-300" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Row content */}
                  {m ? (
                    <div
                      className={`flex-1 rounded-2xl border bg-white shadow-sm ring-1 ring-black/5 overflow-hidden my-1 ${locked ? "opacity-80" : ""}`}
                      style={
                        !claimed && filled
                          // Ready-to-claim: the card glows in the brand color.
                          ? { borderColor: `${primary}55`, boxShadow: `0 0 0 2px ${primary}40, 0 12px 26px -12px ${primary}88` }
                          : filled || claimed
                            ? { borderColor: `${primary}45` }
                            : undefined
                      }
                    >
                      {/* Big photo banner — the reward should look worth chasing. */}
                      {rewardGift && m.reward_image_url && (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.reward_image_url}
                            alt={m.reward_name ?? m.label}
                            className="h-16 w-full object-cover"
                            style={{ opacity: filled ? 1 : 0.8 }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />
                          <div className="absolute bottom-1 left-2.5 right-2.5 text-white text-sm font-black leading-tight truncate drop-shadow">
                            {m.reward_name ?? m.label}
                          </div>
                        </div>
                      )}
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[9px] font-black tracking-wider uppercase" style={{ color: primary }}>
                              ★ {periodWord} {m.count} reward
                            </div>
                            {/* Name lives on the banner when there's a photo. */}
                            {!(rewardGift && m.reward_image_url) && (
                              <div className="text-sm font-bold text-zinc-900 leading-tight truncate mt-0.5">
                                {rewardGift
                                  ? (m.reward_name ?? m.label)
                                  : `${(m.points ?? 0).toLocaleString()} bonus points`}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0">
                            {claimed ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                                <Trophy className="h-3 w-3" /> Claimed
                              </span>
                            ) : filled ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full text-white animate-pulse"
                                style={{ background: `linear-gradient(90deg, ${primary}, ${business.brand_colors.secondary})` }}>
                                Ready to claim
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-zinc-400 whitespace-nowrap">
                                {m.count - current} more check-in{m.count - current === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`flex-1 py-1.5 text-xs font-bold ${filled ? "text-zinc-700" : isNext ? "text-zinc-800" : "text-zinc-400"}`}>
                      {periodWord.charAt(0).toUpperCase() + periodWord.slice(1)} {n}
                      {filled && <Check className="inline-block h-3.5 w-3.5 ml-1.5 -mt-0.5 text-emerald-500" />}
                      {isNext && <span className="ml-1.5 text-[10px] font-extrabold" style={{ color: primary }}>← you are here</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Footer past the last node */}
          {current >= lastMilestoneCount && lastMilestoneCount > 0 ? (
            <div className="flex items-center gap-3 mt-3">
              <div className="shrink-0 flex justify-center" style={{ width: "3.5rem" }}>
                <div className="h-11 w-11 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)", boxShadow: "0 6px 16px -6px rgba(245,158,11,0.8)" }}>
                  <Trophy className="h-5 w-5 text-white drop-shadow" />
                </div>
              </div>
              <div className="text-xs font-extrabold py-1" style={{ color: "var(--surf-fg, #18181b)" }}>
                You reached every reward on the road — amazing! Keep the flame alive.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-2">
              <div className="shrink-0 flex justify-center" style={{ width: "3.5rem" }}>
                <ChevronRight className="h-4 w-4 text-zinc-300 rotate-90" />
              </div>
              <div className="text-[11px] font-bold text-zinc-400 py-1">
                Keep checking in to climb the road.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
