"use client";
/**
 * StreakMini — CP-43.3
 *
 * A tiny streak "teaser" compartment on the customer Home page. Shows the
 * member how close they are to their FIRST streak reward at a glance
 * ("2 more check-ins until Free Latte") with a slim progress bar and a
 * "View more" button that opens the SAME streak panel as the header flame
 * quick-action (StreakWidget). Self-hides once the first reward is reached
 * (or when streaks/milestones aren't configured) so Home stays clean.
 */
import { useEffect, useMemo, useState } from "react";
import { Flame, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StreakWidget } from "./streak-widget";
import type { Business } from "@/lib/types/database";

type Milestone = { count: number; label: string; points: number; reward_name?: string | null };
type StreakStatus = {
  is_enabled: boolean;
  period_type: "daily" | "weekly" | "monthly";
  current_streak: number;
  milestones: Milestone[];
};

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

  const first = milestones[0];
  const current = s.current_streak ?? 0;
  // Only a teaser until the first reward is earned — then hide.
  if (current >= first.count) return null;

  const remaining = Math.max(1, first.count - current);
  const pct = Math.min(100, (current / first.count) * 100);
  const word =
    s.period_type === "weekly" ? "week" :
    s.period_type === "monthly" ? "month" : "check-in";
  const rewardName = first.reward_name ?? first.label;
  const primary = business.brand_colors.primary;

  // CP-52: compact half-width card for the side-by-side Home row.
  if (compact) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="w-full h-full rounded-2xl overflow-hidden text-left relative active:scale-[0.98] transition-transform shadow-sm p-3 flex flex-col"
          style={{ background: "linear-gradient(135deg, #fb923c 0%, #ef4444 100%)" }}
        >
          <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5 text-white drop-shadow" />
          </div>
          <div className="text-[10px] uppercase tracking-widest font-extrabold text-white/85 mt-2">
            {current > 0 ? `${current} streak` : "Streak"}
          </div>
          <div className="text-sm font-extrabold leading-tight text-white">
            {remaining} more {word}{remaining === 1 ? "" : "s"} → {rewardName}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${pct}%`, boxShadow: "0 0 8px rgba(255,255,255,0.7)" }} />
          </div>
          <span className="mt-2 inline-flex items-center gap-0.5 self-start text-[11px] font-bold bg-white/90 text-zinc-900 px-2.5 py-1 rounded-full">
            View more <ChevronRight className="h-3 w-3" />
          </span>
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
          className="w-full rounded-2xl overflow-hidden text-left relative active:scale-[0.99] transition-transform shadow-sm"
          style={{ background: "linear-gradient(135deg, #fb923c 0%, #ef4444 100%)" }}
        >
          <div className="p-3.5 flex items-center gap-3 text-white">
            <div className="h-11 w-11 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center shrink-0">
              <Flame className="h-6 w-6 drop-shadow" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-extrabold text-white/85">
                {current > 0 ? `${current} streak` : "Start your streak"}
              </div>
              <div className="text-sm font-extrabold leading-tight">
                {remaining} more {word}{remaining === 1 ? "" : "s"} until {rewardName}
              </div>
              {/* slim progress bar */}
              <div className="mt-1.5 h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${pct}%`, boxShadow: "0 0 8px rgba(255,255,255,0.7)" }}
                />
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-0.5 text-xs font-bold bg-white/90 text-zinc-900 px-2.5 py-1.5 rounded-full">
              View more <ChevronRight className="h-3 w-3" />
            </div>
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
