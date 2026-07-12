"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
// CP-73: designable points card (classic/shiny/fun/sleek/simple).
import { pointsCardStyle } from "@/lib/points-card-styles";
import type { Business } from "@/lib/types/database";

/**
 * Home-tab member card. Live-updates points_balance via Supabase Realtime.
 * Smoothly animates the number when it changes.
 *
 * CP-73: the Bronze/Silver/Gold tier label was REMOVED (Andrew's call —
 * tiers are gone from the customer app), and the card now wears one of
 * the points-card style presets picked in the app builder.
 */
export function LiveMemberCard({
  business, membershipId, initialPoints, isMember,
}: {
  business: Business;
  membershipId: string | null;
  initialPoints: number;
  isMember: boolean;
}) {
  const [points, setPoints] = useState(initialPoints);
  const [displayed, setDisplayed] = useState(initialPoints);
  const prevPointsRef = useRef(initialPoints);

  // Realtime subscription
  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`memcard-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "business_memberships", filter: `id=eq.${membershipId}` },
        (payload) => {
          const next = payload.new as { points_balance: number };
          setPoints(next.points_balance);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membershipId]);

  // Smooth count-up animation when points change
  useEffect(() => {
    const from = prevPointsRef.current;
    const to = points;
    if (from === to) return;
    const duration = 800;
    const startedAt = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplayed(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevPointsRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  const css = pointsCardStyle(
    business.points_card_style,
    business.brand_colors.primary,
    business.brand_colors.secondary,
    business.brand_colors.accent,
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-3.5 flex items-center gap-3"
      style={css.container}
    >
      {/* CP-73: shiny preset — diagonal light sweep. */}
      {css.shine && (
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 62%)" }}
        />
      )}
      <div className="relative text-2xl font-bold tracking-tight tabular-nums" style={{ color: css.number }}>
        {displayed.toLocaleString()}
      </div>
      <div className="relative flex-1 min-w-0">
        <div className={`text-[11px] font-semibold leading-tight ${css.dark ? "text-white" : "text-zinc-900"}`}>
          {business.name}
        </div>
        <div className={`text-[10px] mt-0.5 ${css.dark ? "text-white/70" : "text-zinc-500"}`}>points</div>
      </div>
      <div className="relative text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap" style={css.pill}>
        {isMember ? "Member" : "Not A Member"}
      </div>
      <ChevronRight className={`relative h-4 w-4 shrink-0 ${css.dark ? "text-white/60" : "text-zinc-400"}`} />
    </div>
  );
}
