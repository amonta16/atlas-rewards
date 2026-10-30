"use client";
/**
 * mileage-section.tsx — CP-112
 *
 * Door-to-door mileage + field travel costs. Entries can link straight
 * to a Field Sales Calendar event from HQ. Reimbursement math only
 * appears when the founders have CONFIGURED a ¢/mile rate for that tax
 * year — nothing is hard-coded, and every figure is labeled an estimate
 * for the accountant to confirm.
 */
import { useMemo, useState } from "react";
import { Car, Plus, Pencil, Trash2, Loader2, Settings2, MapPin } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { createClient } from "@/lib/supabase/client";
import type {
  MileageEntry, MileageRate, FieldSalesEvent, ExpenseDocument, AgencyAdminLite,
} from "@/lib/types/database";
import { dollars, dateLabel, isValidIsoDate, parseMoneyToCents } from "@/lib/founder-hq";
import { mileageExtrasCents, mileageEstimateCents, rateForYear, centsToDecimal } from "@/lib/bookkeeping";
import { GlassPanel, Chip, HqButton, HqModal, Field, EmptyState, fieldCls, areaCls, selectCls } from "@/components/agency/hq/hq-ui";
import { insertRow, guardedUpdate, deleteRow } from "@/components/agency/hq/hq-data";
import { ReceiptAttach, ReceiptChip } from "./receipt-attach";

export function MileageSection({
  entries, rates, events, admins, documents, todayIso,
  onEntries, onRates, onDocument, onReload,
}: {
  entries: MileageEntry[];
  rates: MileageRate[];
  events: FieldSalesEvent[];
  admins: AgencyAdminLite[];
  documents: Map<string, ExpenseDocument>;
  todayIso: string;
  onEntries: (rows: MileageEntry[]) => void;
  onRates: (rows: MileageRate[]) => void;
  onDocument: (doc: ExpenseDocument) => void;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [editor, setEditor] = useState<{ entry: MileageEntry | null } | null>(null);
  const [deleting, setDeleting] = useState<MileageEntry | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [groupBy, setGroupBy] = useState("driver");   // driver | month | year | territory | event

  const eventById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);
  const adminName = (id: string | null) =>
    id ? (admins.find(a => a.user_id === id)?.full_name || admins.find(a => a.user_id === id)?.email || "—") : null;
  const driverLabel = (m: MileageEntry) => adminName(m.driver_user_id) ?? m.driver_name ?? "—";

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.trip_date.localeCompare(a.trip_date)).slice(0, 200),
    [entries]);

  const totals = useMemo(() => {
    const map = new Map<string, { miles: number; extras: number; estimate: number; hasRate: boolean }>();
    for (const m of entries) {
      const key =
        groupBy === "driver" ? driverLabel(m)
        : groupBy === "month" ? m.trip_date.slice(0, 7)
        : groupBy === "year" ? m.trip_date.slice(0, 4)
        : groupBy === "territory" ? (m.territory || m.destination || "—")
        : (m.field_event_id ? `${eventById.get(m.field_event_id)?.city ?? "Event"} · ${eventById.get(m.field_event_id)?.event_date ?? ""}` : "No linked event");
      const row = map.get(key) ?? { miles: 0, extras: 0, estimate: 0, hasRate: true };
      row.miles += Number(m.miles);
      row.extras += mileageExtrasCents(m);
      const est = mileageEstimateCents(m, rates);
      if (est == null) row.hasRate = false; else row.estimate += est;
      map.set(key, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].miles - a[1].miles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, groupBy, rates, admins, eventById]);

  const yearMiles = entries.filter(m => m.trip_date.slice(0, 4) === todayIso.slice(0, 4))
    .reduce((s, m) => s + Number(m.miles), 0);
  const currentRate = rateForYear(rates, todayIso);

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("mileage_entries", deleting.id);
    if (res.error) { toast.error("Delete failed — " + res.error); return; }
    onEntries(entries.filter(e => e.id !== deleting.id));
    setDeleting(null);
    toast.success("Mileage entry deleted");
  }

  return (
    <GlassPanel
      id="bk-mileage"
      title="Mileage & Field Expenses"
      subtitle={`${yearMiles.toLocaleString(undefined, { maximumFractionDigits: 1 })} business miles logged in ${todayIso.slice(0, 4)}.${currentRate ? "" : " No ¢/mile rate configured for this year — estimates hidden until you set one."}`}
      icon={<Car className="h-4 w-4" />}
      right={
        <>
          <HqButton kind="outline" onClick={() => setRatesOpen(true)}>
            <Settings2 className="h-4 w-4" /> Mileage rate
          </HqButton>
          <HqButton onClick={() => setEditor({ entry: null })}>
            <Plus className="h-4 w-4" /> Log a trip
          </HqButton>
        </>
      }
    >
      {sorted.length === 0 ? (
        <EmptyState
          icon={<Car className="h-4 w-4" />}
          title="No trips logged"
          hint="Log each door-to-door run — date, driver, route, miles — and link it to the sales-calendar day it belongs to."
        />
      ) : (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[860px] text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-sky-200/40">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Driver</th>
                  <th className="pb-2 pr-3">Route</th>
                  <th className="pb-2 pr-3 text-right">Miles</th>
                  <th className="pb-2 pr-3 text-right">Parking / tolls</th>
                  <th className="pb-2 pr-3 text-right">Est. value*</th>
                  <th className="pb-2 pr-3">Receipt</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(m => {
                  const ev = m.field_event_id ? eventById.get(m.field_event_id) : null;
                  const est = mileageEstimateCents(m, rates);
                  const doc = m.document_id ? documents.get(m.document_id) : null;
                  return (
                    <tr key={m.id} className="align-middle">
                      <td className="py-2.5 pr-3 border-t border-white/6 text-[12px] text-sky-100/70 tabular-nums whitespace-nowrap">{dateLabel(m.trip_date)}</td>
                      <td className="py-2.5 pr-3 border-t border-white/6 text-[12px] text-sky-100/80 whitespace-nowrap">{driverLabel(m)}</td>
                      <td className="py-2.5 pr-3 border-t border-white/6">
                        <button onClick={() => setEditor({ entry: m })} className="text-left">
                          <span className="text-[12.5px] text-white font-semibold hover:text-sky-300">
                            {(m.start_location || "—")} → {(m.destination || m.territory || "—")}
                          </span>
                          <span className="block text-[11px] text-sky-200/45 truncate max-w-[240px]">
                            {ev ? <><MapPin className="inline h-3 w-3 mr-0.5" />{ev.city} · {dateLabel(ev.event_date)}</> : (m.purpose ?? "")}
                          </span>
                        </button>
                      </td>
                      <td className="py-2.5 pr-3 border-t border-white/6 text-right font-bold text-white tabular-nums">{Number(m.miles).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                      <td className="py-2.5 pr-3 border-t border-white/6 text-right tabular-nums text-sky-100/70">
                        {mileageExtrasCents(m) > 0 ? dollars(mileageExtrasCents(m)) : "—"}
                      </td>
                      <td className="py-2.5 pr-3 border-t border-white/6 text-right tabular-nums text-sky-300 font-semibold">
                        {est != null ? dollars(est + mileageExtrasCents(m)) : <span className="text-sky-200/30">no rate</span>}
                      </td>
                      <td className="py-2.5 pr-3 border-t border-white/6"><ReceiptChip doc={doc} /></td>
                      <td className="py-2.5 border-t border-white/6">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditor({ entry: m })} aria-label="Edit trip"
                            className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setDeleting(m)} aria-label="Delete trip"
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
          </div>
          <p className="text-[11px] text-sky-200/35 mt-2">
            * miles × your configured {todayIso.slice(0, 4)} rate{currentRate ? ` (${currentRate.cents_per_mile}¢/mi)` : ""} + parking/tolls.
            An estimate for planning — your accountant confirms actual tax treatment.
          </p>

          {/* Totals */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-sky-200/50">Totals by</span>
              <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={groupBy} onChange={e => setGroupBy(e.target.value)} aria-label="Group totals by">
                <option value="driver">Founder / driver</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
                <option value="territory">City / territory</option>
                <option value="event">Field-sales event</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {totals.slice(0, 12).map(([key, t]) => (
                <Chip key={key} tone="sky">
                  {key}: {t.miles.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi
                  {t.extras > 0 && <> · {dollars(t.extras)} costs</>}
                  {t.hasRate && t.estimate > 0 && <> · est. {dollars(t.estimate)}</>}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}

      {editor && (
        <MileageEditor
          entry={editor.entry}
          events={events}
          admins={admins}
          documents={documents}
          todayIso={todayIso}
          onDocument={onDocument}
          onClose={() => setEditor(null)}
          onSaved={row => {
            setEditor(null);
            const exists = entries.some(e => e.id === row.id);
            onEntries(exists ? entries.map(e => (e.id === row.id ? row : e)) : [row, ...entries]);
          }}
          onConflict={() => { setEditor(null); onReload(); }}
        />
      )}

      {ratesOpen && (
        <RatesEditor rates={rates} todayIso={todayIso} onClose={() => setRatesOpen(false)} onRates={onRates} />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this trip?"
          description={`${dateLabel(deleting.trip_date)} — ${Number(deleting.miles)} miles will be permanently removed.`}
          destructiveLabel="Delete trip"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </GlassPanel>
  );
}

/* ─────────────────────────── Trip editor ────────────────────────── */

function MileageEditor({ entry, events, admins, documents, todayIso, onDocument, onClose, onSaved, onConflict }: {
  entry: MileageEntry | null;
  events: FieldSalesEvent[];
  admins: AgencyAdminLite[];
  documents: Map<string, ExpenseDocument>;
  todayIso: string;
  onDocument: (doc: ExpenseDocument) => void;
  onClose: () => void;
  onSaved: (row: MileageEntry) => void;
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [tripDate, setTripDate] = useState(entry?.trip_date ?? todayIso);
  const [driverId, setDriverId] = useState(entry?.driver_user_id ?? "");
  const [driverName, setDriverName] = useState(entry?.driver_name ?? "");
  const [startLoc, setStartLoc] = useState(entry?.start_location ?? "");
  const [destination, setDestination] = useState(entry?.destination ?? "");
  const [territory, setTerritory] = useState(entry?.territory ?? "");
  const [miles, setMiles] = useState(entry ? String(entry.miles) : "");
  const [purpose, setPurpose] = useState(entry?.purpose ?? "Door-to-door sales visits");
  const [eventId, setEventId] = useState(entry?.field_event_id ?? "");
  const [parking, setParking] = useState(entry && entry.parking_cents > 0 ? (entry.parking_cents / 100).toString() : "");
  const [tolls, setTolls] = useState(entry && entry.tolls_cents > 0 ? (entry.tolls_cents / 100).toString() : "");
  const [other, setOther] = useState(entry && entry.other_cents > 0 ? (entry.other_cents / 100).toString() : "");
  const [doc, setDoc] = useState<ExpenseDocument | null>(entry?.document_id ? (documents.get(entry.document_id) ?? null) : null);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const recentEvents = useMemo(
    () => [...events].sort((a, b) => b.event_date.localeCompare(a.event_date)).slice(0, 30),
    [events]);

  function pickEvent(id: string) {
    setEventId(id);
    const ev = events.find(e => e.id === id);
    if (ev && !territory) setTerritory(ev.city);
    if (ev && !destination) setDestination(ev.city);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isValidIsoDate(tripDate)) e.tripDate = "Pick the trip date.";
    const mi = parseFloat(miles);
    if (!Number.isFinite(mi) || mi <= 0 || mi > 5000) e.miles = "Total business miles for the trip.";
    for (const [k, v] of [["parking", parking], ["tolls", tolls], ["other", other]] as const) {
      if (v.trim() && parseMoneyToCents(v) == null) e[k] = "Bad amount.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const values = {
      trip_date: tripDate,
      driver_user_id: driverId || null,
      driver_name: driverId ? null : (driverName.trim() || null),
      start_location: startLoc.trim() || null,
      destination: destination.trim() || null,
      territory: territory.trim() || null,
      miles: parseFloat(miles),
      purpose: purpose.trim() || null,
      field_event_id: eventId || null,
      parking_cents: parking.trim() ? (parseMoneyToCents(parking) ?? 0) : 0,
      tolls_cents: tolls.trim() ? (parseMoneyToCents(tolls) ?? 0) : 0,
      other_cents: other.trim() ? (parseMoneyToCents(other) ?? 0) : 0,
      document_id: doc?.id ?? null,
      notes: notes.trim() || null,
    };
    const res = entry
      ? await guardedUpdate<MileageEntry>("mileage_entries", entry.id, entry.updated_at, values)
      : await insertRow<MileageEntry>("mileage_entries", values);
    setBusy(false);
    if (res.error !== undefined) { toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { toast.info("Someone else edited this trip — refreshed."); onConflict(); return; }
    if (doc) onDocument(doc);
    toast.success(entry ? "Trip updated" : "Trip logged");
    onSaved(res.row);
  }

  return (
    <HqModal wide title={entry ? "Edit trip" : "Log a field-sales trip"} onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Date" required error={errors.tripDate}>
            <input type="date" className={fieldCls} value={tripDate} onChange={e => setTripDate(e.target.value)} />
          </Field>
          <Field label="Driver">
            <select className={selectCls} value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">Other…</option>
              {admins.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>)}
            </select>
            {!driverId && (
              <input className={fieldCls + " mt-2"} value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver name" aria-label="Driver name" />
            )}
          </Field>
          <Field label="Business miles" required error={errors.miles}>
            <input className={fieldCls + " text-right tabular-nums"} value={miles} inputMode="decimal"
              onChange={e => setMiles(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="46.5" />
          </Field>
          <Field label="Linked sales day">
            <select className={selectCls} value={eventId} onChange={e => pickEvent(e.target.value)}>
              <option value="">Not linked</option>
              {recentEvents.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.city} · {ev.event_date}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="From">
            <input className={fieldCls} value={startLoc} onChange={e => setStartLoc(e.target.value)} placeholder="Home office" />
          </Field>
          <Field label="To / destination">
            <input className={fieldCls} value={destination} onChange={e => setDestination(e.target.value)} placeholder="Downtown Bakersfield" />
          </Field>
          <Field label="Territory">
            <input className={fieldCls} value={territory} onChange={e => setTerritory(e.target.value)} placeholder="Bakersfield" />
          </Field>
        </div>
        <Field label="Business purpose">
          <input className={fieldCls} value={purpose} onChange={e => setPurpose(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Parking" error={errors.parking}>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
              <input className={fieldCls + " pl-6"} value={parking} inputMode="decimal" onChange={e => setParking(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </Field>
          <Field label="Tolls" error={errors.tolls}>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
              <input className={fieldCls + " pl-6"} value={tolls} inputMode="decimal" onChange={e => setTolls(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </Field>
          <Field label="Other travel costs" error={errors.other}>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
              <input className={fieldCls + " pl-6"} value={other} inputMode="decimal" onChange={e => setOther(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
          </Field>
        </div>
        <ReceiptAttach value={doc} onChange={setDoc} label="Parking / toll receipts" />
        <Field label="Notes">
          <textarea className={areaCls} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : entry ? "Save changes" : "Log trip"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}

/* ─────────────────────────── Rates editor ───────────────────────── */

function RatesEditor({ rates, todayIso, onClose, onRates }: {
  rates: MileageRate[];
  todayIso: string;
  onClose: () => void;
  onRates: (rows: MileageRate[]) => void;
}) {
  const { toast } = useToast();
  const [year, setYear] = useState(todayIso.slice(0, 4));
  const [cents, setCents] = useState(() => {
    const r = rates.find(x => x.tax_year === Number(todayIso.slice(0, 4)));
    return r ? String(r.cents_per_mile) : "";
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const y = parseInt(year, 10);
    const c = parseInt(cents, 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) { toast.error("Enter a valid tax year"); return; }
    if (!Number.isFinite(c) || c <= 0 || c > 500) { toast.error("Enter the rate in cents per mile (e.g. 70)"); return; }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("mileage_rates")
      .upsert({ tax_year: y, jurisdiction: "US federal", cents_per_mile: c, note: note.trim() || null }, { onConflict: "tax_year,jurisdiction" })
      .select();
    setBusy(false);
    if (error) { toast.error("Couldn't save the rate — " + error.message); return; }
    const row = (data ?? [])[0] as MileageRate | undefined;
    if (row) onRates([...rates.filter(r => !(r.tax_year === row.tax_year && r.jurisdiction === row.jurisdiction)), row]);
    toast.success(`Rate saved: ${c}¢/mile for ${y}`);
    onClose();
  }

  return (
    <HqModal title="Mileage rate"
      subtitle="Set the ¢/mile your accountant tells you to use for each tax year. Estimates in the tracker use this — the app never assumes a rate."
      onClose={onClose}>
      <div className="space-y-3.5">
        {rates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rates.map(r => (
              <Chip key={`${r.tax_year}-${r.jurisdiction}`} tone="sky">
                {r.tax_year}: {r.cents_per_mile}¢/mi ({centsToDecimal(r.cents_per_mile)} $/mi)
              </Chip>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tax year">
            <input className={fieldCls} value={year} inputMode="numeric" onChange={e => setYear(e.target.value.replace(/[^0-9]/g, ""))} />
          </Field>
          <Field label="Cents per mile" hint="Ask your accountant for the current standard rate.">
            <input className={fieldCls} value={cents} inputMode="numeric" onChange={e => setCents(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 70" />
          </Field>
        </div>
        <Field label="Note (source)">
          <input className={fieldCls} value={note} onChange={e => setNote(e.target.value)} placeholder="Per accountant, Jan 2026" />
        </Field>
        <div className="flex justify-end gap-2">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rate"}</HqButton>
        </div>
      </div>
    </HqModal>
  );
}
