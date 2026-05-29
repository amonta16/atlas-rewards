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
import { useEffect, useMemo, useState } from "react";
import {
  Flame, Gift, Sparkles, Trophy, Check, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Milestone = { count: number; label: string; points: number; mystery?: boolean };

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
};

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

  // Always orange. Brand color stays available for the milestone medal
  // detailing but the cube tray itself is fire-themed.
  const FIRE_FROM = "#fb923c"; // orange-400
  const FIRE_TO   = "#ef4444"; // red-500

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

  const nextMilestone = milestones.find(m => m.count > s.current_streak);
  const progressBar =
    nextMilestone && s.current_streak > 0
      ? Math.min(100, (s.current_streak / nextMilestone.count) * 100)
      : nextMilestone
        ? 0
        : 100;

  const maxPage = Math.max(
    0,
    Math.floor(
      (Math.max(s.current_streak, milestones.at(-1)?.count ?? 0) - 1) / CELLS_PER_PAGE,
    ),
  );

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
          background: `linear-gradient(160deg, ${FIRE_FROM} 0%, ${FIRE_TO} 100%)`,
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
              <div className="text-3xl font-extrabold leading-none tabular-nums">
                {s.current_streak}
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
                  {s.current_streak} / {nextMilestone.count}
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
                const isCurrent  = n === s.current_streak;
                const isFilled   = n <= s.current_streak;
                const isMystery  = milestone?.mystery;
                const isMilestone = !!milestone;
                const isClaimed  =
                  isMilestone && (s.claimed_milestones ?? []).includes(milestone!.count);

                // CP-32: milestone cells get the "heavy white + gold"
                // treatment so the next reward stands out from regular
                // check-in cubes. They're physically larger (scale 115),
                // wear a gold rim, and have a permanent shimmer ring.
                // Filled milestones (already reached but unclaimed) shine
                // brighter still.
                const milestoneRim = isMilestone;
                const goldGradient = `linear-gradient(135deg, #fffbeb 0%, #fef3c7 35%, #fbbf24 70%, #f59e0b 100%)`;

                return (
                  <div key={n} className={`relative aspect-square ${milestoneRim ? "scale-[1.12] z-10" : ""}`}>
                    {/* Cell base */}
                    <div
                      className={`absolute inset-0 rounded-xl transition-all duration-300 ${isCurrent ? "scale-110" : ""}`}
                      style={{
                        background: milestoneRim
                          // Milestones: gold gradient regardless of filled
                          // state — but unfilled ones go translucent.
                          ? (isFilled ? goldGradient : "rgba(255,255,255,0.18)")
                          : isFilled
                            ? `linear-gradient(135deg, #fde047 0%, #f97316 60%, #dc2626 100%)`
                            : "rgba(255,255,255,0.10)",
                        boxShadow: milestoneRim
                          ? isFilled
                            // Heavy gold glow + inset white highlight
                            ? `0 0 0 2.5px #fff, 0 8px 20px -6px rgba(245, 158, 11, 0.9), inset 0 2px 0 rgba(255,255,255,0.7)`
                            : `0 0 0 2px rgba(255, 215, 0, 0.85), inset 0 1px 0 rgba(255,255,255,0.5)`
                          : isFilled
                            ? `0 6px 14px -6px rgba(220, 38, 38, 0.8), inset 0 1px 0 rgba(255,255,255,0.5)`
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

                    {/* Icon + period label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      {isMilestone ? (
                        isClaimed ? (
                          <Trophy className="h-6 w-6 text-amber-900 drop-shadow-lg" />
                        ) : isMystery ? (
                          <Sparkles className={`h-6 w-6 drop-shadow-lg ${isFilled ? "text-amber-900" : "text-amber-100"}`} />
                        ) : (
                          <Gift className={`h-6 w-6 drop-shadow-lg ${isFilled ? "text-amber-900" : "text-amber-100"}`} />
                        )
                      ) : (
                        <Flame
                          className={`h-5 w-5 drop-shadow ${isFilled ? "" : "opacity-40"}`}
                          style={{ color: isFilled ? "#fff7ed" : "rgba(255,255,255,0.6)" }}
                        />
                      )}
                      <div
                        className={`text-[9px] font-extrabold tabular-nums mt-0.5 ${
                          milestoneRim
                            ? (isFilled ? "text-amber-900" : "text-amber-50")
                            : isFilled ? "text-white" : "text-white/55"
                        }`}
                      >
                        {periodWord.charAt(0)}
                        {n}
                      </div>
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
                        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: claimed
                            ? "linear-gradient(135deg, #facc15, #f59e0b)"
                            : reached
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.10)",
                        }}
                      >
                        {claimed ? (
                          <Trophy className="h-4 w-4 text-white" />
                        ) : m.mystery ? (
                          <Sparkles className="h-4 w-4 text-white" />
                        ) : (
                          <Gift className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 text-white min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">
                          {m.label}
                        </div>
                        <div className="text-[10px] opacity-80">
                          {periodWord} {m.count} · +{m.points} pts
                          {m.mystery && " + 🎁"}
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
