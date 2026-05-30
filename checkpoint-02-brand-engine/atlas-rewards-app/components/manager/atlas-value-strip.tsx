"use client";
/**
 * AtlasValueStrip — CP-42
 *
 * Top-of-front-desk hero strip that proves Atlas's value at a glance.
 * Designed to make cancellation feel painful — the moment a manager
 * loads /manage they see in big bold numbers what Atlas drove for them.
 *
 * Data source: public.atlas_impact_rollup(p_business_id) — same RPC
 * powering the Insights tab, so the numbers stay consistent.
 *
 * Self-hides if the RPC isn't installed or returns null.
 */
import { useEffect, useState } from "react";
import {
  DollarSign, Repeat, Star, Sparkles, TrendingUp, ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Rollup = {
  driven_revenue_cents: number | null;
  repeat_visit_lift_pct: number | null;
  reviews_generated: number | null;
  reviews_generated_30d: number | null;
  estimated_review_value_cents: number | null;
  estimated_winback_cents: number | null;
  active_member_count: number | null;
  // optional fields if the RPC ever adds them
  [key: string]: number | null | undefined;
};

export function AtlasValueStrip({
  businessId,
  primary,
  secondary,
}: {
  businessId: string;
  primary: string;
  secondary?: string | null;
}) {
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [errored, setErrored] = useState(false);

  const sec = secondary || primary;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("atlas_impact_rollup", {
        p_business_id: businessId,
      });
      if (cancelled) return;
      if (error) { setErrored(true); return; }
      const row = (Array.isArray(data) ? data[0] : data) as Rollup | null;
      setRollup(row);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  if (errored || !rollup) return null;

  const drivenDollars      = Math.round((rollup.driven_revenue_cents       ?? 0) / 100);
  const reviewValueDollars = Math.round((rollup.estimated_review_value_cents ?? 0) / 100);
  const winbackDollars     = Math.round((rollup.estimated_winback_cents     ?? 0) / 100);
  const totalLift = drivenDollars + reviewValueDollars + winbackDollars;

  const liftPct  = Math.round(rollup.repeat_visit_lift_pct ?? 0);
  const reviews  = rollup.reviews_generated ?? 0;
  const reviews30 = rollup.reviews_generated_30d ?? 0;

  return (
    <div
      className="rounded-3xl overflow-hidden relative text-white shadow-xl"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${sec} 70%, ${primary} 100%)`,
      }}
    >
      {/* Decorative shapes */}
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-black/10 blur-3xl pointer-events-none" />

      {/* Top bar */}
      <div className="px-5 pt-4 pb-1 flex items-center justify-between relative">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
          <ShieldCheck className="h-3 w-3" /> Powered by Atlas
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-white/85">
          <TrendingUp className="h-3 w-3" /> Lifetime impact
        </div>
      </div>

      {/* Hero number */}
      <div className="px-5 pb-4 pt-2 relative">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black tabular-nums leading-none drop-shadow-md">
            ${totalLift.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-white/90">driven for you</span>
        </div>
        <div className="text-xs text-white/85 mt-1.5 leading-snug">
          Repeat-visit revenue, review value, and win-backs Atlas has generated since you turned it on.
        </div>
      </div>

      {/* Sub-stat tiles */}
      <div className="grid grid-cols-3 divide-x divide-white/20 border-t border-white/20 backdrop-blur-sm bg-black/5">
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          value={`$${drivenDollars.toLocaleString()}`}
          label="Repeat visits"
        />
        <Stat
          icon={<Repeat className="h-4 w-4" />}
          value={liftPct > 0 ? `+${liftPct}%` : `${liftPct}%`}
          label="Visit lift"
        />
        <Stat
          icon={<Star className="h-4 w-4" />}
          value={reviews.toLocaleString()}
          label={`${reviews30} this month`}
        />
      </div>
    </div>
  );
}

function Stat({
  icon, value, label,
}: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className="inline-flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest font-bold text-white/85">
        {icon}
      </div>
      <div className="text-xl font-black tabular-nums mt-0.5 leading-tight drop-shadow-sm">
        {value}
      </div>
      <div className="text-[10px] text-white/80 mt-0.5">{label}</div>
    </div>
  );
}
