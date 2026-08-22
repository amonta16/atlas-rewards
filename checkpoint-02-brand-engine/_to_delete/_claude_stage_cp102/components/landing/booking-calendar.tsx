"use client";
import { useEffect, useMemo, useState, type FormEvent, type RefObject } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { CONTACT_EMAIL } from "@/lib/landing/config";
import { COMMON_TZS, HOST_TZ, dayKey, getAvailableSlots, isDayAvailable, tzLabel, type Slot } from "@/lib/landing/availability";

/**
 * Interactive booking calendar — CP-101.
 *   1. pick a date (month grid, unavailable days disabled)
 *   2. pick a time (slots shown in the visitor's timezone, switchable)
 *   3. contact details → POST /api/landing/demo-request with slot_start + timezone
 *   4. confirmation
 * Availability comes from lib/landing/availability.ts (mock today; swap for
 * Calendly / Google Calendar there without touching this component).
 */
const INDUSTRIES = ["Restaurant / café", "Gym / fitness", "Salon / barber", "Med spa / wellness", "Retail", "Other"];
const field =
  "lp-focus h-11 w-full rounded-lg border border-[#e8dfd1] bg-white px-3.5 text-[15px] text-[#14213d] placeholder:text-slate-400 focus:border-[#1f5f8b]/60";

type Step = "date" | "time" | "details" | "done";

export function BookingCalendar({ source, firstFieldRef, compact = false }: { source: string; firstFieldRef?: RefObject<HTMLInputElement>; compact?: boolean }) {
  const now = useMemo(() => new Date(), []);
  const [step, setStep] = useState<Step>("date");
  const [view, setView] = useState(() => {
    const k = dayKey(now);
    return { y: +k.slice(0, 4), m: +k.slice(5, 7) - 1 };
  });
  const [day, setDay] = useState<{ y: number; m: number; d: number } | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tz, setTz] = useState(HOST_TZ);
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTz(detected);
    } catch {}
  }, []);

  const tzOptions = useMemo(() => Array.from(new Set([tz, ...COMMON_TZS])), [tz]);
  const slots = useMemo(() => (day ? getAvailableSlots(day.y, day.m, day.d, now) : []), [day, now]);

  const fmtTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(view.y, view.m, 1));

  // Month grid
  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayKey = dayKey(now);
  const canPrev = new Date(view.y, view.m, 1) > new Date(+todayKey.slice(0, 4), +todayKey.slice(5, 7) - 1, 1);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot) return;
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    if (body.website) return;
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/landing/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, source, path: window.location.pathname, slot_start: slot.startsAt.toISOString(), timezone: tz, preferred_time: `${fmtDate(slot.startsAt)} ${fmtTime(slot.startsAt)} (${tz})` }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setStep("done");
      setState("idle");
      track("demo_requested", { source, industry: String(body.industry ?? ""), slot: slot.startsAt.toISOString() });
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  /* ── Confirmation ─────────────────────────────────────────────── */
  if (step === "done" && slot) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h3 className="mt-3 text-xl font-semibold text-[#14213d]">You&apos;re booked</h3>
        <p className="mt-2 text-[15px] text-slate-700">
          <b className="text-[#14213d]">{fmtDate(slot.startsAt)}</b> at <b className="text-[#14213d]">{fmtTime(slot.startsAt)}</b>
          <span className="text-slate-500"> · {tzLabel(tz, slot.startsAt)}</span>
        </p>
        <p className="mt-3 text-sm text-slate-600">
          We&apos;ll send a confirmation and a video link to your email. Need to change it? Reply to that email or write{" "}
          <a className="text-[#1f5f8b] underline-offset-2 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p className="mt-4 lp-placeholder inline-block rounded px-2 py-1 font-mono text-[10px] text-slate-500">[ CONNECT CALENDAR PROVIDER — mock availability ]</p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-5", !compact && "md:grid-cols-[1fr_1.1fr]")}>
      {/* Summary rail */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[#e8dfd1] bg-[#fbf8f2] p-3 md:block md:p-5">
        <StepRow icon={CalendarDays} label="Date" value={day ? fmtDate(slot?.startsAt ?? new Date(day.y, day.m, day.d, 12)) : "Choose a day"} active={step === "date"} onClick={() => setStep("date")} />
        <StepRow icon={Clock} label="Time" value={slot ? `${fmtTime(slot.startsAt)} · 20 min` : "Choose a time"} active={step === "time"} onClick={() => day && setStep("time")} disabled={!day} />
        <div className="col-span-2 mt-1 border-t border-[#e8dfd1] pt-3 md:mt-3">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <Globe className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Timezone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)} className="lp-light lp-focus h-8 flex-1 rounded-md border border-[#e8dfd1] bg-white px-2 text-xs text-slate-700">
              {tzOptions.map((z) => (
                <option key={z} value={z}>{tzLabel(z)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="col-span-2 mt-2 hidden text-[11px] text-slate-500 md:block">Calls happen on video. We&apos;re on Pacific time; times above are shown in your timezone.</p>
      </div>

      {/* Step panel */}
      <div>
        {step === "date" && (
          <div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} disabled={!canPrev} className="lp-light lp-focus grid h-9 w-9 place-items-center rounded-lg border border-[#e8dfd1] bg-white text-slate-600 disabled:opacity-30" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-sm font-semibold text-[#14213d]" aria-live="polite">{monthLabel}</div>
              <button type="button" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} className="lp-light lp-focus grid h-9 w-9 place-items-center rounded-lg border border-[#e8dfd1] bg-white text-slate-600" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wider text-slate-400" aria-hidden>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Choose a date">
              {cells.map((d, i) => {
                if (!d) return <span key={`e${i}`} />;
                const ok = isDayAvailable(view.y, view.m, d, now);
                const selected = day && day.y === view.y && day.m === view.m && day.d === d;
                const isToday = dayKey(new Date(view.y, view.m, d, 12)) === todayKey;
                return (
                  <button
                    key={d}
                    type="button"
                    role="gridcell"
                    aria-selected={!!selected}
                    disabled={!ok}
                    onClick={() => { setDay({ y: view.y, m: view.m, d }); setSlot(null); setStep("time"); track("interactive_demo_used", { demo: "booking_calendar" }); }}
                    className={cn(
                      "lp-focus grid aspect-square place-items-center rounded-lg text-sm font-medium transition-colors",
                      ok ? "bg-[#e6f1f8] text-[#1f5f8b] hover:bg-[#1f5f8b] hover:text-white" : "text-slate-300",
                      selected && "bg-[#1f5f8b] text-white",
                      isToday && !selected && "ring-1 ring-[#38bdf8]",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Highlighted days have open slots. Weekdays only.</p>
          </div>
        )}

        {step === "time" && day && (
          <div>
            <button type="button" onClick={() => setStep("date")} className="lp-focus inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#14213d]">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Change date
            </button>
            <div className="mt-2 text-sm font-semibold text-[#14213d]">{fmtDate(slots[0]?.startsAt ?? new Date(day.y, day.m, day.d, 12))}</div>
            <div className="mt-3 grid max-h-[300px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" role="listbox" aria-label="Choose a time">
              {slots.map((s) => {
                const sel = slot?.startsAt.getTime() === s.startsAt.getTime();
                return (
                  <button
                    key={s.startsAt.toISOString()}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => { setSlot(s); setStep("details"); }}
                    className={cn("lp-focus h-11 rounded-lg border text-sm font-medium transition-colors", sel ? "border-[#1f5f8b] bg-[#1f5f8b] text-white" : "border-[#e8dfd1] bg-white text-[#14213d] hover:border-[#1f5f8b]/60 hover:bg-[#e6f1f8]")}
                  >
                    {fmtTime(s.startsAt)}
                  </button>
                );
              })}
              {slots.length === 0 && <p className="col-span-full text-sm text-slate-500">No open times that day — try another date.</p>}
            </div>
          </div>
        )}

        {step === "details" && slot && (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep("time")} className="lp-focus col-span-full inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#14213d]">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Change time
            </button>
            <label className="grid gap-1.5 text-sm"><span className="text-slate-700">Your name</span><input ref={firstFieldRef} name="name" required autoComplete="name" className={field} placeholder="Maria Lopez" /></label>
            <label className="grid gap-1.5 text-sm"><span className="text-slate-700">Business name</span><input name="business" required autoComplete="organization" className={field} placeholder="Casa Verde" /></label>
            <label className="grid gap-1.5 text-sm"><span className="text-slate-700">Email</span><input name="email" type="email" required autoComplete="email" className={field} placeholder="you@business.com" /></label>
            <label className="grid gap-1.5 text-sm"><span className="text-slate-700">Phone</span><input name="phone" type="tel" required autoComplete="tel" className={field} placeholder="(805) 555-0123" /></label>
            <label className="grid gap-1.5 text-sm sm:col-span-2"><span className="text-slate-700">Industry</span>
              <select name="industry" className={cn(field, "appearance-none")} defaultValue="">
                <option value="" disabled>Choose one</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm sm:col-span-2"><span className="text-slate-700">Anything we should know? <span className="text-slate-400">(optional)</span></span><textarea name="notes" rows={2} className={cn(field, "h-auto py-2.5")} placeholder="e.g. two locations, already on Square" /></label>
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
            {error && <p role="alert" className="col-span-full text-sm text-rose-600">{error}</p>}
            <div className="col-span-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">20-minute video call · no contract, no pressure.</p>
              <button type="submit" disabled={state === "sending"} className="lp-focus lp-cta-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#1f5f8b] px-6 font-semibold text-white hover:bg-[#174a6e] disabled:opacity-60">
                {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Confirm {fmtTime(slot.startsAt)}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function StepRow({ icon: I, label, value, active, onClick, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("lp-focus flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50", active ? "bg-white shadow-sm ring-1 ring-[#e8dfd1]" : "hover:bg-white/60")}>
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg", active ? "bg-[#1f5f8b] text-white" : "bg-[#e6f1f8] text-[#1f5f8b]")}>
        <I className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="block truncate text-sm font-medium text-[#14213d]">{value}</span>
      </span>
    </button>
  );
}
