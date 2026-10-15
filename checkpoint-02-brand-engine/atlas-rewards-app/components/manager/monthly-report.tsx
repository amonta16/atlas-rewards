"use client";
/**
 * MonthlyReport — CP-209 · the Reports tab (every niche, managers only)
 *
 * "This month so far" is computed live (business_monthly_report RPC);
 * finished months come from the archive the cron writes on the 1st
 * (business_monthly_reports), which is also what was emailed. Same
 * numbers, same takeaways as the email (lib/reports/monthly.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { FileBarChart, Mail, ArrowUpRight, ArrowDownRight, Minus, Trophy, Sparkles, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";
import { delta, fmtNum, fmtVal, kpisFor, monthName, takeaways, type MonthlyReport as Report } from "@/lib/reports/monthly";

type ArchiveRow = { month: string; data: Report; emailed_at: string | null; emailed_to: string[] | null };

const LIVE = "live";

export function MonthlyReport({ business, initialMonth, demo }: {
  business: Business;
  /** "2026-09" from ?month= (the email's button). */
  initialMonth?: string | null;
  /** Preloaded data for previews — skips both queries. */
  demo?: { live: Report; archive: ArchiveRow[] };
}) {
  const primary = business.brand_colors.primary;
  const [live, setLive] = useState<Report | null>(demo?.live ?? null);
  const [archive, setArchive] = useState<ArchiveRow[] | null>(demo?.archive ?? null);
  const [sel, setSel] = useState<string>(initialMonth || LIVE);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let off = false;
    const sb = createClient();
    sb.rpc("business_monthly_report", { p_business_id: business.id }).then(({ data, error }) => {
      if (off) return;
      if (error) setErr(error.message); else setLive(data as Report);
    });
    sb.from("business_monthly_reports").select("month, data, emailed_at, emailed_to")
      .eq("business_id", business.id).order("month", { ascending: false }).limit(24)
      .then(({ data }) => { if (!off) setArchive(((data ?? []) as any[]).map((r) => ({ ...r, month: String(r.month).slice(0, 7) }))); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  // If ?month= points at an archived month we don't have, fall back to live.
  useEffect(() => {
    if (sel !== LIVE && archive && !archive.some((a) => a.month === sel)) setSel(LIVE);
  }, [archive, sel]);

  const row = sel === LIVE ? null : archive?.find((a) => a.month === sel) ?? null;
  const report = sel === LIVE ? live : row?.data ?? null;

  const options = useMemo(() => {
    const o: { id: string; label: string }[] = [];
    if (live) o.push({ id: LIVE, label: `${monthName(live.month, { month: "long" })} so far` });
    for (const a of archive ?? []) if (a.month !== live?.month) o.push({ id: a.month, label: monthName(a.month) });
    return o;
  }, [live, archive]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2"><FileBarChart className="h-5 w-5" style={{ color: primary }} /> Monthly report</h2>
          <p className="text-sm text-zinc-500 mt-1">Emailed to every manager on the 1st. Pick a month to look back.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Report month">
          {options.map((o) => (
            <button key={o.id} type="button" role="tab" aria-selected={sel === o.id} onClick={() => setSel(o.id)}
              className={cn("rounded-full px-3.5 py-1.5 text-xs font-bold transition",
                sel === o.id ? "text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50")}
              style={sel === o.id ? { background: primary } : undefined}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Couldn&apos;t load the report: {err}</div>}
      {!report && !err && <div className="flex items-center gap-2 py-16 justify-center text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Building your report…</div>}

      {report && <ReportView report={report} primary={primary} emailed={row ? { at: row.emailed_at, to: row.emailed_to } : null} />}

      {archive && archive.length === 0 && live && (
        <p className="text-xs text-zinc-400">Your first emailed report arrives on the 1st. Until then, this month&apos;s numbers update live.</p>
      )}
    </div>
  );
}

export function ReportView({ report: r, primary, emailed }: { report: Report; primary: string; emailed: { at: string | null; to: string[] | null } | null }) {
  const k = kpisFor(r.business.layout);
  const tk = takeaways(r);
  const medspa = r.business.layout === "medspa";
  const through = new Date(r.through);
  const toneStyle = { good: "#047857", watch: "#b45309", do: primary } as const;
  const toneLabel = { good: "Win", watch: "Watch", do: "Do next" } as const;

  return (
    <div className="space-y-4">
      {/* Header band — mirrors the email */}
      <div className="rounded-2xl p-5 text-white shadow-sm" style={{ background: primary }}>
        <div className="text-[11px] font-black uppercase tracking-widest opacity-85">{r.partial ? "Month to date" : "Monthly report"}</div>
        <div className="mt-1 text-2xl font-black">{monthName(r.month)}</div>
        <div className="mt-0.5 text-sm opacity-90">
          {r.partial
            ? `Through ${through.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, compared with the same days last month`
            : "Compared with the month before"}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {k.map((x) => {
          const d = delta(r.current[x.key], r.previous[x.key]);
          return (
            <div key={x.key} className="rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-sm" title={x.hint}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{x.label}</div>
              <div className="mt-1.5 text-[28px] font-black leading-none tabular-nums text-zinc-900">{fmtVal(x, r.current[x.key])}</div>
              <div className={cn("mt-1.5 flex items-center gap-1 text-[12px] font-semibold",
                !d ? "text-zinc-400" : d.dir === "up" ? "text-emerald-700" : d.dir === "down" ? "text-rose-700" : "text-zinc-500")}>
                {d ? (d.dir === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : d.dir === "down" ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />) : null}
                {d ? `${d.text} vs last month` : "No activity yet"}
                <span className="font-normal text-zinc-400">· was {fmtVal(x, r.previous[x.key])}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
          <div className="text-sm font-extrabold text-zinc-900">What it means</div>
          {tk.length === 0 && <p className="mt-2 text-sm text-zinc-500">Not enough activity yet to call a trend.</p>}
          <div className="mt-3 space-y-2">
            {tk.map((t, i) => (
              <div key={i} className="rounded-r-xl bg-zinc-50 px-4 py-3" style={{ borderLeft: `3px solid ${toneStyle[t.tone]}` }}>
                <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: toneStyle[t.tone] }}>{toneLabel[t.tone]}</div>
                <div className="text-[14px] font-bold text-zinc-900 mt-0.5">{t.title}</div>
                <div className="text-[13px] text-zinc-600 mt-0.5 leading-snug">{t.body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {medspa && r.top_treatments.length > 0 && (
            <ListCard icon={<Sparkles className="h-4 w-4" />} primary={primary} title="Most-booked treatments"
              items={r.top_treatments.map((t) => [t.name, `${t.n}×`])} />
          )}
          <ListCard icon={<Trophy className="h-4 w-4" />} primary={primary} title={`Top ${medspa ? "patients" : "members"}`}
            items={r.top_members.map((m) => [m.name, `${fmtNum(m.points)} pts`])} empty="No points earned yet this month." />
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-sm text-[12.5px] text-zinc-600 space-y-1">
            <Row label={medspa ? "Patients in your app" : "Members in your app"} value={fmtNum(r.current.total_members)} />
            <Row label="Paying members" value={fmtNum(r.current.paid_members)} />
            <Row label="Points earned" value={fmtNum(r.current.points_earned)} />
            <Row label="Referrals" value={fmtNum(r.current.referrals)} />
          </div>
        </div>
      </div>

      {emailed && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Mail className="h-3.5 w-3.5" />
          {emailed.at
            ? <>Emailed {new Date(emailed.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} to {(emailed.to ?? []).join(", ") || "your managers"}</>
            : "Saved, not emailed (no manager email on file)."}
        </div>
      )}
    </div>
  );
}

function ListCard({ icon, primary, title, items, empty }: { icon: React.ReactNode; primary: string; title: string; items: string[][]; empty?: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-2 text-sm font-extrabold text-zinc-900"><span style={{ color: primary }}>{icon}</span>{title}</div>
      {items.length === 0
        ? <div className="px-4 pb-4 text-xs text-zinc-400">{empty}</div>
        : items.map(([a, b], i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-2.5 text-[13px]">
            <span className="truncate text-zinc-800">{a}</span><span className="shrink-0 tabular-nums text-zinc-500">{b}</span>
          </div>
        ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span>{label}</span><span className="font-bold tabular-nums text-zinc-900">{value}</span></div>;
}
