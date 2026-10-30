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

  // CP-42: per-tile color palette — each KPI gets its own vibrant
  // color so the row reads at a glance and feels alive. Was a flat
  // brand-color list which Andrew said felt washed out.
  const tiles = [
    { label: "Check-ins",   value: recap.check_ins_today,        icon: <ScanLine className="h-4 w-4" />,  bg: "bg-emerald-500", soft: "bg-emerald-50",  text: "text-emerald-700" },
    { label: "Points",      value: recap.points_awarded_today,   icon: <Sparkles className="h-4 w-4" />,  bg: "bg-amber-500",   soft: "bg-amber-50",    text: "text-amber-700" },
    { label: "Redemptions", value: recap.rewards_redeemed_today, icon: <Gift className="h-4 w-4" />,      bg: "bg-rose-500",    soft: "bg-rose-50",     text: "text-rose-700" },
    { label: "New members", value: recap.new_members_today,      icon: <Users className="h-4 w-4" />,     bg: "bg-violet-500",  soft: "bg-violet-50",   text: "text-violet-700" },
    { label: "Live offers", value: recap.active_offers,          icon: <Tag className="h-4 w-4" />,       bg: "bg-sky-500",     soft: "bg-sky-50",      text: "text-sky-700" },
  ];

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden shadow-sm"
      style={{ borderColor: `${primary}22` }}
    >
      {/* Header bar — CP-42: full color, white text. Was a soft tint. */}
      <div
        className="px-4 py-3 flex items-center gap-2 text-white"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${sec})`,
        }}
      >
        <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm">
          <TrendingUp className="h-2.5 w-2.5" /> Today
        </span>
        <span className="text-[11px] font-bold text-white/95">
          {businessName} · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </span>
      </div>

      {/* Tiles — CP-42: each KPI gets its own colored block for pop */}
      <div className="grid grid-cols-5 gap-px bg-zinc-100">
        {tiles.map((t) => (
          <div key={t.label} className={"px-2 py-3 text-center bg-white"}>
            <div className={"mx-auto h-8 w-8 rounded-xl flex items-center justify-center text-white shadow-sm " + t.bg}>
              {t.icon}
            </div>
            <div className="text-2xl font-extrabold tabular-nums mt-1.5 text-zinc-900">
              {t.value.toLocaleString()}
            </div>
            <div className={"text-[9px] uppercase tracking-wider font-extrabold mt-0.5 " + t.text}>
              {t.label}
            </div>
          </div>
        ))}
      </div>

      {/* Week footer — CP-42: bolder type, pill-styled numbers */}
      <div
        className="px-4 py-2.5 text-[11px] flex items-center justify-between"
        style={{ background: `${primary}06` }}
      >
        <span className="font-bold uppercase tracking-widest text-zinc-500 text-[9px]">Last 7 days</span>
        <span className="font-bold tabular-nums flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-zinc-900">{recap.check_ins_week.toLocaleString()}</span>
            <span className="text-zinc-500">check-ins</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-zinc-900">{recap.points_awarded_week.toLocaleString()}</span>
            <span className="text-zinc-500">points</span>
          </span>
        </span>
      </div>
    </div>
  );
}
