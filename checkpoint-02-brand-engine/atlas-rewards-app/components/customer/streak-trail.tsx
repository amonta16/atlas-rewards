"use client";
import { useEffect, useState } from "react";
import { Flame, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StreakWidget } from "./streak-widget";
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

export function StreakTrail({
  business,
  membershipId,
}: {
  business: Business;
  membershipId: string;
}) {
  const [s, setS] = useState<StreakStatus | null>(null);
  const [open, setOpen] = useState(false);
  // CP-24: always-orange fire theme. The streak surface is "fire" — Andrew
  // called this out — so it no longer inherits the brand's primary/secondary.
  const FIRE_FROM = "#fb923c";
  const FIRE_TO   = "#ef4444";

  useEffect(() => {
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
      .channel(`streak-${membershipId}`)
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

  if (!s || !s.is_enabled || (s.milestones?.length ?? 0) === 0) return null;

  return (
    <>
      {/* ============ COMPACT FIRE PILL (always visible on Rewards) ============ */}
      <div className="px-4 mt-5">
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl p-4 text-left flex items-center gap-3 shadow-md active:scale-[0.99] transition relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${FIRE_FROM} 0%, ${FIRE_TO} 100%)`,
          }}
        >
          {/* Decorative flame doodles */}
          <Flame className="absolute -top-3 -right-3 h-24 w-24 text-white opacity-10" />
          <Flame className="absolute -bottom-4 left-12 h-12 w-12 text-white opacity-5" />

          {/* Animated flame block */}
          <div className="relative h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 ring-2 ring-white/40">
            <Flame className="h-8 w-8 text-white drop-shadow-lg" />
            {s.checked_in_this_period && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-400 ring-2 ring-white flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 text-white">
            <div className="text-[11px] uppercase tracking-widest font-extrabold opacity-90">
              Streak
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold tabular-nums leading-none">
                {s.current_streak}
              </span>
              <span className="text-sm font-bold opacity-90">in a row</span>
            </div>
            <div className="text-[12px] opacity-90 mt-0.5">
              {s.checked_in_this_period
                ? "Locked in for today 🔥"
                : s.current_streak > 0
                  ? "Come in today to keep it alive"
                  : "Tap to see the path →"}
            </div>
          </div>

          <div className="shrink-0 text-white text-2xl font-extrabold opacity-80 pr-1">
            ›
          </div>
        </button>
      </div>

      {/* ============ CP-24 — compact 3x4 orange widget ============ */}
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
