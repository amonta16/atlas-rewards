"use client";
/**
 * WeeklySpinInsights — CP-221 · is the free weekly home spin working?
 *
 * One card on Insights (manager dashboard), fed by weekly_spin_insights.
 * Every number is a row count: home spins (mystery_reward_spins.source =
 * 'home'), weekly-spin pushes (notifications.kind = 'weekly_spin') and
 * check-ins that followed a home spin within 7 days. Hidden when the
 * feature is off and has never been used, or before the SQL is applied.
 */
import { useEffect, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, Minus, Bell, Footprints, Gift, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

type Stats = {
  spins: number; spinners: number; checkin_spins: number; prizes_won: number; points_won: number;
  visited_after: number; notified: number; members_reached: number; spun_after_push: number;
};
type Data = {
  enabled: boolean; members: number; week_start: string;
  this_week: Stats; d30: Stats; prev30: Stats;
  weeks: { week_start: string; spins: number }[];
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!now && !prev) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-zinc-400"><Minus className="h-3 w-3" /> no change</span>;
  if (!prev) return <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-emerald-600"><TrendingUp className="h-3 w-3" /> new</span>;
  const p = Math.round(((now - prev) / prev) * 100);
  if (p === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-zinc-500"><Minus className="h-3 w-3" /> flat</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-extrabold", p > 0 ? "text-emerald-600" : "text-rose-600")}>
      {p > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{p > 0 ? "+" : ""}{p}%
    </span>
  );
}

export function WeeklySpinInsights({ business }: { business: Business }) {
  const primary = business.brand_colors.primary;
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    let off = false;
    createClient().rpc("weekly_spin_insights", { p_business_id: business.id }).then(({ data, error }) => {
      if (!off && !error && data) setD(data as Data);
    });
    return () => { off = true; };
  }, [business.id]);

  if (!d || (!d.enabled && d.d30.spins === 0 && d.this_week.spins === 0)) return null;

  const w = d.this_week, m = d.d30;
  const weekRate = pct(w.spinners, d.members);
  const cameIn = pct(m.visited_after, m.spins);
  const fromPush = pct(m.spun_after_push, m.spins);
  const max = Math.max(1, ...d.weeks.map((x) => x.spins));

  return (
    <div className="rounded-2xl border-2 border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-end justify-between gap-3 flex-wrap border-b-2 border-zinc-100">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-600">Weekly home spin</div>
          <h3 className="text-lg font-black leading-tight">Is the free weekly spin bringing them in?</h3>
          <p className="text-[12px] text-zinc-500">
            One free wheel spin from home per member per week{d.enabled ? "" : " · currently switched off"}.
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tabular-nums leading-none">{weekRate}%</div>
          <div className="text-[11px] font-bold text-zinc-500 mt-1">{w.spinners} of {d.members.toLocaleString()} members spun this week</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0.5 bg-zinc-100 border-b-2 border-zinc-100">
        <Stat icon={<Sparkles className="h-4 w-4" />} color={primary} label="Home spins · 30 days" value={m.spins}
          sub={<><Delta now={m.spins} prev={d.prev30.spins} /> · {m.spinners} people</>} />
        <Stat icon={<Footprints className="h-4 w-4" />} color="#059669" label="Came in within 7 days" value={`${cameIn}%`}
          sub={<>{m.visited_after} of {m.spins} home spins → a check-in</>} />
        <Stat icon={<Bell className="h-4 w-4" />} color="#2563eb" label="Spin pushes sent" value={m.notified}
          sub={<>{m.members_reached} members · {fromPush}% of spins came within 48 h</>} />
        <Stat icon={<Gift className="h-4 w-4" />} color="#d97706" label="Won from home" value={m.prizes_won}
          sub={<>prizes · {m.points_won.toLocaleString()} pts</>} />
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] font-extrabold text-zinc-700 flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Home spins per week · last 8 weeks</div>
          <div className="text-[11px] font-semibold text-zinc-500">{m.checkin_spins} visit spins in the same 30 days</div>
        </div>
        <div className="h-24 flex items-end gap-1.5 border-b-2 border-zinc-200 pb-px">
          {d.weeks.map((x, i) => {
            const last = i === d.weeks.length - 1;
            return (
              <div key={x.week_start} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group"
                title={`Week of ${new Date(x.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${x.spins}`}>
                <div className={cn("text-[10px] font-extrabold tabular-nums", last ? "text-zinc-900" : "text-zinc-400 opacity-0 group-hover:opacity-100 transition")}>{x.spins}</div>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(3, Math.round((x.spins / max) * 100))}%`, background: last ? primary : `${primary}${x.spins ? "80" : "22"}` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] font-semibold text-zinc-500 mt-1.5">
          <span>{d.weeks[0] ? new Date(d.weeks[0].week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
          <span>this week</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, color, label, value, sub }: { icon: React.ReactNode; color: string; label: string; value: number | string; sub: React.ReactNode }) {
  return (
    <div className="p-4 bg-white min-w-0">
      <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${color}18`, color }}>{icon}</span>
      <div className="mt-2 text-2xl font-black tabular-nums leading-none">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] font-black uppercase tracking-wider text-zinc-700 mt-1.5">{label}</div>
      <div className="text-[11px] text-zinc-500 flex items-center gap-1 flex-wrap">{sub}</div>
    </div>
  );
}
