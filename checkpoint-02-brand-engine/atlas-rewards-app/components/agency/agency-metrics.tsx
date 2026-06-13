"use client";
/**
 * AgencyMetrics — CP-50
 *
 * The "command center" block on the agency dashboard. Pulls agency-side
 * revenue only (what sub-accounts pay US — never the businesses' own
 * customer revenue) and renders dark, glowing KPI tiles + four charts:
 *   • MRR growth trend (area)
 *   • Revenue booked / month (bars: MRR + setup)
 *   • MRR by business (ranked bars)
 *   • Pipeline funnel
 */
import { useEffect, useState } from "react";
import { TrendingUp, Users2, Hourglass, Banknote, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AreaTrend, BarsOverTime, RankBars, Funnel } from "./charts";
import { ManualBillingButton } from "./manual-billing-form";

type Summary = {
  mrr_cents: number; active_subscriptions: number;
  pipeline_cents: number; pipeline_count: number;
  setup_fees_outstanding_cents: number; setup_fees_collected_30d: number;
  payments_30d_cents: number; payments_30d_count: number;
};
type TS = { month_start: string; mrr_cents: number; setup_cents: number; collected_cents: number };
type MrrBiz = { business_id: string; business_name: string; monthly_cents: number; status: string };
type PipeRow = { stage: string; lead_count: number; value_cents: number };

const STAGE_ORDER: { key: string; label: string }[] = [
  { key: "lead", label: "Leads" },
  { key: "contacted", label: "Contacted" },
  { key: "in_talks", label: "In talks" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
];

const dollars = (c?: number | null) =>
  `$${((c ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short" });

export function AgencyMetrics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ts, setTs] = useState<TS[]>([]);
  const [mrrBiz, setMrrBiz] = useState<MrrBiz[]>([]);
  const [pipe, setPipe] = useState<PipeRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const [{ data: sum }, { data: series }, { data: biz }, { data: ps }] = await Promise.all([
        supabase.rpc("agency_billing_summary"),
        supabase.rpc("agency_revenue_timeseries", { p_months: 6 }),
        supabase.rpc("agency_mrr_by_business"),
        supabase.rpc("agency_pipeline_summary"),
      ]);
      if (cancelled) return;
      setSummary((Array.isArray(sum) ? sum[0] : sum) as Summary | null);
      setTs((series ?? []) as TS[]);
      setMrrBiz((biz ?? []) as MrrBiz[]);
      setPipe((ps ?? []) as PipeRow[]);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const trendData = ts.map(t => ({ label: monthLabel(t.month_start), value: t.mrr_cents }));
  const revData = ts.map(t => ({ label: monthLabel(t.month_start), value: t.mrr_cents + t.setup_cents }));
  const rankData = mrrBiz.map(b => ({
    label: b.business_name,
    value: b.monthly_cents,
    sub: "/mo",
    active: b.status === "active",
  }));
  const pipeMap = new Map(pipe.map(p => [p.stage, p]));
  const funnelStages = STAGE_ORDER.map(s => ({
    label: s.label,
    count: pipeMap.get(s.key)?.lead_count ?? 0,
    value: pipeMap.get(s.key)?.value_cents ?? 0,
  }));

  return (
    <div className="px-8 pt-6">
      {/* KPI tiles */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Agency performance</h2>
          <p className="text-[12px] text-sky-200/50">What your sub-accounts pay you — not their customer revenue.</p>
        </div>
        <ManualBillingButton onSaved={() => setReloadKey(k => k + 1)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="MRR"
          value={dollars(summary?.mrr_cents)} sub={`${summary?.active_subscriptions ?? 0} active plans`} />
        <Kpi icon={<Hourglass className="h-4 w-4" />} label="Pipeline value"
          value={dollars(summary?.pipeline_cents)} sub={`${summary?.pipeline_count ?? 0} in motion`} />
        <Kpi icon={<Banknote className="h-4 w-4" />} label="Collected (30d)"
          value={dollars(summary?.payments_30d_cents)} sub={`${summary?.payments_30d_count ?? 0} payments`} />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Setup outstanding"
          value={dollars(summary?.setup_fees_outstanding_cents)} sub={`${dollars(summary?.setup_fees_collected_30d)} collected 30d`} />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <AreaTrend title="MRR growth" subtitle="Recurring revenue, last 6 months"
          data={trendData} formatValue={dollars} />
        <BarsOverTime title="Revenue booked / month" subtitle="MRR + setup fees"
          data={revData} formatValue={dollars} />
        <RankBars title="MRR by business" subtitle="What each sub-account pays you"
          data={rankData} formatValue={dollars} emptyHint="Log a plan with “Log MRR / setup fee”." />
        <Funnel title="Prospect pipeline" subtitle="Open leads by stage"
          stages={funnelStages} formatValue={dollars} />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <div
      className="relative rounded-2xl p-4 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.02))",
        border: "1px solid rgba(56,189,248,0.16)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="pointer-events-none absolute -top-10 -right-8 h-24 w-24 rounded-full blur-2xl opacity-30"
        style={{ background: "#38bdf8" }} />
      <div className="relative flex items-center gap-2 text-sky-300/80">
        <span className="h-7 w-7 rounded-lg bg-sky-400/15 flex items-center justify-center text-sky-200">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200/70">{label}</span>
      </div>
      <div className="relative mt-2 text-2xl font-extrabold text-white tabular-nums">{value}</div>
      {sub && <div className="relative text-[11px] text-sky-200/50 mt-0.5">{sub}</div>}
    </div>
  );
}
