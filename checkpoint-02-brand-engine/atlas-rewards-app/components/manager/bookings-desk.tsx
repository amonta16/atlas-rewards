"use client";
/**
 * BookingsDesk — CP-147 · the front desk's Bookings tab
 *
 *   · Schedule: Today / Tomorrow / Next 7 days, grouped by start time, with
 *     one-tap Confirm / Arrived (complete) / No-show / Cancel.
 *   · Walk-in: staff books a cage / bay / room for a phone caller or a
 *     walk-in (optionally attached to a member) — lands as CONFIRMED.
 *   · Set up (managers): the bookable resources — name, how many, lengths,
 *     party cap, hours, price / deposit (display only until payments land).
 *     Also the customer-facing on/off switch (widget_config.booking).
 *
 * Realtime-free on purpose (CP-85/88 stampede lessons): the list refreshes
 * on tab focus, after every action, and every 2 minutes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Loader2, Plus, Users, Phone, X, UserX, Settings2 } from "lucide-react";
import { BookingResourceSetup } from "@/components/manager/booking-resource-setup";
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

type Range = "today" | "tomorrow" | "week";

type MemberLite = { membership_id: string; full_name: string | null; phone: string | null; email: string | null };

export function BookingsDesk({
  business, isManager, lastMember, onBusinessPatched,
}: {
  business: Business;
  isManager: boolean;
  /** CP-95's "previous customer" — one tap attaches the walk-in to them. */
  lastMember: MemberLite | null;
  onBusinessPatched: (patch: Partial<Business>) => void;
}) {
  const primary = business.brand_colors.primary;
  const [range, setRange] = useState<Range>("today");
  const [rows, setRows] = useState<DeskBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState<BookingResource[]>([]);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const enabled = bookingEnabled(business);

  const window_ = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === "today") return { from: start, to: new Date(start.getTime() + 86_400_000) };
    if (range === "tomorrow") return { from: new Date(start.getTime() + 86_400_000), to: new Date(start.getTime() + 2 * 86_400_000) };
    return { from: start, to: new Date(start.getTime() + 7 * 86_400_000) };
  }, [range]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data }, { data: res }] = await Promise.all([
      supabase.rpc("list_resource_bookings", {
        p_business_id: business.id, p_from: window_.from.toISOString(), p_to: window_.to.toISOString(),
      }),
      supabase.rpc("list_booking_resources", { p_business_id: business.id }),
    ]);
    setRows((data ?? []) as DeskBooking[]);
    setResources((res ?? []) as BookingResource[]);
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
    load();
  }

  async function toggleEnabled() {
    const next = { ...business.widget_config, booking: !enabled };
    const { error } = await createClient().from("businesses").update({ widget_config: next }).eq("id", business.id);
    if (error) { alert("Couldn't save: " + error.message); return; }
    onBusinessPatched({ widget_config: next });
  }

  const live = rows.filter(r => r.status === "pending" || r.status === "confirmed");
  const pendingCount = rows.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div
        className="rounded-3xl p-5 text-white relative overflow-hidden shadow-xl"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${business.brand_colors.secondary} 100%)` }}
      >
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase bg-white/20 px-2.5 py-1 rounded-full">
              <CalendarClock className="h-3 w-3" /> Bookings
            </div>
            <h2 className="text-2xl font-black mt-1.5">
              {loading ? "—" : `${live.length} ${range === "today" ? "today" : range === "tomorrow" ? "tomorrow" : "this week"}`}
            </h2>
            <p className="text-xs text-white/90 mt-0.5">
              {pendingCount > 0 ? <><b>{pendingCount}</b> waiting for a confirm tap</> : "Everything's confirmed."}
              {!enabled && " · Customers can't book yet (off in Set up)."}
            </p>
          </div>
          <Button onClick={() => { setShowWalkIn(v => !v); setShowSetup(false); }} className="bg-white text-zinc-900 hover:bg-zinc-100 h-11 font-extrabold shadow-lg" disabled={resources.length === 0}>
            <Plus className="h-4 w-4 mr-1.5" /> Walk-in / phone
          </Button>
          {isManager && (
            <Button onClick={() => { setShowSetup(v => !v); setShowWalkIn(false); }} className="bg-white/15 border border-white/40 text-white hover:bg-white/25 h-11 font-extrabold">
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

      {showWalkIn && resources.length > 0 && (
        <WalkInForm
          business={business}
          resources={resources.filter(r => r.is_active)}
          lastMember={lastMember}
          onDone={() => { setShowWalkIn(false); load(); }}
          onCancel={() => setShowWalkIn(false)}
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

      {/* Range picker */}
      <div className="flex rounded-xl bg-zinc-100 p-1 gap-1">
        {([["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "Next 7 days"]] as [Range, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setRange(id)}
            className={cn("flex-1 rounded-lg py-2 text-xs font-semibold transition-colors", range === id ? "bg-white text-zinc-900 shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Schedule */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">No bookings {range === "week" ? "in the next 7 days" : range}.</div>
        ) : (
          <div className="divide-y">
            {rows.map(r => {
              const s = STATUS_STYLE[r.status];
              const done = r.status === "completed" || r.status === "cancelled" || r.status === "no_show";
              const startsIn = new Date(r.scheduled_at).getTime() - Date.now();
              const soon = !done && startsIn > 0 && startsIn < 45 * 60_000;
              return (
                <div key={r.id} className={cn("px-4 py-3 flex items-center gap-3", done && "opacity-60")}>
                  <div className="w-[64px] shrink-0 text-center">
                    <div className="text-sm font-black tabular-nums leading-tight">{timeLabel(r.scheduled_at)}</div>
                    {range === "week" && <div className="text-[10px] text-zinc-500">{new Date(r.scheduled_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>}
                    <div className="text-[10px] text-zinc-500">{durationLabel(r.duration_minutes)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-2">
                      {r.customer_name ?? "Guest"}
                      <span className="text-[10px] font-semibold text-zinc-500 inline-flex items-center gap-0.5"><Users className="h-3 w-3" />{r.party_size}</span>
                      {soon && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800">soon</span>}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {r.resource_name}
                      {r.customer_phone && <> · <Phone className="h-3 w-3 inline -mt-0.5" /> {r.customer_phone}</>}
                      {r.payment_status === "due" && r.deposit_cents ? <> · <b className="text-amber-700">{dollars(r.deposit_cents)} deposit due</b></> : null}
                      {r.payment_status === "paid" && <> · <b className="text-emerald-700">paid</b></>}
                      {r.notes && <> · “{r.notes}”</>}
                    </div>
                  </div>
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full shrink-0", s.cls)}>{s.label}</span>
                  {!done && (
                    <div className="flex items-center gap-1 shrink-0">
                      {r.status === "pending" && (
                        <IconBtn title="Confirm" onClick={() => setStatus(r.id, "confirmed")} busy={busyId === r.id} tone="emerald"><Check className="h-4 w-4" /></IconBtn>
                      )}
                      {r.status === "confirmed" && (
                        <IconBtn title="Arrived" onClick={() => setStatus(r.id, "completed")} busy={busyId === r.id} tone="emerald"><Check className="h-4 w-4" /></IconBtn>
                      )}
                      <IconBtn title="No-show" onClick={() => setStatus(r.id, "no_show")} busy={busyId === r.id} tone="amber"><UserX className="h-4 w-4" /></IconBtn>
                      <IconBtn title="Cancel" onClick={() => setStatus(r.id, "cancelled")} busy={busyId === r.id} tone="rose"><X className="h-4 w-4" /></IconBtn>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, busy, tone, title }: { children: React.ReactNode; onClick: () => void; busy: boolean; tone: "emerald" | "amber" | "rose"; title: string }) {
  const cls = { emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100", amber: "bg-amber-50 text-amber-700 hover:bg-amber-100", rose: "bg-rose-50 text-rose-700 hover:bg-rose-100" }[tone];
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={busy} className={cn("h-9 w-9 rounded-full flex items-center justify-center transition disabled:opacity-50", cls)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

/* ── Walk-in / phone booking ─────────────────────────────────────────── */
function WalkInForm({
  business, resources, lastMember, onDone, onCancel,
}: { business: Business; resources: BookingResource[]; lastMember: MemberLite | null; onDone: () => void; onCancel: () => void }) {
  const primary = business.brand_colors.primary;
  const [resource, setResource] = useState<BookingResource>(resources[0]);
  const [duration, setDuration] = useState<number>(resources[0].durations[0]);
  const [day, setDay] = useState<string>(() => isoDay(new Date()));
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
      setSlots((data ?? []) as BookingSlot[]);
      setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [resource.id, day, duration]);

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
        <h3 className="font-bold">New booking</h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {resources.map(r => (
          <button key={r.id} type="button" onClick={() => { setResource(r); setDuration(r.durations[0]); setParty(Math.min(2, r.max_party)); }}
            className={cn("rounded-xl border p-3 text-left text-sm font-bold flex items-center gap-2", resource.id === r.id ? "text-white" : "bg-white")}
            style={resource.id === r.id ? { background: primary, borderColor: primary } : undefined}>
            <span className="text-lg">{r.emoji ?? "📅"}</span><span className="truncate">{r.name}</span>
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
