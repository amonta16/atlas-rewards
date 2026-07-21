"use client";
/**
 * StreakWidget — CP-24
 *
 * Compact orange "fire" streak panel that opens from the header Flame icon
 * (and the Fast Actions button on the Rewards tab). Replaces the older
 * blue 5-wide "ice-cube tray" that Andrew called out as too big.
 *
 * Design notes:
 *  - Always orange. Streaks read as fire — blue felt wrong.
 *  - 3 columns × 4 rows = 12 cells, which is one full "page" of streak
 *    progress. We page forward in 12-cell windows so the widget grows
 *    week-by-week instead of stretching the tray.
 *  - Each cell shows a Flame icon — filled (gradient + glow) for completed
 *    periods, empty (outline) for upcoming periods. The current period
 *    gets a pulsing ring.
 *  - Milestones reuse the same cell but with a Gift / Sparkles / Trophy
 *    overlay so the streak path still rewards you along the way.
 *  - Modal is constrained to max-w-md (phone width) so it doesn't blow
 *    up on desktop.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Flame, Gift, Sparkles, Trophy, Check, X, ChevronLeft, ChevronRight, Lock, CalendarDays,
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
  // CP-37.1: enrichment fields injected by get_streak_status. When the
  // milestone is configured with a linked reward (gift_kind='reward'),
  // these come back populated and we render the reward's photo inline
  // on the cell instead of the generic Gift icon.
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
  // CP-49: real calendar window of the CURRENT period, so the widget can
  // tell the customer exactly which week/day they're on.
  period_start?: string | null;
  period_end?: string | null;
};

// CP-49: gift_kind is authoritative. A milestone is a REWARD only when
// gift_kind === 'reward'. If gift_kind is missing (legacy rows) we fall
// back to "has a reward_id". This stops a points milestone that still
// carries a stale reward_id from rendering as a reward (and hiding its
// points — the bug Andrew hit on the Starbucks D3 milestone).
function isReward(m: Milestone): boolean {
  if (m.gift_kind === "reward") return true;
  if (m.gift_kind === "points") return false;
  return !!m.reward_id;
}

// 3 columns × 3 rows = 9 cells per "page" (CP-39: was 4 rows; shrunk
// so the whole widget fits without scrolling on phone-sized viewports,
// which prevented the iOS in-app browser chrome from popping up).
const CELLS_PER_PAGE = 9;

export function StreakWidget({
  business,
  membershipId,
  onClose,
}: {
  business: Business;
  membershipId: string;
  onClose: () => void;
}) {
  const [s, setS] = useState<StreakStatus | null>(null);
  // Page within the streak path — 0 = days 1..12, 1 = days 13..24, etc.
  // Default lands on whichever page contains the current streak so the
  // user always sees their progress on open.
  const [page, setPage] = useState(0);
  // CP-65.1: the "streak adding up" moment. When the panel opens right after
  // a check-in, the newest cell starts EMPTY, then pops filled ~0.5s later
  // while the big number counts up — so the customer literally watches their
  // streak grow. One-shot per open.
  const celebratedRef = useRef(false);
  const [celebrate, setCelebrate] = useState(false); // animation armed
  const [landed, setLanded] = useState(false);       // newest cell has filled
  const [burst, setBurst] = useState(false);         // one-shot ping ring + number pop

  // CP-65: themable streak. Default stays classic fire; the agency can pick
  // gold / neon / pink / blue / gray / coffee / midnight / match-my-brand
  // in the brand editor (businesses.streak_theme).
  const theme = resolveStreakTheme(business.streak_theme, business.brand_colors?.primary);
  // CP-69: demo apps always get the count-up moment (and can replay it).
  const isDemo = !!business.is_demo;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      const row = (Array.isArray(data) ? data[0] : data) as StreakStatus | null;
      if (!cancelled) {
        setS(row);
        if (row) setPage(Math.max(0, Math.floor((row.current_streak - 1) / CELLS_PER_PAGE)));
        // CP-65.1: arm the count-up celebration once per open, only when
        // they've actually checked in this period (there's something to add).
        // CP-69: demo apps celebrate on EVERY open — the pitch moment.
        if (row && (row.checked_in_this_period || isDemo) && row.current_streak > 0 && !celebratedRef.current) {
          celebratedRef.current = true;
          setCelebrate(true);
        }
      }
    };
    load();

    const ch = supabase
      .channel(`streak-widget-${membershipId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "check_in_events",
          filter: `membership_id=eq.${membershipId}`,
        },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [business.id, membershipId]);

  // CP-65.1: run the celebration timeline once armed.
  useEffect(() => {
    if (!celebrate) return;
    const t1 = setTimeout(() => { setLanded(true); setBurst(true); }, 550);
    const t2 = setTimeout(() => setBurst(false), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [celebrate]);

  // CP-69: demo replay — rewind the count-up and play it again.
  function demoReplayAnimation() {
    setCelebrate(false);
    setLanded(false);
    setBurst(false);
    setTimeout(() => setCelebrate(true), 60);
  }

  const milestones = useMemo<Milestone[]>(
    () => (s ? [...(s.milestones ?? [])].sort((a, b) => a.count - b.count) : []),
    [s],
  );

  // The window of cells visible on the current page.
  const startN = page * CELLS_PER_PAGE + 1;
  const endN   = startN + CELLS_PER_PAGE - 1;

  const periodWord =
    s?.period_type === "weekly"  ? "Week"  :
    s?.period_type === "monthly" ? "Month" : "Day";

  const cells = useMemo(() => {
    const out: { n: number; milestone: Milestone | null }[] = [];
    for (let n = startN; n <= endN; n++) {
      out.push({ n, milestone: milestones.find(m => m.count === n) ?? null });
    }
    return out;
  }, [startN, endN, milestones]);

  if (!s) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <div className="bg-white rounded-2xl px-6 py-4 text-sm text-zinc-700">Loading streak…</div>
      </div>
    );
  }

  // CP-65.1: the number/cells briefly show the PREVIOUS streak, then tick up —
  // that's the whole "watch it add up" moment.
  const displayStreak = celebrate && !landed ? Math.max(0, s.current_streak - 1) : s.current_streak;

  const nextMilestone = milestones.find(m => m.count > s.current_streak);
  const progressBar =
    nextMilestone && displayStreak > 0
      ? Math.min(100, (displayStreak / nextMilestone.count) * 100)
      : nextMilestone
        ? 0
        : 100;

  const maxPage = Math.max(
    0,
    Math.floor(
      (Math.max(s.current_streak, milestones.at(-1)?.count ?? 0) - 1) / CELLS_PER_PAGE,
    ),
  );

  // CP-49: real calendar window of the current period, so "which week am I
  // on?" is answerable at a glance.
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtWeekday = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const periodStartD = s.period_start ? new Date(s.period_start) : null;
  const periodEndExclusive = s.period_end ? new Date(s.period_end) : null; // start of NEXT period
  const periodEndInclusive = periodEndExclusive ? new Date(periodEndExclusive.getTime() - 86_400_000) : null;
  const lastD = s.last_checkin_at ? new Date(s.last_checkin_at) : null;
  const windowLabel =
    periodStartD && periodEndInclusive
      ? s.period_type === "monthly"
        ? periodStartD.toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : s.period_type === "weekly"
          ? `${fmt(periodStartD)} – ${fmt(periodEndInclusive)}`
          : periodStartD.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none">
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onClose}
      />
      <div
        /* CP-39: smaller top margin + max-h cap so the whole widget fits
           inside the iOS PWA viewport without forcing the user to scroll
           (which is what was triggering the Safari in-app browser bar). */
        className="relative w-full max-w-md mt-4 mx-3 rounded-3xl pointer-events-auto overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: streakGradient(theme, 160),
        }}
      >
        {/* Decorative flame doodles */}
        <Flame className="absolute -top-4 -right-4 h-28 w-28 text-white opacity-10 pointer-events-none" />
        <Flame className="absolute -bottom-6 -left-6 h-20 w-20 text-white opacity-10 pointer-events-none" />

        {/* Header — CP-39: tighter padding to save vertical room */}
        <div className="relative px-5 pt-4 pb-3 text-white">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/25"
            aria-label="Close streak"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/40">
              <Flame className="h-7 w-7 drop-shadow-lg" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-extrabold opacity-90">
                Streak
              </div>
              <div className={`text-3xl font-extrabold leading-none tabular-nums transition-transform duration-300 ${burst ? "scale-125" : ""}`}>
                {displayStreak}
              </div>
              <div className="text-xs opacity-90 mt-0.5">
                {periodWord}
                {s.current_streak === 1 ? "" : "s"} in a row · Longest{" "}
                {s.longest_streak}
              </div>
            </div>
          </div>

          {nextMilestone && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px] mb-1 opacity-90">
                <span>
                  Next: <strong>{nextMilestone.label}</strong>
                </span>
                <span>
                  {displayStreak} / {nextMilestone.count}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-white/20 overflow-hidden ring-1 ring-white/30">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{
                    width: `${progressBar}%`,
                    boxShadow: "0 0 10px rgba(255,255,255,0.7)",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* CP-80 (was CP-49): the banner's job is MOTIVATION, not a
            calendar. The next streak award is now the hero — big, named,
            with a "N to go" line — because "come back and get this" is
            what brings customers in tomorrow. The period/date details
            drop to a one-line footnote (and remain the fallback when
            every milestone is already claimed). */}
        {windowLabel && (
          <div className="px-4 -mt-1 mb-1">
            <div className="rounded-2xl px-3.5 py-2.5 backdrop-blur-md ring-1 ring-white/20 flex items-center gap-2.5"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              {nextMilestone ? (
                <Gift className="h-5 w-5 text-white shrink-0" />
              ) : (
                <CalendarDays className="h-4 w-4 text-white/90 shrink-0" />
              )}
              {nextMilestone ? (
                <div className="flex-1 min-w-0 text-white">
                  <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80">
                    Next streak award
                  </div>
                  <div className="text-lg font-extrabold leading-tight truncate">
                    {nextMilestone.reward_name || nextMilestone.label}
                    {nextMilestone.gift_kind === "points" && nextMilestone.points
                      ? ` · ${nextMilestone.points} pts`
                      : ""}
                  </div>
                  <div className="text-[13px] font-bold opacity-95 mt-0.5">
                    {nextMilestone.count - s.current_streak === 1
                      ? <>Just 1 check-in to go — it&apos;s yours next {periodWord.toLowerCase()}!</>
                      : <>{nextMilestone.count - s.current_streak} check-ins to go</>}
                  </div>
                  <div className="text-[10px] opacity-75 mt-0.5 truncate">
                    This {periodWord.toLowerCase()} · {windowLabel}
                    {lastD ? <> · Last check-in {fmtWeekday(lastD)}</> : null}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0 text-white">
                  <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80">
                    This {periodWord.toLowerCase()}
                  </div>
                  <div className="text-sm font-bold leading-tight truncate">{windowLabel}</div>
                  <div className="text-[11px] opacity-85 mt-0.5">
                    {lastD
                      ? <>Last check-in: {fmtWeekday(lastD)}</>
                      : <>No check-ins yet</>}
                  </div>
                </div>
              )}
              <span
                className={`shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-full whitespace-nowrap ${
                  s.checked_in_this_period
                    ? "bg-emerald-400 text-emerald-950"
                    : "bg-white text-zinc-900"
                }`}
              >
                {s.checked_in_this_period
                  ? "✓ Checked in"
                  : periodEndInclusive
                    ? `Check in by ${fmt(periodEndInclusive)}`
                    : "Check in today"}
              </span>
            </div>
          </div>
        )}

        {/* Tray — CP-39: now 3x3 (9 cells) instead of 3x4. Smaller
            tray + tighter padding so the whole widget fits without scrolling. */}
        <div className="px-4 pb-3">
          <div
            className="rounded-2xl p-3 backdrop-blur-md ring-1 ring-white/20"
            style={{ background: "rgba(255,255,255,0.10)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-[11px] uppercase tracking-[0.2em] font-extrabold text-white/85">
                {periodWord} {startN}–{endN}
              </div>
              <button
                onClick={() => setPage(p => Math.min(maxPage + 1, p + 1))}
                disabled={page >= maxPage + 1}
                className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {cells.map(({ n, milestone }) => {
                // CP-65.1: driven by displayStreak so the newest cell starts
                // empty and pops filled during the count-up celebration.
                const isFilled   = n <= displayStreak;
                // CP-49: the cell you're working toward (next to earn) is the
                // ACTIVE one; everything past it is LOCKED + dimmed so the
                // path reads clearly as done → here → still locked.
                const isNext     = n === displayStreak + 1;
                const isLocked   = n > displayStreak + 1;
                const isCurrent  = isNext;
                const isMystery  = milestone?.mystery;
                const isMilestone = !!milestone;
                // CP-49: gift_kind authoritative (see isReward()).
                const isRewardGift = !!milestone && isReward(milestone!);
                const isPointsGift = isMilestone && !isRewardGift && (milestone!.points ?? 0) > 0;
                const isClaimed  =
                  isMilestone && (s.claimed_milestones ?? []).includes(milestone!.count);

                // CP-32 → CP-69: milestone cells are now WHITE with
                // theme-colored (inverted) content — Andrew's call: white
                // fill + colored text reads far better than gold-on-gold.
                // They keep the larger scale, gold rim, and shimmer ring so
                // the reward still stands out from regular check-in cubes.
                const milestoneRim = isMilestone;
                const milestoneFg = theme.to;

                return (
                  <div
                    key={n}
                    className={`relative aspect-square transition ${milestoneRim ? "scale-[1.12] z-10" : ""} ${
                      // CP-49: locked (not-yet-reachable) cells read as sad +
                      // dimmed. Milestones keep a touch more presence so the
                      // reward is still legible behind the lock.
                      isLocked ? (isMilestone ? "opacity-70 saturate-50" : "opacity-40 grayscale") : ""
                    }`}
                  >
                    {/* Cell base */}
                    <div
                      className={`absolute inset-0 rounded-xl transition-all duration-300 ${isCurrent ? "scale-110" : ""}`}
                      style={{
                        background: milestoneRim
                          // CP-69: white milestone cells — solid when reached,
                          // slightly translucent while still upcoming.
                          ? (isFilled ? "#ffffff" : "rgba(255,255,255,0.9)")
                          : isFilled
                            ? `linear-gradient(135deg, ${theme.cell[0]} 0%, ${theme.cell[1]} 60%, ${theme.cell[2]} 100%)`
                            : "rgba(255,255,255,0.10)",
                        boxShadow: milestoneRim
                          ? isFilled
                            // Heavy gold glow + inset white highlight
                            ? `0 0 0 2.5px #fff, 0 8px 20px -6px rgba(245, 158, 11, 0.9), inset 0 2px 0 rgba(255,255,255,0.7)`
                            : `0 0 0 2px rgba(255, 215, 0, 0.85), inset 0 1px 0 rgba(255,255,255,0.5)`
                          : isFilled
                            ? `0 6px 14px -6px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.5)`
                            : "inset 0 0 0 1.5px rgba(255,255,255,0.25)",
                      }}
                    />

                    {/* Milestone shimmer ring — always visible on milestone cells */}
                    {milestoneRim && (
                      <div className="absolute -inset-1 rounded-2xl pointer-events-none animate-pulse"
                        style={{
                          background: "radial-gradient(circle, rgba(255,215,0,0.35) 0%, transparent 70%)",
                        }}
                      />
                    )}

                    {/* Pulse ring on the current cell */}
                    {isCurrent && (
                      <div className="absolute inset-0 rounded-xl ring-4 ring-yellow-200 ring-offset-2 ring-offset-transparent animate-pulse pointer-events-none" />
                    )}

                    {/* CP-65.1: one-shot burst on the cell that just filled */}
                    {burst && n === s.current_streak && (
                      <div className="absolute -inset-1 rounded-2xl ring-4 ring-white/80 animate-ping pointer-events-none" />
                    )}

                    {/* Icon + period label.
                        CP-37.1: milestone cells now PREFER the linked
                        reward's image (when one is configured). Falls
                        back through:
                          1. reward image (if reward_id set + image_url)
                          2. reward label text (if reward but no image)
                          3. generic Gift / Sparkles / Trophy icon
                        So agencies that wired up a Reward-kind milestone
                        get the actual product photo on the streak path
                        instead of a generic gift icon. */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-1">
                      {isRewardGift && milestone!.reward_image_url ? (
                        // CP-37.2: reward photo fills the cell, but now
                        // overlaid with a heavier bottom scrim + the
                        // reward NAME so a customer can read what they're
                        // working toward without tapping. Andrew called
                        // out the previous version: image alone, no
                        // legible caption.
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={milestone!.reward_image_url!}
                            alt={milestone!.reward_name ?? milestone!.label}
                            className="absolute inset-0 h-full w-full object-cover rounded-xl"
                            style={{ opacity: isFilled ? 1 : 0.55 }}
                          />
                          {/* Heavier bottom scrim — needs to support
                              two-line reward name text legibly. */}
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
                          {isClaimed && (
                            <Trophy className="absolute top-1 right-1 z-10 h-4 w-4 text-amber-300 drop-shadow-lg" />
                          )}
                          {/* Period number — small badge top-left */}
                          <div className="absolute top-1 left-1 z-10 text-[8px] font-extrabold tabular-nums text-white/95 drop-shadow px-1 rounded bg-black/30">
                            {periodWord.charAt(0)}{n}
                          </div>
                          {/* Reward name caption — bottom, two lines */}
                          <div
                            className="absolute bottom-0.5 left-0 right-0 z-10 px-1 text-[8px] leading-[1.05] font-extrabold text-center text-white drop-shadow line-clamp-2"
                            title={milestone!.reward_name ?? milestone!.label}
                          >
                            {milestone!.reward_name ?? milestone!.label}
                          </div>
                        </>
                      ) : isPointsGift ? (
                        // CP-44.1: a POINTS milestone (gift_kind!='reward') →
                        // show the business logo + "<points> pts" instead of a
                        // generic gift/sparkle item.
                        <>
                          {business.logo_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={business.logo_url} alt="" className="h-6 w-6 rounded-md object-contain bg-white/90 p-0.5" />
                          ) : (
                            <span className="text-lg leading-none">⭐</span>
                          )}
                          <div className="text-[10px] leading-none font-black mt-0.5 tabular-nums" style={{ color: milestoneFg }}>
                            {(milestone!.points ?? 0).toLocaleString()}
                          </div>
                          <div className="text-[6px] font-extrabold uppercase tracking-widest" style={{ color: milestoneFg, opacity: 0.75 }}>
                            pts
                          </div>
                        </>
                      ) : isMilestone ? (
                        // Reward configured but no image (icon + name fallback).
                        <>
                          {isClaimed ? (
                            <Trophy className="h-5 w-5 drop-shadow-lg" style={{ color: milestoneFg }} />
                          ) : isMystery ? (
                            <Sparkles className="h-5 w-5 drop-shadow-lg" style={{ color: milestoneFg }} />
                          ) : (
                            <Gift className="h-5 w-5 drop-shadow-lg" style={{ color: milestoneFg }} />
                          )}
                          <div
                            className="text-[8px] leading-[1.05] font-extrabold text-center mt-0.5 line-clamp-2"
                            style={{ color: milestoneFg }}
                            title={milestone!.reward_name ?? milestone!.label}
                          >
                            {milestone!.reward_name ?? milestone!.label}
                          </div>
                        </>
                      ) : (
                        // Regular (non-milestone) check-in cell.
                        // CP-49: done → bright flame; next → flame; locked →
                        // a small padlock so upcoming days read as "not yet".
                        <>
                          {isLocked ? (
                            <Lock className="h-4 w-4 text-white/55" />
                          ) : (
                            <Flame
                              className={`h-5 w-5 drop-shadow ${isFilled ? "" : "opacity-70"}`}
                              style={{ color: isFilled ? "#fff7ed" : "rgba(255,255,255,0.85)" }}
                            />
                          )}
                          <div
                            className={`text-[9px] font-extrabold tabular-nums mt-0.5 ${
                              isFilled ? "text-white" : isNext ? "text-white" : "text-white/55"
                            }`}
                          >
                            {periodWord.charAt(0)}
                            {n}
                          </div>
                        </>
                      )}
                    </div>

                    {/* "REWARD" badge tag on un-claimed milestones */}
                    {milestoneRim && !isClaimed && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-300 to-yellow-400 text-amber-900 ring-1 ring-white shadow-md whitespace-nowrap">
                        ★ REWARD
                      </span>
                    )}

                    {isClaimed && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-white flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CP-69: demo apps can replay the count-up moment on demand. */}
          {isDemo && s.current_streak > 0 && (
            <button
              onClick={demoReplayAnimation}
              className="mt-2 w-full h-9 rounded-xl text-[11px] font-extrabold tracking-widest uppercase text-white/85 bg-white/10 hover:bg-white/20 ring-1 ring-white/20 transition"
            >
              ↻ Demo: replay streak animation
            </button>
          )}

          {/* Milestone legend (compact). CP-39: capped at 28vh so it can
              scroll independently rather than forcing the whole sheet to. */}
          {milestones.length > 0 && (
            <div
              className="mt-2 rounded-2xl p-2.5 backdrop-blur-md ring-1 ring-white/20"
              style={{ background: "rgba(255,255,255,0.10)" }}
            >
              <div className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-white/85 mb-1.5">
                Rewards along the way
              </div>
              <div className="space-y-1 max-h-[26vh] overflow-y-auto pr-1">
                {milestones.map(m => {
                  const claimed = (s.claimed_milestones ?? []).includes(m.count);
                  const reached = s.current_streak >= m.count;
                  // CP-49: gift_kind authoritative (see isReward()).
                  const isRewardGift = isReward(m);
                  const isPointsGift = !isRewardGift && (m.points ?? 0) > 0;
                  return (
                    <div
                      key={m.count}
                      className="flex items-center gap-2 rounded-lg p-2 ring-1 ring-white/15"
                      style={{
                        background: claimed
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(255,255,255,0.05)",
                      }}
                    >
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden"
                        style={{
                          background: claimed
                            ? "linear-gradient(135deg, #facc15, #f59e0b)"
                            : reached
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.10)",
                        }}
                      >
                        {/* CP-37.1: prefer the linked reward's photo. */}
                        {isRewardGift && m.reward_image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={m.reward_image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : isPointsGift && business.logo_url ? (
                          // CP-44.1: points milestone → business logo.
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={business.logo_url} alt="" className="h-full w-full object-contain bg-white p-0.5" />
                        ) : claimed ? (
                          <Trophy className="h-4 w-4 text-white" />
                        ) : isPointsGift ? (
                          <Sparkles className="h-4 w-4 text-white" />
                        ) : (
                          <Gift className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 text-white min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">
                          {/* CP-37.1: reward → its name. CP-44.1: points → "<n> points". */}
                          {isRewardGift ? (m.reward_name ?? m.label) : isPointsGift ? `${m.points.toLocaleString()} points` : m.label}
                        </div>
                        <div className="text-[10px] opacity-80">
                          {periodWord} {m.count} · +{m.points} pts
                        </div>
                      </div>
                      {!claimed && reached && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-white text-zinc-900">
                          Ready
                        </span>
                      )}
                      {!reached && (
                        <span className="text-[10px] font-bold text-white/70 whitespace-nowrap">
                          {m.count - s.current_streak} to go
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
