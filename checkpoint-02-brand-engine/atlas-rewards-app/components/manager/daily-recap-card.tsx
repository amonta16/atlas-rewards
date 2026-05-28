"use client";
/**
 * DailyRecapCard — CP-30
 *
 * Hero card at the top of the manager Front desk view. One-glance summary
 * of today's activity, with a smaller "this week" footer line. Reads
 * `manager_daily_recap` and refreshes live whenever the points_ledger,
 * check_in_events, or redemptions tables change.
 *
 * Failure mode: if the RPC isn't installed yet (CP-30 SQL not applied),
 * we silently render nothing rather than blocking the page.
 */

import { useEffect, useState } from "react";
import {
  ScanLine, Sparkles, Gift, Users, Tag, TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Recap = {
  check_ins_today: number;
  points_awarded_today: number;
  rewards_redeemed_today: number;
  active_offers: number;
  new_members_today: number;
  check_ins_week: number;
  points_awarded_week: number;
};

export function DailyRecapCard({
  businessId,
  businessName,
  primary,
  secondary,
}: {
  businessId: string;
  businessName: string;
  primary: string;
  secondary?: string | null;
}) {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [errored, setErrored] = useState(false);

  const sec = secondary || primary;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const { data, error } = await supabase.rpc("manager_daily_recap", {
        p_business_id: businessId,
      });
      if (cancelled) return;
      if (error) {
        setErrored(true);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as Recap | null;
      setRecap(row ?? null);
    };
    load();

    // Realtime: any new ledger / check-in / redemption row → re-pull.
    const ch = supabase
      .channel(`recap-${businessId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "points_ledger", filter: `business_id=eq.${businessId}` },
        load)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "redemptions", filter: `business_id=eq.${businessId}` },
        load)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        load)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [businessId]);

  // RPC missing → hide silently so the page still works pre-migration.
  if (errored || !recap) return null;

  const tiles = [
    { label: "Check-ins",  value: recap.check_ins_today,        icon: <ScanLine className="h-3.5 w-3.5" /> },
    { label: "Points",     value: recap.points_awarded_today,   icon: <Sparkles className="h-3.5 w-3.5" /> },
    { label: "Redemptions",value: recap.rewards_redeemed_today, icon: <Gift className="h-3.5 w-3.5" /> },
    { label: "New members",value: recap.new_members_today,      icon: <Users className="h-3.5 w-3.5" /> },
    { label: "Live offers",value: recap.active_offers,          icon: <Tag className="h-3.5 w-3.5" /> },
  ];

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden"
      style={{ borderColor: `${primary}22` }}
    >
      {/* Header bar */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{
          background: `linear-gradient(135deg, ${primary}10 0%, ${sec}05 100%)`,
        }}
      >
        <span
          className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
        >
          <TrendingUp className="h-2.5 w-2.5" /> Today
        </span>
        <span className="text-[11px] font-semibold text-zinc-600">
          {businessName} · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-5 divide-x border-b">
        {tiles.map((t) => (
          <div key={t.label} className="px-2 py-3 text-center">
            <div className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 inline-flex items-center gap-1">
              {t.icon} {t.label}
            </div>
            <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: primary }}>
              {t.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Week footer */}
      <div className="px-4 py-2 text-[11px] text-zinc-500 flex items-center justify-between">
        <span>Last 7 days</span>
        <span className="font-semibold tabular-nums">
          <span className="text-zinc-700">{recap.check_ins_week.toLocaleString()}</span> check-ins ·{" "}
          <span className="text-zinc-700">{recap.points_awarded_week.toLocaleString()}</span> points
        </span>
      </div>
    </div>
  );
}
