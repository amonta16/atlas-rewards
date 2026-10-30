"use client";
/**
 * sales-calendar.tsx — CP-111
 *
 * Monthly field-sales calendar for planning door-to-door days. Click an
 * empty date to schedule a session; click a session to inspect/edit it.
 * Built to be updated live during a founder meeting — minimal clicks,
 * no scheduling ceremony.
 */
import { useMemo, useState } from "react";
import {
  MapPin, ChevronLeft, ChevronRight, Plus, Loader2, Trash2, Pencil, Route, Filter,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { FieldSalesEvent, AgencyAdminLite } from "@/lib/types/database";
import { dateLabel, timeLabel, isoAddDays, isValidIsoDate, isValidTime } from "@/lib/founder-hq";
import { GlassPanel, Chip, HqButton, HqModal, Field, EmptyState, fieldCls, areaCls, selectCls } from "./hq-ui";
import { insertRow, guardedUpdate, deleteRow, reloadRows } from "./hq-data";

const ORDER = [{ column: "event_date", ascending: true }, { column: "start_time", ascending: true }];

const STATUS_META: Record<FieldSalesEvent["status"], { label: string; tone: "sky" | "emerald" | "slate" }> = {
  planned:   { label: "Planned",   tone: "sky" },
  completed: { label: "Completed", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

function monthOf(iso: string): string { return iso.slice(0, 7); }

function monthTitle(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString(undefined, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return d.toISOString().slice(0, 7);
}

/** Sunday-first 6-week grid of ISO dates for the given YYYY-MM. */
function monthGrid(month: string): { iso: string; inMonth: boolean }[] {
  const first = `${month}-01`;
  const firstDow = new Date(`${first}T12:00:00Z`).getUTCDay(); // 0=Sun
  const start = isoAddDays(first, -firstDow);
  const cells: { iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const iso = isoAddDays(start, i);
    cells.push({ iso, inMonth: monthOf(iso) === month });
  }
  // Drop a fully-out-of-month trailing week to keep the grid tight.
  return cells.slice(35).every(c => !c.inMonth) ? cells.slice(0, 35) : cells;
}

export function SalesCalendar({
  initial, admins, todayIso, onRows,
}: {
  initial: FieldSalesEvent[];
  admins: AgencyAdminLite[];
  todayIso: string;
  onRows?: (rows: FieldSalesEvent[]) => void;
}) {
  const { toast } = useToast();
  const [events, setEventsRaw] = useState<FieldSalesEvent[]>(initial);
  const [month, setMonth] = useState(monthOf(todayIso));
  const [fMember, setFMember] = useState("");
  const [fCity, setFCity] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [editor, setEditor] = useState<{ mode: "create"; date: string } | { mode: "edit"; event: FieldSalesEvent } | null>(null);
  const [deleting, setDeleting] = useState<FieldSalesEvent | null>(null);

  function setEvents(rows: FieldSalesEvent[]) {
    const sorted = [...rows].sort((a, b) =>
      (a.event_date + (a.start_time ?? "")).localeCompare(b.event_date + (b.start_time ?? "")));
    setEventsRaw(sorted);
    onRows?.(sorted);
  }

  async function reload() {
    const rows = await reloadRows<FieldSalesEvent>("field_sales_events", ORDER);
    if (rows) setEvents(rows);
  }

  const memberOptions = useMemo(
    () => Array.from(new Set(events.flatMap(e => e.members))).sort(),
    [events]);
  const cityOptions = useMemo(
    () => Array.from(new Set(events.map(e => e.city.trim()).filter(Boolean))).sort(),
    [events]);

  const filtered = useMemo(() => events.filter(e =>
    (!fMember || e.members.includes(fMember)) &&
    (!fCity || e.city.trim() === fCity) &&
    (!fStatus || e.status === fStatus)
  ), [events, fMember, fCity, fStatus]);

  const byDay = useMemo(() => {
    const m = new Map<string, FieldSalesEvent[]>();
    for (const e of filtered) {
      const arr = m.get(e.event_date) ?? [];
      arr.push(e);
      m.set(e.event_date, arr);
    }
    return m;
  }, [filtered]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const upcoming = useMemo(
    () => filtered.filter(e => e.event_date >= todayIso && e.status !== "cancelled").slice(0, 6),
    [filtered, todayIso]);
  const filtersActive = !!(fMember || fCity || fStatus);

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("field_sales_events", deleting.id);
    if (res.error !== undefined) { toast.error("Delete failed — " + res.error); return; }
    setEvents(events.filter(x => x.id !== deleting.id));
    setDeleting(null);
    toast.success("Sales session removed");
  }

  return (
    <GlassPanel
      id="hq-calendar"
      title="Field Sales Calendar"
      subtitle="Plan the door-to-door days. Click a date to schedule."
      icon={<Route className="h-4 w-4" />}
      right={
        <HqButton onClick={() => setEditor({ mode: "create", date: todayIso })}>
          <Plus className="h-4 w-4" /> Schedule day
        </HqButton>
      }
    >
      {/* Month nav + filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="w-40 text-center text-sm font-bold text-white">{monthTitle(month)}</div>
          <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"
            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70">
            <ChevronRight className="h-4 w-4" />
          </button>
          <HqButton kind="ghost" className="h-8 px-2.5 text-[12px]" onClick={() => setMonth(monthOf(todayIso))}>
            Today
          </HqButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <Filter className="h-3.5 w-3.5 text-sky-200/40" aria-hidden />
          <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fMember} onChange={e => setFMember(e.target.value)} aria-label="Filter by team member">
            <option value="">All members</option>
            {memberOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fCity} onChange={e => setFCity(e.target.value)} aria-label="Filter by city">
            <option value="">All cities</option>
            {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {filtersActive && (
            <HqButton kind="ghost" className="h-8 px-2 text-[12px]"
              onClick={() => { setFMember(""); setFCity(""); setFStatus(""); }}>
              Clear
            </HqButton>
          )}
        </div>
      </div>

      {/* Month grid */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-sky-200/40 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map(cell => {
              const dayEvents = byDay.get(cell.iso) ?? [];
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={cell.iso}
                  onClick={() => setEditor({ mode: "create", date: cell.iso })}
                  aria-label={`Schedule field sales on ${dateLabel(cell.iso)}`}
                  className={
                    "relative text-left rounded-lg p-1.5 min-h-[76px] transition-colors align-top " +
                    (cell.inMonth
                      ? "bg-white/[0.03] border border-white/8 hover:border-sky-400/40 hover:bg-sky-400/5"
                      : "bg-transparent border border-white/[0.03] opacity-40 hover:opacity-70") +
                    (isToday ? " ring-1 ring-sky-400/60" : "")
                  }
                >
                  <span className={
                    "inline-flex items-center justify-center h-5 min-w-5 px-1 rounded text-[11px] font-bold tabular-nums " +
                    (isToday ? "bg-sky-400 text-slate-900" : "text-sky-200/60")
                  }>
                    {Number(cell.iso.slice(8, 10))}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                      style={{ background: "#38bdf8", boxShadow: "0 0 6px #38bdf8" }} aria-hidden />
                  )}
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map(e => (
                      <span
                        key={e.id}
                        role="button" tabIndex={0}
                        onClick={ev => { ev.stopPropagation(); setEditor({ mode: "edit", event: e }); }}
                        onKeyDown={ev => { if (ev.key === "Enter") { ev.stopPropagation(); setEditor({ mode: "edit", event: e }); } }}
                        aria-label={`Open ${e.city} session on ${dateLabel(e.event_date)}`}
                        className={
                          "block truncate rounded px-1.5 py-0.5 text-[10.5px] font-semibold border " +
                          (e.status === "completed"
                            ? "bg-emerald-400/10 border-emerald-400/25 text-emerald-200"
                            : e.status === "cancelled"
                              ? "bg-white/5 border-white/10 text-sky-200/35 line-through"
                              : "bg-sky-400/12 border-sky-400/30 text-sky-100 hover:bg-sky-400/20")
                        }
                      >
                        {e.start_time ? timeLabel(e.start_time).replace(" ", "").toLowerCase() + " · " : ""}{e.city}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="block text-[10px] text-sky-200/50 px-1">+{dayEvents.length - 2} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upcoming sessions strip (also the phone-friendly view) */}
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-widest text-sky-200/50 mb-2">
          Upcoming sessions{filtersActive ? " (filtered)" : ""}
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-4 w-4" />}
            title={filtersActive ? "Nothing matches these filters" : "No sales days planned"}
            hint={filtersActive ? "Clear the filters to see every session." : "Pick a date above and lock in the next door-to-door run."}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {upcoming.map(e => (
              <div key={e.id} className="rounded-xl px-3.5 py-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4 text-sky-300 shrink-0" />
                    <span className="font-bold text-white text-sm truncate">{e.city}</span>
                    <Chip tone={STATUS_META[e.status].tone}>{STATUS_META[e.status].label}</Chip>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditor({ mode: "edit", event: e })} aria-label={`Edit ${e.city} session`}
                      className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setDeleting(e)} aria-label={`Delete ${e.city} session`}
                      className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-[12px] text-sky-200/60 mt-1 tabular-nums">
                  {dateLabel(e.event_date)}
                  {e.start_time && <> · {timeLabel(e.start_time)}{e.end_time ? `–${timeLabel(e.end_time)}` : ""}</>}
                  {e.location && <> · {e.location}</>}
                </div>
                {e.members.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {e.members.map(m => <Chip key={m} tone="slate">{m}</Chip>)}
                  </div>
                )}
                {e.notes && <p className="text-[12px] text-sky-200/45 mt-1.5 line-clamp-2">{e.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {editor && (
        <FieldSalesEditor
          admins={admins}
          date={editor.mode === "create" ? editor.date : editor.event.event_date}
          event={editor.mode === "edit" ? editor.event : null}
          onClose={() => setEditor(null)}
          onSaved={row => {
            setEditor(null);
            setEvents(editor.mode === "edit"
              ? events.map(x => (x.id === row.id ? row : x))
              : [...events, row]);
          }}
          onConflict={() => { setEditor(null); reload(); }}
          onDelete={editor.mode === "edit" ? () => { setDeleting(editor.event); setEditor(null); } : undefined}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this sales session?"
          description={`The ${deleting.city} session on ${dateLabel(deleting.event_date)} will be permanently removed.`}
          destructiveLabel="Delete session"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </GlassPanel>
  );
}

/* ──────────────────────── Event editor ──────────────────────────── */

function FieldSalesEditor({ admins, date, event, onClose, onSaved, onConflict, onDelete }: {
  admins: AgencyAdminLite[];
  date: string;
  event: FieldSalesEvent | null;
  onClose: () => void;
  onSaved: (row: FieldSalesEvent) => void;
  onConflict: () => void;
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  const [eventDate, setEventDate] = useState(event?.event_date ?? date);
  const [start, setStart] = useState(event?.start_time?.slice(0, 5) ?? "10:00");
  const [end, setEnd] = useState(event?.end_time?.slice(0, 5) ?? "");
  const [members, setMembers] = useState<string[]>(event?.members ?? []);
  const [freeName, setFreeName] = useState("");
  const [city, setCity] = useState(event?.city ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [status, setStatus] = useState<FieldSalesEvent["status"]>(event?.status ?? "planned");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function addMember(name: string) {
    const n = name.trim();
    if (!n || members.includes(n)) return;
    setMembers([...members, n]);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isValidIsoDate(eventDate)) e.date = "Pick a date.";
    if (!city.trim()) e.city = "Where are we selling? City or territory is required.";
    if (start && !isValidTime(start)) e.start = "Start time looks wrong.";
    if (end && !isValidTime(end)) e.end = "End time looks wrong.";
    if (start && end && isValidTime(start) && isValidTime(end) && end <= start) e.end = "End must be after the start.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const values = {
      event_date: eventDate,
      start_time: start || null,
      end_time: end || null,
      members,
      city: city.trim(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      status,
    };
    const res = event
      ? await guardedUpdate<FieldSalesEvent>("field_sales_events", event.id, event.updated_at, values)
      : await insertRow<FieldSalesEvent>("field_sales_events", values);
    setBusy(false);
    if (res.error !== undefined) { toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { toast.info("Someone else edited this session — refreshed with their version."); onConflict(); return; }
    toast.success(event ? "Session updated" : "Sales day scheduled");
    onSaved(res.row);
  }

  return (
    <HqModal
      wide
      title={event ? "Edit field-sales session" : "Schedule a field-sales day"}
      subtitle={event ? undefined : "Who's going out, where, and when."}
      onClose={onClose}
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date" required error={errors.date}>
            <input type="date" className={fieldCls} value={eventDate} onChange={e => setEventDate(e.target.value)} />
          </Field>
          <Field label="Start" error={errors.start}>
            <input type="time" className={fieldCls} value={start} onChange={e => setStart(e.target.value)} />
          </Field>
          <Field label="End (optional)" error={errors.end}>
            <input type="time" className={fieldCls} value={end} onChange={e => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="City / territory" required error={errors.city}>
            <input className={fieldCls} value={city} onChange={e => setCity(e.target.value)} placeholder="Bakersfield" />
          </Field>
          <Field label="Meeting spot (optional)">
            <input className={fieldCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Downtown — 18th & Eye St" />
          </Field>
        </div>
        <Field label="Who's going">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {members.map(m => (
              <span key={m} className="inline-flex items-center gap-1 rounded-full bg-sky-400/12 border border-sky-400/25 text-sky-100 text-[12px] font-semibold px-2.5 py-1">
                {m}
                <button onClick={() => setMembers(members.filter(x => x !== m))} aria-label={`Remove ${m}`} className="text-sky-200/60 hover:text-white">×</button>
              </span>
            ))}
            {members.length === 0 && <span className="text-[12px] text-sky-200/35">No one assigned yet.</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {admins
              .map(a => (a.full_name || a.email || "").trim())
              .filter(n => n && !members.includes(n))
              .map(n => (
                <button key={n} onClick={() => addMember(n)}
                  className="rounded-full border border-white/12 bg-white/5 hover:bg-white/10 text-sky-100/80 text-[12px] px-2.5 py-1">
                  + {n}
                </button>
              ))}
            <span className="inline-flex items-center gap-1">
              <input className={fieldCls + " !h-8 !w-36 text-[12px]"} value={freeName} placeholder="Other name…"
                onChange={e => setFreeName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMember(freeName); setFreeName(""); } }} />
              <HqButton kind="ghost" className="h-8 px-2 text-[12px]" onClick={() => { addMember(freeName); setFreeName(""); }}>Add</HqButton>
            </span>
          </div>
        </Field>
        <Field label="Notes">
          <textarea className={areaCls} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Visit the prepared restaurant prospects near downtown." />
        </Field>
        <Field label="Status">
          <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as FieldSalesEvent["status"])}>
            <option value="planned">Planned</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <div className="flex items-center justify-between gap-2 pt-1">
          {onDelete ? (
            <HqButton kind="danger" className="h-9" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> Delete
            </HqButton>
          ) : <span />}
          <div className="flex gap-2">
            <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
            <HqButton onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : event ? "Save changes" : "Schedule day"}
            </HqButton>
          </div>
        </div>
      </div>
    </HqModal>
  );
}
