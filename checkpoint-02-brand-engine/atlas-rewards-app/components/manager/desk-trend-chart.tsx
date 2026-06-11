"use client";
/**
 * DeskTrendChart — CP-46
 *
 * At-a-glance trend graphs on the manager Front-desk view, mirroring the
 * kind of visual the agency/admin Insights tab gets. Reads
 * manager_daily_series(business, 14) and draws lightweight inline-SVG bar
 * charts (no chart lib) for check-ins and points per day, with a points
 * trend line on top. Refreshes live on new ledger / check-in rows.
 *
 * Self-hides if the RPC isn't installed yet (pre-CP-46 migration) so the
 * page keeps working.
 */

import { useEffect, useMemo, useState } from "react";
import { ScanLine, Sparkles, Users, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  day: string;            // ISO date
  check_ins: number;
  points_awarded: number;
  new_members: number;
};

export function DeskTrendChart({
  businessId,
  primary,
  secondary,
}: {
  businessId: string;
  primary: string;
  secondary?: string | null;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [errored, setErrored] = useState(false);
  const sec = secondary || primary;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      const { data, error } = await supabase.rpc("manager_daily_series", {
        p_business_id: businessId,
        p_days: 14,
      });
      if (cancelled) return;
      if (error) { setErrored(true); return; }
      setRows((data ?? []) as Row[]);
    };
    load();
    const ch = supabase
      .channel(`desk-trend-${businessId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "points_ledger", filter: `business_id=eq.${businessId}` }, load)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `business_id=eq.${businessId}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [businessId]);

  const totals = useMemo(() => {
    const r = rows ?? [];
    return {
      checkIns: r.reduce((s, d) => s + d.check_ins, 0),
      points: r.reduce((s, d) => s + d.points_awarded, 0),
      members: r.reduce((s, d) => s + d.new_members, 0),
    };
  }, [rows]);

  if (errored || !rows || rows.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: `${primary}22` }}>
      <div className="px-4 py-3 flex items-center gap-2 border-b">
        <TrendingUp className="h-4 w-4" style={{ color: primary }} />
        <h3 className="font-bold text-sm">Last 14 days</h3>
        <span className="ml-auto text-[11px] text-zinc-400 font-medium">updates live</span>
      </div>

      <div className="grid grid-cols-3 divide-x">
        <Summary icon={<ScanLine className="h-3.5 w-3.5" />} label="Check-ins" value={totals.checkIns} color="#10b981" />
        <Summary icon={<Sparkles className="h-3.5 w-3.5" />} label="Points" value={totals.points} color="#f59e0b" />
        <Summary icon={<Users className="h-3.5 w-3.5" />} label="New members" value={totals.members} color="#8b5cf6" />
      </div>

      <div className="p-4 space-y-4">
        <BarChart rows={rows} field="check_ins" label="Check-ins per day" color={primary} accent={sec} />
        <BarChart rows={rows} field="points_awarded" label="Points awarded per day" color="#f59e0b" accent="#fbbf24" />
      </div>
    </div>
  );
}

function Summary({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="px-3 py-3 text-center">
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold" style={{ color }}>
        {icon}{label}
      </div>
      <div className="text-2xl font-extrabold tabular-nums text-zinc-900 mt-0.5">{value.toLocaleString()}</div>
    </div>
  );
}

function BarChart({
  rows, field, label, color, accent,
}: {
  rows: Row[]; field: "check_ins" | "points_awarded"; label: string; color: string; accent: string;
}) {
  const W = 320, H = 90, padB = 16, padT = 6;
  const n = rows.length;
  const max = Math.max(1, ...rows.map(r => r[field]));
  const slot = W / n;
  const barW = Math.max(3, slot * 0.6);

  return (
    <div>
      <div className="text-[11px] font-bold text-zinc-500 mb-1.5">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }} role="img" aria-label={label}>
        <defs>
          <linearGradient id={`bar-${field}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={accent} stopOpacity="0.75" />
          </linearGradient>
        </defs>
        {rows.map((r, i) => {
          const v = r[field];
          const h = (v / max) * (H - padB - padT);
          const x = i * slot + (slot - barW) / 2;
          const y = H - padB - h;
          const d = new Date(r.day);
          const isToday = i === n - 1;
          return (
            <g key={r.day}>
              <rect
                x={x} y={y} width={barW} height={Math.max(h, v > 0 ? 2 : 0)}
                rx={2} fill={`url(#bar-${field})`} opacity={isToday ? 1 : 0.85}
              >
                <title>{`${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${v.toLocaleString()}`}</title>
              </rect>
              {(i === 0 || isToday || i === Math.floor(n / 2)) && (
                <text x={i * slot + slot / 2} y={H - 4} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 8 }}>
                  {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
