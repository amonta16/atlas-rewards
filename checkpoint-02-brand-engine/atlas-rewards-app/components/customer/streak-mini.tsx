"use client";
/**
 * StreakMini — CP-43.3, rebuilt in CP-70.
 *
 * Andrew's CP-70 call: kill the wordy "2 more weeks → 50% OFF" sentence and
 * replace letters with VISUALS. The Home streak card is now a MINI CUBE
 * TRAY — a horizontal row of little squares (one per day/week/month,
 * whatever the streak period is), filled in white for every period the
 * member has completed. The next cube pulses so you can see exactly where
 * you are; milestone cubes wear a tiny gift so the reward is visible in
 * the tray itself. Tapping still opens the full StreakWidget panel.
 *
 * The tray shows the current 7-period window (1–7, then 8–14, …) so long
 * streaks never squish the cubes.
 */
import { useEffect, useMemo, useState } from "react";
import { Flame, Gift, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StreakWidget } from "./streak-widget";
import { resolveStreakTheme, streakGradient } from "@/lib/streak-themes";
import type { Business } from "@/lib/types/database";

type Milestone = { count: number; label: string; points: number; reward_name?: string | null };
type StreakStatus = {
  is_enabled: boolean;
  period_type: "daily" | "weekly" | "monthly";
  current_streak: number;
  milestones: Milestone[];
};

/** Cubes per tray row — a week-like window reads instantly. */
const WINDOW = 7;

export function StreakMini({
  business,
  membershipId,
  compact = false,
}: {
  business: Business;
  membershipId: string;
  /** CP-52: half-width vertical card for the side-by-side Home row. */
  compact?: boolean;
}) {
  const [s, setS] = useState<StreakStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      const row = (Array.isArray(data) ? data[0] : data) as StreakStatus | null;
      if (!cancelled) setS(row);
    };
    load();
    const ch = supabase
      .channel(`streak-mini-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id, membershipId]);

  const milestones = useMemo<Milestone[]>(
    () => (s ? [...(s.milestones ?? [])].sort((a, b) => a.count - b.count) : []),
    [s],
  );

  if (!s || !s.is_enabled || milestones.length === 0) return null;

  const current = s.current_streak ?? 0;
  const word =
    s.period_type === "weekly" ? "week" :
    s.period_type === "monthly" ? "month" : "day";
  const primary = business.brand_colors.primary;
  // CP-65: themable streak surface (default = classic fire).
  const theme = resolveStreakTheme(business.streak_theme, primary);
  const streakBg = streakGradient(theme);

  // CP-70: the tray shows the 7-period window the member is currently in.
  // A finished window (current = 7, 14, …) stays fully lit until the next
  // period starts a fresh row — the "full tray" moment is the payoff.
  const start = Math.floor(Math.max(current - 1, 0) / WINDOW) * WINDOW + 1;
  const cells = Array.from({ length: WINDOW }, (_, i) => start + i);
  const milestoneCounts = new Set(milestones.map((m) => m.count));

  const cube = (n: number) => {
    const filled = n <= current;
    const isNext = n === current + 1;
    const isMilestone = milestoneCounts.has(n);
    return (
      <div
        key={n}
        className={`relative flex-1 aspect-square rounded-[5px] flex items-center justify-center transition-all ${isNext ? "ring-2 ring-white/90 animate-pulse" : ""}`}
        style={{
          background: filled
            ? "#ffffff"
            : isNext
              ? "rgba(255,255,255,0.28)"
              : "rgba(255,255,255,0.16)",
          boxShadow: filled ? `0 2px 6px -1px ${theme.glow}` : undefined,
        }}
      >
        {isMilestone ? (
          <Gift className="h-2.5 w-2.5" style={{ color: filled ? theme.to : "rgba(255,255,255,0.9)" }} />
        ) : filled ? (
          <Flame className="h-2.5 w-2.5" style={{ color: theme.to }} />
        ) : null}
      </div>
    );
  };

  // CP-52: compact half-width card for the side-by-side Home row.
  if (compact) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="w-full h-full rounded-2xl overflow-hidden text-left relative active:scale-[0.98] transition-transform shadow-md ring-1 ring-black/10 p-3 flex flex-col"
          style={{ background: streakBg }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <Flame className="h-4 w-4 text-white drop-shadow shrink-0" />
              <span className="text-lg font-black text-white leading-none">{current}</span>
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-white/85 truncate">
                {word} streak
              </span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-white/80 shrink-0" />
          </div>
          {/* CP-70: mini cube tray — the streak, as visuals not words. */}
          <div className="mt-auto pt-2.5 flex gap-1">
            {cells.map(cube)}
          </div>
        </button>
        {open && (
          <StreakWidget business={business} membershipId={membershipId} onClose={() => setOpen(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="px-4 mt-4">
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl overflow-hidden text-left relative active:scale-[0.99] transition-transform shadow-sm p-3.5"
          style={{ background: streakBg }}
        >
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center shrink-0">
                <Flame className="h-5 w-5 drop-shadow" />
              </div>
              <div className="min-w-0">
                <span className="text-xl font-black leading-none">{current}</span>
                <span className="ml-1.5 text-[10px] uppercase tracking-widest font-extrabold text-white/85">
                  {word} streak
                </span>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold bg-white/90 text-zinc-900 px-2.5 py-1 rounded-full">
              View <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {/* CP-70: mini cube tray — one cube per period in the current window. */}
          <div className="mt-3 flex gap-1.5">
            {cells.map(cube)}
          </div>
        </button>
      </div>

      {open && (
        <StreakWidget
          business={business}
          membershipId={membershipId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
