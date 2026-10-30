"use client";
/**
 * sales-activity.tsx — CP-111
 *
 * Lightweight weekly door-to-door scorecard. One editable row per day
 * (unique in the DB, so two admins upsert the same day instead of
 * duplicating it). Weekly totals always; conversion rates only once
 * there's enough real data to mean anything.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Footprints, Loader2, Pencil, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { SalesActivityDay } from "@/lib/types/database";
import { weekStart, isoAddDays, dateLabel, isValidIsoDate } from "@/lib/founder-hq";
import { GlassPanel, Chip, HqButton, HqModal, Field, fieldCls, areaCls } from "./hq-ui";
import { insertRow, guardedUpdate, reloadRows } from "./hq-data";

const METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: "businesses_visited",  label: "Businesses visited",    short: "Visited" },
  { key: "decision_makers",     label: "Decision-makers reached", short: "DMs" },
  { key: "demos_presented",     label: "Demos presented",       short: "Demos" },
  { key: "followups_scheduled", label: "Follow-ups scheduled",  short: "Follow-ups" },
  { key: "proposals_created",   label: "Trials / proposals",    short: "Proposals" },
  { key: "deals_won",           label: "Deals won",             short: "Won" },
];
type MetricKey = "businesses_visited" | "decision_makers" | "demos_presented"
  | "followups_scheduled" | "proposals_created" | "deals_won";

const ORDER = [{ column: "activity_date", ascending: false }];

export function SalesActivity({
  initial, todayIso, onRows,
}: {
  initial: SalesActivityDay[];
  todayIso: string;
  onRows?: (rows: SalesActivityDay[]) => void;
}) {
  const { toast } = useToast();
  const [rows, setRowsRaw] = useState<SalesActivityDay[]>(initial);
  const [week, setWeek] = useState(weekStart(todayIso));
  const [editingDate, setEditingDate] = useState<string | null>(null);

  function setRows(next: SalesActivityDay[]) {
    setRowsRaw(next);
    onRows?.(next);
  }

  async function reload() {
    const fresh = await reloadRows<SalesActivityDay>("agency_sales_activity", ORDER);
    if (fresh) setRows(fresh);
  }

  const byDate = useMemo(() => new Map(rows.map(r => [r.activity_date, r])), [rows]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoAddDays(week, i)), [week]);
  const thisWeek = week === weekStart(todayIso);

  const totals = useMemo(() => {
    const t: Record<MetricKey, number> = {
      businesses_visited: 0, decision_makers: 0, demos_presented: 0,
      followups_scheduled: 0, proposals_created: 0, deals_won: 0,
    };
    for (const d of days) {
      const r = byDate.get(d);
      if (!r) continue;
      for (const m of METRICS) t[m.key] += r[m.key] ?? 0;
    }
    return t;
  }, [days, byDate]);

  const enoughData = totals.businesses_visited >= 10;
  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);
  const rates = [
    { label: "Visit → DM", value: pct(totals.decision_makers, totals.businesses_visited) },
    { label: "DM → Demo", value: pct(totals.demos_presented, totals.decision_makers) },
    { label: "Demo → Follow-up", value: pct(totals.followups_scheduled, totals.demos_presented) },
    { label: "Visit → Won", value: pct(totals.deals_won, totals.businesses_visited) },
  ];

  const weekLabel = `${dateLabel(days[0], { weekday: undefined })} – ${dateLabel(days[6], { weekday: undefined })}`;

  return (
    <GlassPanel
      id="hq-activity"
      title="Door-to-Door Activity"
      subtitle="The weekly scorecard — is the fieldwork getting sharper?"
      icon={<Footprints className="h-4 w-4" />}
      right={
        <HqButton onClick={() => setEditingDate(todayIso)}>
          <Plus className="h-4 w-4" /> Log today
        </HqButton>
      }
    >
      {/* Week nav */}
      <div className="flex items-center gap-1 mb-3">
        <button onClick={() => setWeek(isoAddDays(week, -7))} aria-label="Previous week"
          className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-44 text-center text-sm font-bold text-white tabular-nums">{weekLabel}</div>
        <button onClick={() => setWeek(isoAddDays(week, 7))} aria-label="Next week"
          className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70">
          <ChevronRight className="h-4 w-4" />
        </button>
        {!thisWeek && (
          <HqButton kind="ghost" className="h-8 px-2.5 text-[12px]" onClick={() => setWeek(weekStart(todayIso))}>
            This week
          </HqButton>
        )}
      </div>

      {/* Scorecard table */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-bold uppercase tracking-widest text-sky-200/40 pb-2 pr-2">Metric</th>
              {days.map(d => {
                const isToday = d === todayIso;
                const isFuture = d > todayIso;
                return (
                  <th key={d} className="pb-2 px-0.5">
                    <button
                      onClick={() => !isFuture && setEditingDate(d)}
                      disabled={isFuture}
                      aria-label={`Edit activity for ${dateLabel(d)}`}
                      className={"w-full rounded-md py-1 text-[11px] font-bold transition-colors " +
                        (isToday ? "bg-sky-400/20 text-sky-100 ring-1 ring-sky-400/40"
                          : isFuture ? "text-sky-200/25"
                          : "text-sky-200/60 hover:bg-white/8 hover:text-white")}
                    >
                      {dateLabel(d, { month: undefined, day: "numeric" }).split(",")[0]} {Number(d.slice(8, 10))}
                      {!isFuture && <Pencil className="inline h-2.5 w-2.5 ml-1 opacity-50" aria-hidden />}
                    </button>
                  </th>
                );
              })}
              <th className="pb-2 pl-2 text-right text-[10px] font-bold uppercase tracking-widest text-sky-300/70">Week</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m, mi) => (
              <tr key={m.key}>
                <td className={"py-1.5 pr-2 text-[12px] font-semibold text-sky-100/80 whitespace-nowrap " + (mi === 0 ? "" : "border-t border-white/5")}>
                  {m.label}
                </td>
                {days.map(d => {
                  const v = byDate.get(d)?.[m.key] ?? 0;
                  return (
                    <td key={d} className={"py-1.5 px-0.5 text-center tabular-nums " + (mi === 0 ? "" : "border-t border-white/5")}>
                      <span className={v > 0 ? "text-white font-semibold" : "text-sky-200/25"}>{v}</span>
                    </td>
                  );
                })}
                <td className={"py-1.5 pl-2 text-right tabular-nums font-extrabold " + (mi === 0 ? "" : "border-t border-white/5") + " " +
                  (m.key === "deals_won" && totals[m.key] > 0 ? "text-emerald-300" : "text-sky-300")}>
                  {totals[m.key]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Conversion rates — only with enough real data */}
      <div className="mt-3">
        {enoughData ? (
          <div className="flex flex-wrap gap-2">
            {rates.map(r => (
              <Chip key={r.label} tone="sky">
                {r.label}: {r.value != null ? `${r.value}%` : "—"}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-sky-200/40">
            Conversion rates unlock at 10+ visits in a week — log the fieldwork and they'll appear here.
          </p>
        )}
      </div>

      {editingDate && (
        <ActivityEditor
          date={editingDate}
          existing={byDate.get(editingDate) ?? null}
          onClose={() => setEditingDate(null)}
          onSaved={row => {
            setEditingDate(null);
            const others = rows.filter(r => r.activity_date !== row.activity_date);
            setRows([row, ...others].sort((a, b) => b.activity_date.localeCompare(a.activity_date)));
          }}
          onConflict={() => { setEditingDate(null); reload(); }}
        />
      )}
    </GlassPanel>
  );
}

/* ─────────────────────── Day editor modal ───────────────────────── */

function ActivityEditor({ date, existing, onClose, onSaved, onConflict }: {
  date: string;
  existing: SalesActivityDay | null;
  onClose: () => void;
  onSaved: (row: SalesActivityDay) => void;
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [vals, setVals] = useState<Record<MetricKey, string>>({
    businesses_visited: String(existing?.businesses_visited ?? 0),
    decision_makers: String(existing?.decision_makers ?? 0),
    demos_presented: String(existing?.demos_presented ?? 0),
    followups_scheduled: String(existing?.followups_scheduled ?? 0),
    proposals_created: String(existing?.proposals_created ?? 0),
    deals_won: String(existing?.deals_won ?? 0),
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  function parseAll(): Record<MetricKey, number> | null {
    const out = {} as Record<MetricKey, number>;
    for (const m of METRICS) {
      const n = parseInt(vals[m.key] || "0", 10);
      if (!Number.isFinite(n) || n < 0 || n > 10000) return null;
      out[m.key] = n;
    }
    return out;
  }

  async function save() {
    if (busy) return;
    if (!isValidIsoDate(date)) { toast.error("Bad date"); return; }
    const nums = parseAll();
    if (!nums) { toast.error("Counts must be whole numbers (0 or more)"); return; }
    setBusy(true);
    const values = { activity_date: date, ...nums, notes: notes.trim() || null };
    const res = existing
      ? await guardedUpdate<SalesActivityDay>("agency_sales_activity", existing.id, existing.updated_at, values)
      : await insertRow<SalesActivityDay>("agency_sales_activity", values);
    setBusy(false);
    if (res.error !== undefined) {
      if (/duplicate|unique/i.test(res.error)) {
        toast.info("Someone already logged this day — refreshed. Open it again to edit.");
        onConflict();
        return;
      }
      toast.error("Couldn't save — " + res.error);
      return;
    }
    if (res.conflict) { toast.info("Someone else updated this day — refreshed with their numbers."); onConflict(); return; }
    toast.success("Activity saved");
    onSaved(res.row);
  }

  return (
    <HqModal title={`Field activity — ${dateLabel(date)}`} subtitle="Honest counts only — this is how we learn." onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          {METRICS.map(m => (
            <Field key={m.key} label={m.label}>
              <input
                className={fieldCls + " text-center tabular-nums"}
                inputMode="numeric"
                value={vals[m.key]}
                onChange={e => setVals(v => ({ ...v, [m.key]: e.target.value.replace(/[^0-9]/g, "") }))}
                aria-label={m.label}
              />
            </Field>
          ))}
        </div>
        <Field label="Notes (optional)">
          <textarea className={areaCls} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Route, objections heard, what worked…" />
        </Field>
        <div className="flex justify-end gap-2">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save day"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}
