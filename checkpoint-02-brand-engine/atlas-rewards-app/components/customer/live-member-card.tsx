"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

/**
 * Home-tab member card. Live-updates points_balance + tier via Supabase Realtime.
 * Smoothly animates the number when it changes.
 */
export function LiveMemberCard({
  business, membershipId, initialPoints, initialTier, isMember,
}: {
  business: Business;
  membershipId: string | null;
  initialPoints: number;
  initialTier: string;
  isMember: boolean;
}) {
  const [points, setPoints] = useState(initialPoints);
  const [tier, setTier] = useState(initialTier);
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
          const next = payload.new as { points_balance: number; tier: string };
          setPoints(next.points_balance);
          setTier(next.tier);
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

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-zinc-100 p-3.5 flex items-center gap-3">
      <div className="text-2xl font-bold tracking-tight tabular-nums" style={{ color: business.brand_colors.primary }}>
        {displayed.toLocaleString()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold leading-tight text-zinc-900">{business.name}</div>
        <div className="text-[10px] text-zinc-500 mt-0.5">points · {tier}</div>
      </div>
      <div className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
        style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
        {isMember ? "Member" : "Not A Member"}
      </div>
      <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
    </div>
  );
}
