"use client";
/**
 * analytics-client.tsx — Revenue Analytics (CP-111 rewrite).
 *
 * The /agency/analytics page, rebuilt around two figures that matter:
 *   • Actual Live MRR — what active paying businesses pay us monthly
 *   • Potential Pipeline MRR — the monthly value of open opportunities
 *     (raw + probability-weighted)
 *
 * Everything on this page is computed from real records:
 *   Live MRR       = Σ active agency_billing_subscriptions.monthly_cents
 *   Raw pipeline   = Σ open opportunities' est_monthly_cents (excluding
 *                    ones whose linked business already pays — no double
 *                    counting)
 *   Weighted       = Σ est_monthly_cents × win probability (stage default
 *                    when not set per-deal)
 *
 * Chart history: live MRR is reconstructed from real subscription
 * start/cancel records; pipeline history comes from daily snapshots that
 * started recording when CP-111 shipped. No fabricated trend lines.
 *
 * (CP-60's KPI-pill version of this file was superseded by this rewrite;
 * the portfolio charts it used live on in ./charts.tsx.)
 */
import { useMemo, useState } from "react";
import {
  TrendingUp, Hourglass, Scale, Users2, FolderKanban, Coins, Plus, Search,
  Pencil, Archive, ArchiveRestore, Trash2, Loader2, PhoneOutgoing,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { PipelineOpportunity, MrrSnapshot, AgencyAdminLite, SalesActivityDay } from "@/lib/types/database";
import {
  SALES_STAGES, OPEN_STAGES, LEAD_SOURCES, normalizeStage, stageMeta, sourceLabel,
  effectiveProbability, isDoubleCounted, pipelineTotals, dollars, dateLabel,
} from "@/lib/founder-hq";
import { HQ, Chip, HqButton, EmptyState, fieldCls, selectCls, GlassPanel } from "@/components/agency/hq/hq-ui";
import { guardedUpdate, deleteRow, reloadRows } from "@/components/agency/hq/hq-data";
import { RevenueChart, type ChartSeries } from "@/components/agency/revenue/revenue-chart";
import { OpportunityEditor } from "@/components/agency/revenue/opportunity-editor";
import { RankBars, Funnel } from "@/components/agency/charts";
import { ManualBillingButton } from "@/components/agency/manual-billing-form";
import { NewBusinessModal } from "@/components/agency/new-business-modal";

type BillingSummary = {
  mrr_cents: number; active_subscriptions: number;
  payments_30d_cents: number; payments_30d_count: number;
};
type MrrBiz = { business_id: string; business_name: string; monthly_cents: number; status: string };
type LiveDay = { day: string; mrr_cents: number };

const OPP_ORDER = [{ column: "updated_at", ascending: false }];
const RANGES = [
  { key: 30, label: "30d" },
  { key: 90, label: "90d" },
  { key: 180, label: "6m" },
  { key: 365, label: "1y" },
];

export function AnalyticsClient({
  friendlyName, todayIso,
  initialOpps, initialSnapshots, initialLiveDaily,
  billing, mrrByBusiness, admins, businesses, activity28, liveBusinessIds,
}: {
  friendlyName: string;
  todayIso: string;
  initialOpps: PipelineOpportunity[];
  initialSnapshots: MrrSnapshot[];
  initialLiveDaily: LiveDay[];
  billing: BillingSummary | null;
  mrrByBusiness: MrrBiz[];
  admins: AgencyAdminLite[];
  businesses: { id: string; name: string }[];
  activity28: SalesActivityDay[];
  liveBusinessIds: string[];
}) {
  const { toast } = useToast();
  const [opps, setOpps] = useState<PipelineOpportunity[]>(initialOpps);
  const [snapshots, setSnapshots] = useState<MrrSnapshot[]>(initialSnapshots);
  const [rangeDays, setRangeDays] = useState(90);
  const [editor, setEditor] = useState<{ opp: PipelineOpportunity | null } | null>(null);
  const [deleting, setDeleting] = useState<PipelineOpportunity | null>(null);
  const [createBizName, setCreateBizName] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState("");
  const [fSource, setFSource] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [fStatus, setFStatus] = useState("open");

  const liveIds = useMemo(() => new Set(liveBusinessIds), [liveBusinessIds]);
  const liveMrrCents = Number(billing?.mrr_cents ?? 0);
  const activeClients = Number(billing?.active_subscriptions ?? 0);
  const totals = useMemo(() => pipelineTotals(opps, liveIds, todayIso), [opps, liveIds, todayIso]);

  /* ── data plumbing ─────────────────────────────────────────────── */

  async function reloadOpps() {
    const rows = await reloadRows<PipelineOpportunity>("agency_pipeline", OPP_ORDER);
    if (rows) setOpps(rows);
  }

  /** Recompute today's snapshot server-side and fold it into the chart. */
  async function syncSnapshot() {
    const supabase = createClient();
    const { data } = await supabase.rpc("record_agency_revenue_snapshot");
    const row = (Array.isArray(data) ? data[0] : data) as MrrSnapshot | null;
    if (row) {
      setSnapshots(prev => [
        ...prev.filter(s => s.snapshot_date !== row.snapshot_date), row,
      ].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)));
    }
  }

  function applySaved(row: PipelineOpportunity) {
    setOpps(prev => {
      const exists = prev.some(o => o.id === row.id);
      return exists ? prev.map(o => (o.id === row.id ? row : o)) : [row, ...prev];
    });
    syncSnapshot();
  }

  async function quickStage(opp: PipelineOpportunity, stageKey: string) {
    setBusyId(opp.id);
    const closing = stageKey === "won" || stageKey === "lost";
    const res = await guardedUpdate<PipelineOpportunity>("agency_pipeline", opp.id, opp.updated_at, {
      stage: stageKey,
      status: closing ? stageKey : "open",
      closed_at: closing ? (opp.closed_at ?? new Date().toISOString()) : null,
    });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't move stage — " + res.error); return; }
    if (res.conflict) { toast.info("This opportunity changed under you — refreshed."); reloadOpps(); return; }
    applySaved(res.row);
    if (stageKey === "won") toast.success("Marked Won 🎉 — open it to log the live subscription.");
  }

  async function setStatusOnly(opp: PipelineOpportunity, status: PipelineOpportunity["status"]) {
    setBusyId(opp.id);
    const res = await guardedUpdate<PipelineOpportunity>("agency_pipeline", opp.id, opp.updated_at, { status });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't update — " + res.error); return; }
    if (res.conflict) { toast.info("This opportunity changed under you — refreshed."); reloadOpps(); return; }
    applySaved(res.row);
    toast.success(status === "archived" ? "Archived (kept for history)" : "Restored to open");
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("agency_pipeline", deleting.id);
    if (res.error !== undefined) { toast.error("Delete failed — " + res.error); return; }
    setOpps(prev => prev.filter(o => o.id !== deleting.id));
    setDeleting(null);
    syncSnapshot();
    toast.success("Opportunity deleted");
  }

  /* ── chart series ──────────────────────────────────────────────── */

  const chartSeries: ChartSeries[] = useMemo(() => {
    const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString().slice(0, 10);
    const live = initialLiveDaily.filter(d => d.day >= since)
      .map(d => ({ date: d.day, value: d.mrr_cents }));
    const snaps = snapshots.filter(s => s.snapshot_date >= since);
    return [
      { key: "live", label: "Actual Live MRR", color: "#34d399", points: live },
      {
        key: "raw", label: "Raw Pipeline MRR", color: "#38bdf8", dashed: true,
        points: snaps.map(s => ({ date: s.snapshot_date, value: s.pipeline_raw_cents })),
      },
      {
        key: "weighted", label: "Weighted Pipeline MRR", color: "#a78bfa",
        points: snaps.map(s => ({ date: s.snapshot_date, value: s.pipeline_weighted_cents })),
      },
    ];
  }, [initialLiveDaily, snapshots, rangeDays]);

  const firstSnapshotDate = snapshots[0]?.snapshot_date ?? null;

  /* ── table rows ────────────────────────────────────────────────── */

  const ownerName = (id: string | null) => {
    if (!id) return "—";
    const a = admins.find(x => x.user_id === id);
    return a ? (a.full_name || a.email || "—") : "—";
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return opps
      .filter(o => (fStatus === "all" ? true : o.status === fStatus))
      .filter(o => !fStage || normalizeStage(o.stage) === fStage)
      .filter(o => !fSource || o.lead_source === fSource)
      .filter(o => !fOwner || o.owner_user_id === fOwner)
      .filter(o => !needle
        || o.name.toLowerCase().includes(needle)
        || (o.contact_name ?? "").toLowerCase().includes(needle)
        || (o.contact_info ?? "").toLowerCase().includes(needle))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [opps, q, fStage, fSource, fOwner, fStatus]);

  /* ── insights data ─────────────────────────────────────────────── */

  const openOpps = useMemo(
    () => opps.filter(o => o.status === "open" && !isDoubleCounted(o, liveIds)),
    [opps, liveIds]);

  const funnelStages = useMemo(() => OPEN_STAGES.map(s => {
    const rows = openOpps.filter(o => normalizeStage(o.stage) === s.key);
    return { label: s.label, count: rows.length, value: rows.reduce((sum, o) => sum + o.est_monthly_cents, 0) };
  }), [openOpps]);

  const bySource = useMemo(() => LEAD_SOURCES.map(s => ({
    label: s.label,
    value: openOpps.filter(o => o.lead_source === s.key).reduce((sum, o) => sum + o.est_monthly_cents, 0),
    active: true,
  })).filter(r => r.value > 0), [openOpps]);

  const rankBiz = useMemo(() => mrrByBusiness.map(b => ({
    label: b.business_name, value: b.monthly_cents, sub: "/mo", active: b.status === "active",
  })), [mrrByBusiness]);

  const wonAll = opps.filter(o => o.status === "won");
  const lostAll = opps.filter(o => o.status === "lost");
  const winRate = wonAll.length + lostAll.length > 0
    ? Math.round((wonAll.length / (wonAll.length + lostAll.length)) * 100) : null;
  const cycleDays = useMemo(() => {
    const spans = wonAll
      .filter(o => o.closed_at)
      .map(o => (new Date(o.closed_at as string).getTime() - new Date(o.created_at).getTime()) / 86_400_000)
      .filter(d => d >= 0);
    return spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : null;
  }, [wonAll]);

  const wonNotLive = wonAll.filter(o => !o.converted_business_id || !liveIds.has(o.converted_business_id));

  const activityFunnel = useMemo(() => {
    const t = { visited: 0, dms: 0, demos: 0, followups: 0, proposals: 0, won: 0 };
    for (const a of activity28) {
      t.visited += a.businesses_visited; t.dms += a.decision_makers; t.demos += a.demos_presented;
      t.followups += a.followups_scheduled; t.proposals += a.proposals_created; t.won += a.deals_won;
    }
    return t;
  }, [activity28]);

  const filtersActive = !!(q || fStage || fSource || fOwner || fStatus !== "open");

  /* ── render ────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen" style={{ background: HQ.canvas }}>
      {/* Header */}
      <header className="relative px-4 sm:px-8 pt-10 pb-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-10 h-64 w-64 rounded-full blur-3xl opacity-25" style={{ background: "#22d3ee" }} />
        <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full blur-3xl opacity-20" style={{ background: "#1d6fa5" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · Revenue Analytics</div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mt-1 drop-shadow">
              The revenue picture, {friendlyName}
            </h1>
            <p className="text-sm text-sky-200/60 mt-1">
              What's live, what's in the pipeline, and how the gap is closing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ManualBillingButton onSaved={() => { syncSnapshot(); toast.success("Live MRR will refresh on next load"); }} />
            <HqButton onClick={() => setEditor({ opp: null })}>
              <Plus className="h-4 w-4" /> New opportunity
            </HqButton>
          </div>
        </div>

        {/* Summary cards */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <SummaryCard icon={<TrendingUp className="h-4 w-4" />} label="Actual Live MRR"
            value={dollars(liveMrrCents)} sub={`${activeClients} active client${activeClients === 1 ? "" : "s"}`} accent="#34d399" />
          <SummaryCard icon={<Hourglass className="h-4 w-4" />} label="Raw Pipeline MRR"
            value={dollars(totals.rawCents)} sub={`${totals.openCount} open deal${totals.openCount === 1 ? "" : "s"}`} accent="#38bdf8" />
          <SummaryCard icon={<Scale className="h-4 w-4" />} label="Weighted Pipeline"
            value={dollars(totals.weightedCents)} sub="Probability-adjusted" accent="#a78bfa" />
          <SummaryCard icon={<Users2 className="h-4 w-4" />} label="Active clients"
            value={String(activeClients)} sub="Paying subscriptions" />
          <SummaryCard icon={<FolderKanban className="h-4 w-4" />} label="Open opportunities"
            value={String(totals.openCount)} sub={totals.followupsDue > 0 ? `${totals.followupsDue} follow-ups due` : "No follow-ups due"}
            warn={totals.followupsDue > 0} />
          <SummaryCard icon={<Coins className="h-4 w-4" />} label="Avg potential deal"
            value={dollars(totals.avgDealCents)} sub="/mo per open deal" />
        </div>
      </header>

      <div className="px-4 sm:px-8 pb-12 space-y-5">
        {/* Revenue graph */}
        <GlassPanel
          title="Live MRR vs Pipeline"
          subtitle={firstSnapshotDate
            ? `Pipeline history recorded since ${dateLabel(firstSnapshotDate)}. Live MRR reconstructed from real subscription records.`
            : "Live MRR reconstructed from real subscription records. Pipeline history starts recording today."}
          icon={<TrendingUp className="h-4 w-4" />}
          right={
            <div className="flex items-center gap-1" role="group" aria-label="Date range">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRangeDays(r.key)}
                  className={"h-8 px-2.5 rounded-lg text-[12px] font-bold transition-colors " +
                    (rangeDays === r.key ? "bg-sky-400 text-slate-900" : "text-sky-200/60 hover:bg-white/8 hover:text-white")}>
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          <RevenueChart series={chartSeries} formatValue={dollars} />
        </GlassPanel>

        {/* Won but not yet live — the honesty gap */}
        {wonNotLive.length > 0 && (
          <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-2"
            style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.28)" }}>
            <span className="text-[13px] text-amber-100/90">
              <b>{wonNotLive.length} won deal{wonNotLive.length === 1 ? "" : "s"}</b> not counted in Live MRR yet —
              log the subscription and link the app to make {wonNotLive.length === 1 ? "it" : "them"} real revenue.
            </span>
            <div className="flex flex-wrap gap-1.5">
              {wonNotLive.slice(0, 4).map(o => (
                <button key={o.id} onClick={() => setEditor({ opp: o })}
                  className="rounded-full border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20 text-amber-100 text-[12px] font-semibold px-2.5 py-1">
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Opportunities manager */}
        <GlassPanel
          title="Pipeline opportunities"
          subtitle="Every business you're selling to. Edits recalculate the numbers above instantly."
          icon={<FolderKanban className="h-4 w-4" />}
        >
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-200/40" aria-hidden />
              <input className={fieldCls + " !h-8 !w-52 pl-8 text-[12px]"} value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search business / contact…" aria-label="Search opportunities" />
            </div>
            <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status">
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
            <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fStage} onChange={e => setFStage(e.target.value)} aria-label="Filter by stage">
              <option value="">All stages</option>
              {SALES_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fSource} onChange={e => setFSource(e.target.value)} aria-label="Filter by source">
              <option value="">All sources</option>
              {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fOwner} onChange={e => setFOwner(e.target.value)} aria-label="Filter by owner">
              <option value="">All owners</option>
              {admins.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>)}
            </select>
            {filtersActive && (
              <HqButton kind="ghost" className="h-8 px-2 text-[12px]"
                onClick={() => { setQ(""); setFStage(""); setFSource(""); setFOwner(""); setFStatus("open"); }}>
                Reset
              </HqButton>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-4 w-4" />}
              title={filtersActive ? "Nothing matches these filters" : "No opportunities yet"}
              hint={filtersActive
                ? "Try resetting the filters."
                : "Add the businesses you're preparing apps for — the pipeline numbers build from here."}
              action={!filtersActive
                ? <HqButton kind="outline" onClick={() => setEditor({ opp: null })}><Plus className="h-4 w-4" /> Add the first one</HqButton>
                : undefined}
            />
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full min-w-[880px] text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-sky-200/40">
                    <th className="pb-2 pr-3">Business</th>
                    <th className="pb-2 pr-3">Owner</th>
                    <th className="pb-2 pr-3">Source</th>
                    <th className="pb-2 pr-3">Stage</th>
                    <th className="pb-2 pr-3 text-right">$ / mo</th>
                    <th className="pb-2 pr-3 text-right">Win %</th>
                    <th className="pb-2 pr-3">Next follow-up</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(o => {
                    const meta = stageMeta(o.stage);
                    const followupOverdue = o.status === "open" && !!o.next_followup_date && o.next_followup_date <= todayIso;
                    const doubled = isDoubleCounted(o, liveIds);
                    return (
                      <tr key={o.id} className="group align-middle">
                        <td className="py-2.5 pr-3 border-t border-white/6">
                          <button onClick={() => setEditor({ opp: o })} className="text-left group/name">
                            <span className="font-semibold text-white group-hover/name:text-sky-300 transition-colors">{o.name}</span>
                            <span className="block text-[11px] text-sky-200/45">
                              {o.contact_name ?? o.contact_info ?? "No contact"}
                              {o.next_action ? ` · ${o.next_action}` : ""}
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 border-t border-white/6 text-[12px] text-sky-100/70 whitespace-nowrap">{ownerName(o.owner_user_id)}</td>
                        <td className="py-2.5 pr-3 border-t border-white/6 text-[12px] text-sky-100/70 whitespace-nowrap">{sourceLabel(o.lead_source)}</td>
                        <td className="py-2.5 pr-3 border-t border-white/6">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: meta.tint, boxShadow: `0 0 6px ${meta.tint}` }} />
                            <select
                              value={normalizeStage(o.stage)}
                              onChange={e => quickStage(o, e.target.value)}
                              disabled={busyId === o.id}
                              aria-label={`Stage for ${o.name}`}
                              className="h-7 rounded-md bg-white/5 border border-white/10 text-[11px] text-sky-100 px-1 [&>option]:bg-slate-800"
                            >
                              {SALES_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            {busyId === o.id && <Loader2 className="h-3 w-3 animate-spin text-sky-300" />}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 border-t border-white/6 text-right font-bold text-sky-300 tabular-nums whitespace-nowrap">
                          {o.est_monthly_cents > 0 ? dollars(o.est_monthly_cents) : "—"}
                        </td>
                        <td className="py-2.5 pr-3 border-t border-white/6 text-right tabular-nums text-sky-100/70">
                          {effectiveProbability(o)}%{o.win_probability == null && <span className="text-sky-200/30">*</span>}
                        </td>
                        <td className="py-2.5 pr-3 border-t border-white/6 whitespace-nowrap">
                          {o.next_followup_date ? (
                            <span className={"text-[12px] tabular-nums " + (followupOverdue ? "text-amber-300 font-semibold" : "text-sky-100/70")}>
                              {dateLabel(o.next_followup_date)}{followupOverdue ? " · due" : ""}
                            </span>
                          ) : <span className="text-sky-200/25 text-[12px]">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 border-t border-white/6">
                          {o.status === "open" && <Chip tone="sky">Open</Chip>}
                          {o.status === "won" && (doubled
                            ? <Chip tone="emerald">Won · live</Chip>
                            : <Chip tone="amber">Won · not live yet</Chip>)}
                          {o.status === "lost" && <Chip tone="slate">Lost</Chip>}
                          {o.status === "archived" && <Chip tone="slate">Archived</Chip>}
                        </td>
                        <td className="py-2.5 border-t border-white/6">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setEditor({ opp: o })} aria-label={`Edit ${o.name}`}
                              className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60 hover:text-white">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {o.status !== "archived" ? (
                              <button onClick={() => setStatusOnly(o, "archived")} aria-label={`Archive ${o.name}`} title="Archive (keeps history)"
                                className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60 hover:text-white">
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => setStatusOnly(o, "open")} aria-label={`Restore ${o.name}`} title="Restore to open"
                                className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60 hover:text-white">
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={() => setDeleting(o)} aria-label={`Delete ${o.name}`} title="Delete permanently"
                              className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-sky-200/35 mt-2">* stage default probability — set a per-deal % in the editor.</p>
            </div>
          )}
        </GlassPanel>

        {/* Insights — only sections with real data render */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Funnel title="Stage distribution" subtitle="Open opportunities by stage"
            stages={funnelStages} formatValue={dollars} />
          {bySource.length > 0 && (
            <RankBars title="Open pipeline by source" subtitle="Where the potential MRR comes from"
              data={bySource} formatValue={dollars} emptyHint="" />
          )}
          {rankBiz.length > 0 && (
            <RankBars title="Live MRR by client" subtitle="What each business pays today"
              data={rankBiz} formatValue={dollars} emptyHint="" />
          )}
          {activityFunnel.visited > 0 && (
            <RankBars title="Door-to-door funnel (last 4 weeks)" subtitle="From the HQ activity scorecard"
              data={[
                { label: "Businesses visited", value: activityFunnel.visited, active: true },
                { label: "Decision-makers", value: activityFunnel.dms, active: true },
                { label: "Demos presented", value: activityFunnel.demos, active: true },
                { label: "Follow-ups scheduled", value: activityFunnel.followups, active: true },
                { label: "Trials / proposals", value: activityFunnel.proposals, active: true },
                { label: "Deals won", value: activityFunnel.won, active: true },
              ]}
              formatValue={n => String(n)} emptyHint="" />
          )}
        </div>

        {/* Deal outcomes strip */}
        <div className="flex flex-wrap items-center gap-2">
          {winRate != null && <Chip tone={winRate >= 20 ? "emerald" : "sky"}>Win rate {winRate}% ({wonAll.length}W / {lostAll.length}L)</Chip>}
          {cycleDays != null && <Chip tone="sky">Avg sales cycle {cycleDays}d</Chip>}
          {totals.expectedThisMonthCents > 0 && <Chip tone="violet">Expected to close this month: {dollars(totals.expectedThisMonthCents)}</Chip>}
          {totals.followupsDue > 0 && <Chip tone="amber"><PhoneOutgoing className="h-3 w-3" /> {totals.followupsDue} follow-ups due</Chip>}
          {winRate == null && cycleDays == null && (
            <span className="text-[12px] text-sky-200/40">Win-rate and cycle-length stats appear once deals close.</span>
          )}
        </div>
      </div>

      {/* Modals */}
      {editor && (
        <OpportunityEditor
          opp={editor.opp}
          admins={admins}
          businesses={businesses}
          onClose={() => setEditor(null)}
          onSaved={row => { setEditor(null); applySaved(row); }}
          onConflict={() => { setEditor(null); reloadOpps(); }}
          onRequestDelete={o => { setEditor(null); setDeleting(o); }}
          onCreateBusiness={name => { setEditor(null); setCreateBizName(name); }}
        />
      )}
      {deleting && (
        <ConfirmDeleteModal
          title="Delete this opportunity?"
          description={`“${deleting.name}” and its sales history will be permanently removed. Prefer Archive if you may want the record later.`}
          destructiveLabel="Delete opportunity"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
      {createBizName !== null && (
        <NewBusinessModal initialName={createBizName} onClose={() => setCreateBizName(null)} />
      )}
    </div>
  );
}

/* ─────────────────────────── Summary card ───────────────────────── */

function SummaryCard({ icon, label, value, sub, accent = "#38bdf8", warn }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string; warn?: boolean;
}) {
  return (
    <div className="relative rounded-xl px-3.5 py-3 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.02))",
        border: warn ? "1px solid rgba(251,191,36,0.30)" : "1px solid rgba(56,189,248,0.16)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
      <div className="pointer-events-none absolute -top-8 -right-6 h-20 w-20 rounded-full blur-2xl opacity-25" style={{ background: accent }} />
      <div className="relative flex items-center gap-1.5">
        <span style={{ color: warn ? "#fbbf24" : accent }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200/60">{label}</span>
      </div>
      <div className="relative mt-1.5 text-xl font-extrabold text-white tabular-nums leading-tight">{value}</div>
      {sub && <div className={"relative text-[11px] mt-0.5 " + (warn ? "text-amber-200/80" : "text-sky-200/50")}>{sub}</div>}
    </div>
  );
}
