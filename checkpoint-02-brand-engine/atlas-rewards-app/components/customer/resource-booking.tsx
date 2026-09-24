"use client";
/**
 * ResourceBooking — CP-147 · customer side of Booking v2
 *
 *   1. Pick what to book   (cage / bay / lane / room — a booking_resource)
 *   2. Pick how long       (one of the resource's durations)
 *   3. Pick a day + time   (14-day strip → slot grid with "N left" chips)
 *   4. Party size + note   → Book
 *   5. Done                (+ "Your bookings" list with cancel)
 *
 * No money changes hands here yet: paymentProviderFor() returns the
 * no-payment provider, whose describe() tells the customer to pay at the
 * counter (or that a deposit is due there). See lib/booking.ts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Users, Clock, CalendarClock, Loader2, ChevronRight, XCircle, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  type BookingResource, type BookingSlot, type MyBooking,
  dollars, durationLabel, timeLabel, dayLabel, isoDay, STATUS_STYLE, paymentProviderFor,
} from "@/lib/booking";
import type { Business } from "@/lib/types/database";

type Step = "resource" | "time" | "confirm" | "done";

function nextDays(n: number): Date[] {
  const out: Date[] = [];
  const base = new Date(); base.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) out.push(new Date(base.getTime() + i * 86_400_000));
  return out;
}

export function ResourceBooking({ business, resources }: { business: Business; resources: BookingResource[] }) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const pay = paymentProviderFor(business);

  const [step, setStep] = useState<Step>("resource");
  const [resource, setResource] = useState<BookingResource | null>(resources.length === 1 ? resources[0] : null);
  const [duration, setDuration] = useState<number>(resources.length === 1 ? resources[0].durations[0] : 60);
  const [day, setDay] = useState<string>(() => isoDay(new Date()));
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [picked, setPicked] = useState<BookingSlot | null>(null);
  const [party, setParty] = useState(2);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<MyBooking[]>([]);
  const [doneId, setDoneId] = useState<string | null>(null);

  const days = useMemo(() => nextDays(Math.min(14, (resource?.horizon_days ?? 14) + 1)), [resource?.horizon_days]);

  const loadMine = useCallback(async () => {
    const { data } = await createClient().rpc("my_bookings", { p_business_id: business.id });
    setMine((data ?? []) as MyBooking[]);
  }, [business.id]);
  useEffect(() => { loadMine(); }, [loadMine]);

  // Slots for (resource, duration, day).
  useEffect(() => {
    if (step !== "time" || !resource) return;
    let cancelled = false;
    setLoadingSlots(true); setSlots([]); setPicked(null); setErr(null);
    (async () => {
      const { data, error } = await createClient().rpc("booking_resource_slots", {
        p_resource_id: resource.id, p_day: day, p_duration: duration,
      });
      if (cancelled) return;
      if (error) setErr(error.message);
      setSlots((data ?? []) as BookingSlot[]);
      setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [step, resource, duration, day]);

  function chooseResource(r: BookingResource) {
    setResource(r);
    setDuration(r.durations[0]);
    setParty(Math.min(2, r.max_party));
    setStep("time");
  }

  async function book() {
    if (!resource || !picked) return;
    setSubmitting(true); setErr(null);
    const { data, error } = await createClient().rpc("book_resource", {
      p_resource_id: resource.id,
      p_starts_at: picked.slot_start,
      p_duration: duration,
      p_party: party,
      p_notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setDoneId(data as string);
    setStep("done");
    loadMine();
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    const { error } = await createClient().rpc("cancel_my_booking", { p_id: id });
    if (error) { alert(error.message); return; }
    loadMine();
  }

  const upcoming = mine.filter(m => new Date(m.scheduled_end).getTime() > Date.now() && (m.status === "pending" || m.status === "confirmed"));
  const past = mine.filter(m => !upcoming.includes(m));

  /* ── header ─────────────────────────────────────────────────────── */
  const header = (
    <div className="flex items-center gap-2 mb-4">
      {step !== "resource" && step !== "done" && (
        <button
          type="button"
          onClick={() => setStep(step === "confirm" ? "time" : "resource")}
          className="h-9 w-9 rounded-full bg-white border flex items-center justify-center shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold leading-tight">
          {step === "resource" ? "Book a spot" : step === "time" ? resource?.name : step === "confirm" ? "Confirm booking" : "You're booked!"}
        </h1>
        <p className="text-xs text-muted-foreground">
          {step === "resource" ? "Reserve your time before you come in." :
           step === "time" ? "Pick a length, a day and a start time." :
           step === "confirm" ? "One last look before we hold it." : "See you soon."}
        </p>
      </div>
    </div>
  );

  return (
    <div className="px-4 pt-5 pb-10">
      {header}

      {/* STEP 1 — what */}
      {step === "resource" && (
        <div className="space-y-3">
          {resources.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => chooseResource(r)}
              className="w-full rounded-2xl bg-white border shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
            >
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl shrink-0 overflow-hidden"
                style={{ background: `${primary}14` }}
              >
                {r.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={r.image_url} alt="" className="h-full w-full object-cover" />
                  : (r.emoji ?? "📅")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{r.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {r.durations.map(durationLabel).join(" · ")}
                  {r.price_cents ? <> · {dollars(r.price_cents)}</> : null}
                  {" · "}up to {r.max_party}
                </div>
                {r.description && <div className="text-xs text-zinc-600 mt-0.5 line-clamp-2">{r.description}</div>}
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
            </button>
          ))}

          <MyBookingsList upcoming={upcoming} past={past} primary={primary} onCancel={cancel} />
        </div>
      )}

      {/* STEP 2 — when */}
      {step === "time" && resource && (
        <div className="space-y-4">
          {resource.durations.length > 1 && (
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">How long</Label>
              <div className="mt-1.5 flex gap-2 flex-wrap">
                {resource.durations.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn("px-3.5 h-10 rounded-full text-sm font-bold border transition", duration === d ? "text-white" : "bg-white")}
                    style={duration === d ? { background: primary, borderColor: primary } : undefined}
                  >
                    {durationLabel(d)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Day</Label>
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
              {days.map(d => {
                const id = isoDay(d);
                const on = id === day;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDay(id)}
                    className={cn("shrink-0 w-[62px] rounded-2xl border py-2 text-center transition", on ? "text-white" : "bg-white")}
                    style={on ? { background: primary, borderColor: primary } : undefined}
                  >
                    <div className="text-[10px] font-bold uppercase opacity-80">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="text-lg font-extrabold leading-tight">{d.getDate()}</div>
                    <div className="text-[10px] opacity-80">{d.toLocaleDateString(undefined, { month: "short" })}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Start time</Label>
            {loadingSlots ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking availability…</div>
            ) : slots.length === 0 ? (
              <div className="mt-2 rounded-2xl border bg-white p-5 text-center text-sm text-zinc-500">
                Nothing open this day — try another one.
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {slots.map(s => {
                  const full = s.units_left <= 0;
                  const on = picked?.slot_start === s.slot_start;
                  return (
                    <button
                      key={s.slot_start}
                      type="button"
                      disabled={full}
                      onClick={() => setPicked(s)}
                      className={cn(
                        "rounded-xl border py-2.5 text-center transition",
                        full ? "bg-zinc-100 text-zinc-400 line-through" : on ? "text-white" : "bg-white",
                      )}
                      style={on ? { background: primary, borderColor: primary } : undefined}
                    >
                      <div className="text-sm font-bold">{timeLabel(s.slot_start)}</div>
                      {!full && resource.units > 1 && (
                        <div className={cn("text-[10px] font-semibold", on ? "opacity-90" : "text-emerald-700")}>
                          {s.units_left} {resource.unit_label}{s.units_left === 1 ? "" : "s"} left
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {err && <p className="text-sm text-rose-600">{err}</p>}

          <Button
            disabled={!picked}
            onClick={() => setStep("confirm")}
            className="w-full h-12 text-base font-bold text-white"
            style={{ background: picked ? primary : undefined }}
          >
            Continue
          </Button>
        </div>
      )}

      {/* STEP 3 — confirm */}
      {step === "confirm" && resource && picked && (
        <div className="space-y-4">
          <div
            className="rounded-3xl p-5 text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
          >
            <div className="text-[10px] font-black uppercase tracking-widest opacity-85">{resource.name}</div>
            <div className="text-2xl font-extrabold mt-1">{dayLabel(new Date(picked.slot_start))}</div>
            <div className="text-sm font-semibold opacity-95 mt-0.5 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeLabel(picked.slot_start)} – {timeLabel(picked.slot_end)}</span>
              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {durationLabel(duration)}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-white border p-4 space-y-4">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Party size</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <button type="button" onClick={() => setParty(p => Math.max(1, p - 1))} className="h-11 w-11 rounded-full border bg-white text-xl font-bold">−</button>
                <div className="flex-1 text-center">
                  <div className="text-2xl font-extrabold tabular-nums">{party}</div>
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">up to {resource.max_party}</div>
                </div>
                <button type="button" onClick={() => setParty(p => Math.min(resource.max_party, p + 1))} className="h-11 w-11 rounded-full border bg-white text-xl font-bold">+</button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Anything we should know?</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Birthday, left-handed bats, wheelchair access…" maxLength={200} className="mt-1.5" />
            </div>
          </div>

          <div className="rounded-2xl border bg-amber-50 border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2">
            <Ticket className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{pay.describe(resource)}. {business.name} will confirm your request.</span>
          </div>

          {err && <p className="text-sm text-rose-600">{err}</p>}

          <Button onClick={book} disabled={submitting} className="w-full h-12 text-base font-bold text-white" style={{ background: primary }}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Holding your spot…</> : <>Book it <Check className="h-4 w-4 ml-1.5" /></>}
          </Button>
        </div>
      )}

      {/* STEP 4 — done */}
      {step === "done" && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border shadow-sm p-6 text-center">
            <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center text-white" style={{ background: primary }}>
              <Check className="h-8 w-8" />
            </div>
            <div className="text-lg font-extrabold mt-3">Request sent</div>
            <p className="text-sm text-zinc-600 mt-1">
              {business.name} will confirm shortly — you&apos;ll see it flip to <b>Confirmed</b> below.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => { setStep("resource"); setPicked(null); setNotes(""); setDoneId(null); if (resources.length > 1) setResource(null); }}
            >
              Book another
            </Button>
          </div>
          <MyBookingsList upcoming={upcoming} past={past} primary={primary} onCancel={cancel} highlightId={doneId} />
        </div>
      )}
    </div>
  );
}

function MyBookingsList({
  upcoming, past, primary, onCancel, highlightId,
}: { upcoming: MyBooking[]; past: MyBooking[]; primary: string; onCancel: (id: string) => void; highlightId?: string | null }) {
  if (upcoming.length === 0 && past.length === 0) return null;
  const Row = ({ m, canCancel }: { m: MyBooking; canCancel: boolean }) => {
    const s = STATUS_STYLE[m.status];
    return (
      <div className={cn("px-4 py-3 flex items-center gap-3", highlightId === m.id && "bg-emerald-50/60")}>
        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${primary}14` }}>
          {m.emoji ?? "📅"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{m.resource_name}</div>
          <div className="text-[11px] text-zinc-500">
            {dayLabel(new Date(m.scheduled_at))} · {timeLabel(m.scheduled_at)} · {durationLabel(m.duration_minutes)}
            <span className="inline-flex items-center gap-0.5 ml-1.5"><Users className="h-3 w-3" />{m.party_size}</span>
          </div>
        </div>
        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-full shrink-0", s.cls)}>{s.label}</span>
        {canCancel && (
          <button type="button" onClick={() => onCancel(m.id)} className="text-zinc-400 hover:text-rose-600 shrink-0" aria-label="Cancel booking">
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };
  return (
    <div className="mt-6">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Your bookings</h3>
      <div className="rounded-2xl bg-white border overflow-hidden divide-y">
        {upcoming.map(m => <Row key={m.id} m={m} canCancel />)}
        {past.slice(0, 5).map(m => <Row key={m.id} m={m} canCancel={false} />)}
      </div>
    </div>
  );
}
