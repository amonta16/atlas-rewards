"use client";
/**
 * BookingsDesk — CP-147 → CP-148 · the front desk's Bookings tab
 *
 *   · DAY SHEET (default): time down the side, one column per cage / bay /
 *     lane / room. Blocks = bookings (amber = needs confirm, green =
 *     confirmed, grey = done, faded red = cancelled / no-show). Tap an
 *     empty cell → walk-in form pre-filled with that spot + time. Tap a
 *     block → action card (Confirm · Arrived · No-show · Cancel).
 *   · ‹ › day arrows, "Today", and "Next week →" / "← This week" jumps.
 *   · Walk-in / phone form (attach the previous customer in one tap).
 *   · Set up (managers): resources + the customer on/off switch — shared
 *     with the app builder's Bookings tab.
 *
 * Realtime-free on purpose (CP-85/88 stampede lessons): refreshes on tab
 * focus, after every action, and every 2 minutes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Loader2, Plus, Users, Phone, X, UserX, Settings2, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { BookingResourceSetup } from "@/components/manager/booking-resource-setup";
import { BookingTimesheet } from "@/components/manager/booking-timesheet";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  type BookingResource, type BookingSlot, type DeskBooking, type BookingStatus,
  dollars, durationLabel, timeLabel, dayLabel, isoDay, STATUS_STYLE, bookingEnabled,
} from "@/lib/booking";
import type { Business } from "@/lib/types/database";

type MemberLite = { membership_id: string; full_name: string | null; phone: string | null; email: string | null };

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

export function BookingsDesk({
  business, isManager, lastMember, onBusinessPatched, onActionsChanged,
}: {
  business: Business;
  isManager: boolean;
  /** CP-95's "previous customer" — one tap attaches the walk-in to them. */
  lastMember: MemberLite | null;
  onBusinessPatched: (patch: Partial<Business>) => void;
  /** CP-148: tell the shell to recount the needs-action badge. */
  onActionsChanged?: () => void;
}) {
  const primary = business.brand_colors.primary;
  const today = isoDay(new Date());
  const [day, setDay] = useState<string>(today);
  const [rows, setRows] = useState<DeskBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<BookingResource[]>([]);
  const [walkIn, setWalkIn] = useState<WalkInPrefill | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [selected, setSelected] = useState<DeskBooking | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const enabled = bookingEnabled(business);

  const window_ = useMemo(() => {
    const [y, m, d] = day.split("-").map(Number);
    const from = new Date(y, m - 1, d);
    return { from, to: new Date(y, m - 1, d + 1) };
  }, [day]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: res }] = await Promise.all([
      supabase.rpc("list_resource_bookings", {
        p_business_id: business.id, p_from: window_.from.toISOString(), p_to: window_.to.toISOString(),
      }),
      supabase.rpc("list_booking_resources", { p_business_id: business.id }),
    ]);
    const list = (data ?? []) as DeskBooking[];
    setRows(list);
    setResources((res ?? []) as BookingResource[]);
    setSelected(sel => sel ? (list.find(b => b.id === sel.id) ?? null) : null);
    setLoading(false);
  }, [business.id, window_]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 120_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  async function setStatus(id: string, status: BookingStatus) {
    if (status === "cancelled" && !confirm("Cancel this booking?")) return;
    setBusyId(id);
    const { error } = await createClient().rpc("update_booking_status", { p_id: id, p_status: status, p_reason: null });
    setBusyId(null);
    if (error) { alert(error.message); return; }
    if (status !== "confirmed") setSelected(null);
    load();
    onActionsChanged?.();
  }

  async function toggleEnabled() {
    const next = { ...business.widget_config, booking: !enabled };
    const { error } = await createClient().from("businesses").update({ widget_config: next }).eq("id", business.id);
    if (error) { alert("Couldn't save: " + error.message); return; }
    onBusinessPatched({ widget_config: next });
  }

  const active = resources.filter(r => r.is_active);
  const live = rows.filter(r => r.status === "pending" || r.status === "confirmed");
  const pendingCount = rows.filter(r => r.status === "pending").length;
  const dayDate = useMemo(() => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); }, [day]);
  const diff = Math.round((dayDate.getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86_400_000);
  const dayTitle = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : dayDate.toLocaleDateString(undefined, { weekday: "long" });
  const inNextWeek = diff >= 7 && diff < 14;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div
        className="rounded-3xl p-5 text-white relative overflow-hidden shadow-xl"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${business.brand_colors.secondary} 100%)` }}
      >
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase bg-white/20 px-2.5 py-1 rounded-full">
              <CalendarClock className="h-3 w-3" /> Bookings
            </div>
            <h2 className="text-2xl font-black mt-1.5">
              {loading ? "—" : `${live.length} ${dayTitle === "Today" || dayTitle === "Tomorrow" ? dayTitle.toLowerCase() : "on " + dayDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`}
            </h2>
            <p className="text-xs text-white/90 mt-0.5">
              {pendingCount > 0 ? <><b>{pendingCount}</b> waiting for a confirm tap</> : live.length > 0 ? "Everything's confirmed." : "Tap any open cell on the sheet to book it."}
              {!enabled && " · Customers can't book yet (off in Set up)."}
            </p>
          </div>
          <Button onClick={() => { setWalkIn(walkIn ? null : { day }); setShowSetup(false); }} className="bg-white text-zinc-900 hover:bg-zinc-100 h-11 font-extrabold shadow-lg" disabled={active.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" /> Walk-in / phone
          </Button>
          {isManager && (
            <Button onClick={() => { setShowSetup(v => !v); setWalkIn(null); }} className="bg-white/15 border border-white/40 text-white hover:bg-white/25 h-11 font-extrabold">
              <Settings2 className="h-4 w-4 mr-1.5" /> Set up
            </Button>
          )}
        </div>
      </div>

      {resources.length === 0 && !showSetup && (
        <div className="rounded-2xl border bg-white p-5 text-sm">
          <div className="font-bold">Nothing is bookable yet.</div>
          <p className="text-zinc-600 mt-1">
            {isManager
              ? "Tap Set up and add what customers can reserve — cages, bays, lanes, a party room — with how many you have and the lengths you offer."
              : "Ask the manager to add bookable spots under Set up."}
          </p>
        </div>
      )}

      {walkIn && active.length > 0 && (
        <WalkInForm
          key={`${walkIn.resourceId ?? ""}|${walkIn.startsAt ?? ""}|${walkIn.day ?? ""}`}
          business={business}
          resources={active}
          lastMember={lastMember}
          prefill={walkIn}
          onDone={() => { setWalkIn(null); load(); onActionsChanged?.(); }}
          onCancel={() => setWalkIn(null)}
        />
      )}

      {showSetup && isManager && (
        <BookingResourceSetup
          business={business}
          resources={resources}
          enabled={enabled}
          onToggleEnabled={toggleEnabled}
          onChanged={load}
        />
      )}

      {/* Day navigation */}
      <div className="rounded-2xl border bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setDay(d => addDays(d, -1))} className="h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center" aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
        <div className="min-w-[190px]">
          <div className="text-base font-extrabold leading-tight">{dayTitle}</div>
          <div className="text-[11px] text-zinc-500">{dayDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div>
        </div>
        <button type="button" onClick={() => setDay(d => addDays(d, 1))} className="h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center" aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {day !== today && (
            <button type="button" onClick={() => setDay(today)} className="h-9 px-3 rounded-full text-xs font-bold border bg-white hover:bg-zinc-50">Today</button>
          )}
          <button
            type="button"
            onClick={() => setDay(inNextWeek ? today : addDays(today, 7))}
            className="h-9 px-3 rounded-full text-xs font-bold text-white inline-flex items-center gap-1"
            style={{ background: primary }}
          >
            <CalendarDays className="h-3.5 w-3.5" /> {inNextWeek ? "← This week" : "Next week →"}
          </button>
        </div>
      </div>

      {/* Selected booking — action card */}
      {selected && (() => {
        const s = STATUS_STYLE[selected.status];
        const done = selected.status === "completed" || selected.status === "cancelled" || selected.status === "no_show";
        return (
          <div className="rounded-2xl border bg-white p-4 flex items-center gap-3 flex-wrap shadow-sm ring-1" style={{ ["--tw-ring-color" as string]: `${primary}55` }}>
            <div className="flex-1 min-w-[220px]">
              <div className="text-sm font-extrabold flex items-center gap-2">
                {selected.customer_name ?? "Guest"}
                <span className="text-[11px] font-semibold text-zinc-500 inline-flex items-center gap-0.5"><Users className="h-3 w-3" />{selected.party_size}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", s.cls)}>{s.label}</span>
              </div>
              <div className="text-[12px] text-zinc-600 mt-0.5">
                {selected.resource_name} · {timeLabel(selected.scheduled_at)}–{timeLabel(selected.scheduled_end)} · {durationLabel(selected.duration_minutes)}
                {selected.customer_phone && <> · <Phone className="h-3 w-3 inline -mt-0.5" /> {selected.customer_phone}</>}
                {selected.payment_status === "due" && selected.deposit_cents ? <> · <b className="text-amber-700">{dollars(selected.deposit_cents)} deposit due</b></> : null}
                {selected.payment_status === "paid" && <> · <b className="text-emerald-700">paid</b></>}
                {selected.notes && <> · “{selected.notes}”</>}
                <span className="text-zinc-400"> · booked {selected.source === "desk" ? "at the desk" : "in the app"}</span>
              </div>
            </div>
            {!done && (
              <div className="flex items-center gap-1.5">
                {selected.status === "pending" && (
                  <Button size="sm" onClick={() => setStatus(selected.id, "confirmed")} disabled={busyId === selected.id} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"><Check className="h-4 w-4 mr-1" /> Confirm</Button>
                )}
                {selected.status === "confirmed" && (
                  <Button size="sm" onClick={() => setStatus(selected.id, "completed")} disabled={busyId === selected.id} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"><Check className="h-4 w-4 mr-1" /> Arrived</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, "no_show")} disabled={busyId === selected.id} className="text-amber-700 border-amber-300"><UserX className="h-4 w-4 mr-1" /> No-show</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(selected.id, "cancelled")} disabled={busyId === selected.id} className="text-rose-700 border-rose-300"><X className="h-4 w-4 mr-1" /> Cancel</Button>
              </div>
            )}
            <button type="button" onClick={() => setSelected(null)} className="h-8 w-8 rounded-full hover:bg-zinc-100 flex items-center justify-center" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        );
      })()}

      {/* Day sheet */}
      {loading && rows.length === 0 && resources.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> Loading…</div>
      ) : resources.length > 0 && (
        <BookingTimesheet
          business={business}
          resources={active}
          bookings={rows}
          day={day}
          selectedId={selected?.id}
          onPickBooking={b => { setSelected(b); }}
          onPickSlot={(r, at) => { setShowSetup(false); setWalkIn({ resourceId: r.id, day, startsAt: at.toISOString() }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        />
      )}

      <div className="flex items-center gap-3 text-[11px] text-zinc-500 px-1 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100 border border-amber-300" /> needs confirm</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100 border border-emerald-300" /> confirmed</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-zinc-100 border border-zinc-300" /> done</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-50 border border-rose-200" /> cancelled / no-show</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-[repeating-linear-gradient(135deg,#f4f4f5_0_3px,#fafafa_3px_6px)] border" /> closed</span>
        <span className="ml-auto">Tap an empty cell to book it.</span>
      </div>
    </div>
  );
}

/* ── Walk-in / phone booking ─────────────────────────────────────────── */
export type WalkInPrefill = { resourceId?: string; day?: string; startsAt?: string };

function WalkInForm({
  business, resources, lastMember, onDone, onCancel, prefill,
}: { business: Business; resources: BookingResource[]; lastMember: MemberLite | null; onDone: () => void; onCancel: () => void; prefill?: WalkInPrefill }) {
  const primary = business.brand_colors.primary;
  const initial = resources.find(r => r.id === prefill?.resourceId) ?? resources[0];
  const [resource, setResource] = useState<BookingResource>(initial);
  const [duration, setDuration] = useState<number>(initial.durations[0]);
  const [day, setDay] = useState<string>(() => prefill?.day ?? isoDay(new Date()));
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [picked, setPicked] = useState<BookingSlot | null>(null);
  const [party, setParty] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [attach, setAttach] = useState<MemberLite | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const days = useMemo(() => {
    const out: Date[] = []; const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) out.push(new Date(base.getTime() + i * 86_400_000));
    return out;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSlots(true); setSlots([]); setPicked(null);
    (async () => {
      const { data, error } = await createClient().rpc("booking_resource_slots", { p_resource_id: resource.id, p_day: day, p_duration: duration });
      if (cancelled) return;
      if (error) setErr(error.message);
      const list = (data ?? []) as BookingSlot[];
      setSlots(list);
      // CP-148: tapped an empty cell on the day sheet → pre-select that time.
      if (prefill?.startsAt) {
        const want = new Date(prefill.startsAt).getTime();
        const hit = list.find(x => new Date(x.slot_start).getTime() === want && x.units_left > 0);
        if (hit) setPicked(hit);
      }
      setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [resource.id, day, duration, prefill?.startsAt]);

  function attachMember(m: MemberLite) {
    setAttach(m);
    setName(m.full_name ?? "");
    setPhone(m.phone ?? "");
  }

  async function submit() {
    if (!picked) { setErr("Pick a start time."); return; }
    if (!name.trim() && !attach) { setErr("Who is it for? Type a name."); return; }
    setSubmitting(true); setErr(null);
    const { error } = await createClient().rpc("desk_book_resource", {
      p_resource_id: resource.id, p_starts_at: picked.slot_start, p_duration: duration, p_party: party,
      p_membership_id: attach?.membership_id ?? null,
      p_name: name.trim() || null, p_phone: phone.trim() || null, p_email: null, p_notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    onDone();
  }

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">New booking {prefill?.startsAt ? <span className="text-zinc-500 font-semibold">· {resource.name} · {timeLabel(prefill.startsAt)}</span> : null}</h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {resources.map(r => (
          <button key={r.id} type="button" onClick={() => { setResource(r); setDuration(r.durations[0]); setParty(Math.min(2, r.max_party)); }}
            className={cn("rounded-xl border p-3 text-left text-sm font-bold flex items-center gap-2", resource.id === r.id ? "text-white" : "bg-white")}
            style={resource.id === r.id ? { background: primary, borderColor: primary } : undefined}>
            {r.image_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={r.image_url} alt="" className="h-7 w-7 rounded-md object-cover shrink-0" />
              : <span className="text-lg">{r.emoji ?? "📅"}</span>}
            <span className="truncate">{r.name}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {resource.durations.map(d => (
          <button key={d} type="button" onClick={() => setDuration(d)}
            className={cn("px-3 h-9 rounded-full text-xs font-bold border", duration === d ? "text-white" : "bg-white")}
            style={duration === d ? { background: primary, borderColor: primary } : undefined}>
            {durationLabel(d)}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map(d => {
          const id = isoDay(d); const on = id === day;
          return (
            <button key={id} type="button" onClick={() => setDay(id)}
              className={cn("shrink-0 w-[54px] rounded-xl border py-1.5 text-center", on ? "text-white" : "bg-white")}
              style={on ? { background: primary, borderColor: primary } : undefined}>
              <div className="text-[9px] font-bold uppercase opacity-80">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="text-base font-extrabold leading-tight">{d.getDate()}</div>
            </button>
          );
        })}
      </div>

      {loadingSlots ? (
        <div className="text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Checking…</div>
      ) : slots.length === 0 ? (
        <div className="text-sm text-zinc-500">Closed / nothing open this day.</div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {slots.map(s => {
            const full = s.units_left <= 0; const on = picked?.slot_start === s.slot_start;
            return (
              <button key={s.slot_start} type="button" disabled={full} onClick={() => setPicked(s)}
                className={cn("rounded-lg border py-2 text-xs font-bold", full ? "bg-zinc-100 text-zinc-400 line-through" : on ? "text-white" : "bg-white")}
                style={on ? { background: primary, borderColor: primary } : undefined}>
                {timeLabel(s.slot_start)}
                {!full && resource.units > 1 && <div className={cn("text-[9px] font-semibold", on ? "opacity-90" : "text-emerald-700")}>{s.units_left} left</div>}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <div className="space-y-2">
          {lastMember && !attach && (
            <button type="button" onClick={() => attachMember(lastMember)} className="text-xs font-bold underline" style={{ color: primary }}>
              Use previous customer: {lastMember.full_name ?? lastMember.phone ?? "member"}
            </button>
          )}
          {attach && (
            <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><Check className="h-3 w-3" /> Attached to member {attach.full_name ?? ""} <button type="button" className="underline text-zinc-500 ml-1" onClick={() => setAttach(null)}>detach</button></div>
          )}
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel" />
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note (optional)" maxLength={200} />
        </div>
        <div className="text-center">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Party</Label>
          <div className="flex items-center gap-1.5 mt-1">
            <button type="button" onClick={() => setParty(p => Math.max(1, p - 1))} className="h-10 w-10 rounded-full border text-lg font-bold">−</button>
            <div className="w-8 text-xl font-extrabold tabular-nums">{party}</div>
            <button type="button" onClick={() => setParty(p => Math.min(resource.max_party, p + 1))} className="h-10 w-10 rounded-full border text-lg font-bold">+</button>
          </div>
        </div>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Button onClick={submit} disabled={submitting || !picked} className="w-full h-12 text-base font-bold text-white" style={{ background: primary }}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Book ${picked ? timeLabel(picked.slot_start) : ""}`}
      </Button>
    </div>
  );
}
