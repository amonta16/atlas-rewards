"use client";
/**
 * components/home/demo-booker.tsx — CP-206 · "Book a demo" for any local business.
 *
 * The main site (atlas-engine.app, where the business cards point) books straight
 * onto Andrew's Google Calendar, Calendly style: pick a time, then four fields, done.
 * Times: GET /api/landing/availability (the visitor's timezone). Booking: POST
 * /api/landing/demo-request with path "/" (no med spa gate). That route re-checks the
 * slot, creates the calendar event and emails both sides; the browser fires Meta
 * "Schedule" via track("demo_requested", { slot }).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Globe, Loader2, Smartphone, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CALL_MINUTES, COMMON_TZS, HOST_TZ, tzLabel } from "@/lib/landing/availability";
import { track } from "@/lib/landing/analytics";

export const BUSINESS_TYPES = [
  "Coffee shop or bakery", "Donut or dessert shop", "Restaurant", "Smoke or vape shop", "Retail store",
  "Salon or barbershop", "Med spa", "Entertainment venue", "Gym or studio", "Something else",
] as const;

const BLUE = "var(--s-ocean)";
type Step = "time" | "details" | "done";

function metaIds() {
  const c = (k: string) => document.cookie.split("; ").find((x) => x.startsWith(`${k}=`))?.split("=")[1] ?? "";
  let fbc = c("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  return { fbp: c("_fbp"), fbc };
}

export function DemoBooker({ open, source, onClose }: { open: boolean; source: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>("time");
  const [slots, setSlots] = useState<Date[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tz, setTz] = useState(HOST_TZ);
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [pending, setPending] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState("");
  const [meet, setMeet] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const d = Intl.DateTimeFormat().resolvedOptions().timeZone; if (d) setTz(d); } catch { /* keep host */ } }, []);
  // Load times the first time it opens.
  useEffect(() => {
    if (!open || slots) return;
    let off = false;
    fetch("/api/landing/availability", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { slots: string[] }) => { if (!off) setSlots(j.slots.map((s) => new Date(s))); })
      .catch(() => { if (!off) { setSlots([]); setFailed(true); } });
    return () => { off = true; };
  }, [open, slots]);
  // Escape closes; lock page scroll while open; focus the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    setTimeout(() => dialog.current?.focus(), 0);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const keyFmt = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }), [tz]);
  const byDay = useMemo(() => {
    const m = new Map<string, Date[]>();
    for (const s of slots ?? []) { const k = keyFmt.format(s); (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    return m;
  }, [slots, keyFmt]);
  const firstKey = useMemo(() => Array.from(byDay.keys()).sort()[0] ?? null, [byDay]);
  useEffect(() => {
    if (!month) { const k = firstKey ?? keyFmt.format(new Date()); setMonth({ y: +k.slice(0, 4), m: +k.slice(5, 7) - 1 }); }
  }, [firstKey, keyFmt, month]);
  useEffect(() => { if (open && !day && firstKey && window.matchMedia("(min-width: 1024px)").matches) setDay(firstKey); }, [open, firstKey, day]);

  const todayKey = keyFmt.format(new Date());
  const times = day ? byDay.get(day) ?? [] : [];
  const lc = (t: string) => t.replace(" AM", "am").replace(" PM", "pm");
  const fTime = (d: Date) => lc(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d));
  const fLong = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d);
  const dayTitle = day ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "";
  const grid = useMemo(() => {
    if (!month) return [];
    const lead = (new Date(Date.UTC(month.y, month.m, 1)).getUTCDay() + 6) % 7;
    const n = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)] as Array<number | null>;
  }, [month]);
  const keyOf = (d: number) => month ? `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  const monthLabel = month ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(month.y, month.m, 1))) : "";
  const canPrev = month ? `${month.y}-${String(month.m + 1).padStart(2, "0")}` > todayKey.slice(0, 7) : false;
  const shift = (d: number) => setMonth((v) => (v ? { y: v.m + d < 0 ? v.y - 1 : v.m + d > 11 ? v.y + 1 : v.y, m: (v.m + d + 12) % 12 } : v));
  const noTimes = slots !== null && byDay.size === 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!fd.name?.trim() || !fd.business?.trim()) { setError("Please add your name and your business's name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fd.email ?? "")) { setError("Please enter a valid email."); return; }
    if ((fd.phone ?? "").replace(/\D/g, "").length < 10) { setError("Please enter a mobile number with area code."); return; }
    setSending(true); setError(null);
    try {
      const r = await fetch("/api/landing/demo-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fd, source: `home:${source}`.slice(0, 60), path: "/", timezone: tz,
          slot_start: slot?.toISOString(), preferred_time: slot ? `${fLong(slot)} ${fTime(slot)} (${tz})` : fd.preferred_time,
          ...metaIds(),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && slot) {
        setSlots((s) => (s ?? []).filter((x) => x.getTime() !== slot.getTime())); setSlot(null); setPending(null); setStep("time");
        throw new Error(j.error || "That time was just taken. Please pick another.");
      }
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      track("demo_requested", { source: `home:${source}`, industry: fd.industry ?? "", slot: slot?.toISOString() ?? "", calendar: j.calendar ?? "" });
      setFirst(fd.name.trim().split(/\s+/)[0] ?? ""); setMeet(j.meet_url ?? null); setStep("done");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setSending(false); }
  }

  if (!open) return null;
  const g = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const gcal = slot ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Atlas Engine demo with Andrew")}&dates=${g(slot)}/${g(new Date(slot.getTime() + CALL_MINUTES * 60_000))}&details=${encodeURIComponent(meet ? `Video: ${meet}` : "Andrew will send the video link.")}` : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#04122E]/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Book a demo"
        className="site relative max-h-[94dvh] w-full max-w-[1060px] overflow-y-auto rounded-t-[26px] bg-white text-[#1A1A1A] shadow-[0_40px_120px_-30px_rgba(2,20,70,.7)] outline-none sm:rounded-[26px] animate-in fade-in slide-in-from-bottom-6 duration-300 motion-reduce:animate-none">
        <button type="button" onClick={onClose} aria-label="Close" className="s-focus absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full text-[#6B6B6B] hover:bg-[#F2F5F9]"><X className="h-5 w-5" /></button>
        <div className={cn("grid", step === "time" && day && !noTimes ? "lg:grid-cols-[minmax(0,300px)_1fr_minmax(0,240px)]" : "lg:grid-cols-[minmax(0,320px)_1fr]")}>
          {/* Left: who, what, how long */}
          <aside className="border-b border-[#E3E8EF] p-6 lg:border-b-0 lg:border-r lg:p-7">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: BLUE }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-[17px] w-auto object-contain" />
              </span>
              <span className="text-[15px] font-semibold text-[#6B6B6B]">Andrew Montano</span>
            </div>
            <h2 className="mt-3 text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">Atlas Engine demo</h2>
            <ul className="mt-5 space-y-3 text-[15px] font-semibold text-[#6B6B6B]">
              <li className="flex items-center gap-3"><Clock className="h-5 w-5" aria-hidden />{CALL_MINUTES} min</li>
              <li className="flex items-start gap-3"><Video className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />Video call. Link sent when you book.</li>
              {slot && <li className="flex items-start gap-3 text-[#1A7F4B]"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{fTime(slot)}, {fLong(slot)}</li>}
              {slot && <li className="flex items-center gap-3"><Globe className="h-5 w-5" aria-hidden />{tzLabel(tz, slot)}</li>}
            </ul>
            <p className="mt-5 text-[14px] leading-relaxed text-[#4D4D4D]">Andrew shows you your business&apos;s own app, how it brings customers back, and what it costs. No pressure, and no tech skills needed.</p>
            <div className="mt-5 hidden gap-3 rounded-2xl border border-[#E3E8EF] bg-gradient-to-br from-[#F2F7FF] to-white p-4 lg:flex">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: BLUE }}><Smartphone className="h-[18px] w-[18px]" aria-hidden /></span>
              <p className="text-[13.5px] leading-snug text-[#4D4D4D]"><b className="text-[#1A1A1A]">See yours, not a template.</b> We set up a preview with your name and colors.</p>
            </div>
          </aside>

          {step === "done" ? (
            <section className="p-6 sm:p-10" aria-live="polite">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-7 w-7" strokeWidth={3} aria-hidden /></span>
              <h3 className="mt-5 text-[1.8rem] font-bold leading-tight tracking-[-0.02em]">You&apos;re booked{first ? `, ${first}` : ""}.</h3>
              <p className="mt-2 max-w-[30rem] text-[15.5px] leading-relaxed text-[#4D4D4D]">{slot ? <>See you <b className="text-[#1A1A1A]">{fLong(slot)} at {fTime(slot)}</b>. </> : "Andrew will email you to set a time. "}A confirmation is on its way to your inbox{slot ? " with the video link" : ""}.</p>
              {gcal && <a href={gcal} target="_blank" rel="noopener" className="s-btn s-btn-quiet s-focus mt-6 !h-11 text-[14px]"><CalendarPlus className="h-4 w-4" aria-hidden />Add to Google Calendar</a>}
              <p className="mt-8 text-[13.5px] text-[#6B6B6B]">Need a different time? Reply to the confirmation email, or write andrew@atlas-engine.app.</p>
            </section>
          ) : step === "details" || noTimes ? (
            <section className="p-6 lg:p-8" aria-label="Your details">
              {!noTimes && <button type="button" onClick={() => { setStep("time"); setError(null); }} className="s-focus grid h-11 w-11 place-items-center rounded-full border border-[#E3E8EF] text-[var(--s-ocean)] hover:bg-[#F2F7FF]" aria-label="Back to times"><ArrowLeft className="h-5 w-5" aria-hidden /></button>}
              <h3 className="mt-5 text-[1.25rem] font-bold">{noTimes ? "Tell us how to reach you" : "Enter your details"}</h3>
              {noTimes && <p className="mt-1 text-[14px] text-[#6B6B6B]">{failed ? "We couldn't load the calendar just now." : "No open times this week."} Leave your details and a time that works, and Andrew will send the invite.</p>}
              <form onSubmit={submit} noValidate className="mt-5 grid max-w-[34rem] gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your name"><input name="name" autoComplete="name" className={FIELD} placeholder="Jamie Rivera" /></Field>
                  <Field label="Business name"><input name="business" autoComplete="organization" className={FIELD} placeholder="Sunrise Donuts" /></Field>
                </div>
                <Field label="Type of business">
                  <span className="relative block">
                    <select name="industry" defaultValue="" className={cn(FIELD, "appearance-none pr-9")}>
                      <option value="" disabled>Choose one</option>
                      {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6B6B]" />
                  </span>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email"><input name="email" type="email" autoComplete="email" className={FIELD} placeholder="you@business.com" /></Field>
                  <Field label="Mobile"><input name="phone" type="tel" autoComplete="tel" className={FIELD} placeholder="(805) 555-0123" /></Field>
                </div>
                {noTimes && <Field label="Times that work for you"><input name="preferred_time" className={FIELD} placeholder="e.g. Tue or Wed afternoon" /></Field>}
                <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}
                <button type="submit" disabled={sending} className="s-focus mt-1 inline-flex h-12 items-center justify-center gap-2 justify-self-start rounded-full px-7 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                  {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{noTimes ? "Send" : "Schedule event"}
                </button>
                <p className="text-[12.5px] text-[#6B6B6B]">Only used to set up your demo. No spam.</p>
              </form>
            </section>
          ) : (
            <>
              <section className="p-6 lg:p-7" aria-label="Select a date">
                <h3 className="text-[1.2rem] font-bold">Select a Date &amp; Time</h3>
                {slots === null ? (
                  <p className="mt-8 flex items-center gap-2 text-sm text-[#6B6B6B]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking Andrew&apos;s calendar…</p>
                ) : (
                  <>
                    <div className="mt-5 flex items-center justify-center gap-6">
                      <button type="button" onClick={() => shift(-1)} disabled={!canPrev} className="s-focus grid h-10 w-10 place-items-center rounded-full text-[var(--s-ocean)] enabled:hover:bg-[#F2F7FF] disabled:text-[#C9CED6]" aria-label="Previous month"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
                      <span className="min-w-[10rem] text-center text-[15px] font-medium" aria-live="polite">{monthLabel}</span>
                      <button type="button" onClick={() => shift(1)} className="s-focus grid h-10 w-10 place-items-center rounded-full bg-[#F2F7FF] text-[var(--s-ocean)] hover:bg-[#E3EEFF]" aria-label="Next month"><ChevronRight className="h-5 w-5" aria-hidden /></button>
                    </div>
                    <div className="mx-auto mt-4 grid max-w-[420px] grid-cols-7 gap-y-1 text-center">
                      {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <span key={d} className="pb-2 text-[11px] font-medium tracking-wide text-[#4D4D4D]">{d}</span>)}
                      {grid.map((d, i) => {
                        if (!d) return <span key={`e${i}`} />;
                        const k = keyOf(d); const open = byDay.has(k); const on = k === day;
                        return (
                          <span key={k} className="grid place-items-center">
                            <button type="button" disabled={!open} onClick={() => { setDay(k); setPending(null); }} aria-pressed={on} aria-label={`${k}${open ? `, ${byDay.get(k)!.length} times open` : ", no times"}`}
                              className={cn("s-focus relative grid h-11 w-11 place-items-center rounded-full text-[15px] transition-colors sm:h-12 sm:w-12", on ? "font-bold text-white" : open ? "bg-[#E8F1FF] font-bold text-[var(--s-ocean)] hover:bg-[#D4E5FF]" : "text-[#B3B9C3]")}
                              style={on ? { background: BLUE } : undefined}>
                              {d}{k === todayKey && <span aria-hidden className={cn("absolute bottom-1.5 h-1 w-1 rounded-full", on ? "bg-white" : open ? "bg-[var(--s-ocean)]" : "bg-[#B3B9C3]")} />}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <div className="mx-auto mt-6 max-w-[420px]">
                      <div className="text-[14px] font-bold">Time zone</div>
                      <label className="mt-1.5 flex items-center gap-2 text-[14px] text-[#4D4D4D]">
                        <Globe className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only">Time zone</span>
                        <select value={tz} onChange={(e) => { setTz(e.target.value); setDay(null); setPending(null); setMonth(null); }} className="s-focus h-9 flex-1 rounded-lg border-0 bg-transparent pr-2 text-[14px] text-[#1A1A1A] hover:bg-[#F7F9FC]">
                          {Array.from(new Set([tz, ...COMMON_TZS])).map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
                        </select>
                      </label>
                    </div>
                  </>
                )}
              </section>
              {day && (
                <section className="border-t border-[#E3E8EF] p-6 lg:border-t-0 lg:py-7 lg:pl-0 lg:pr-7" aria-label="Select a time">
                  <h4 className="text-[15px] font-medium">{dayTitle}</h4>
                  {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
                  <div className="mt-4 grid max-h-[420px] gap-2.5 overflow-y-auto pr-1">
                    {times.map((t) => pending?.getTime() === t.getTime() ? (
                      <div key={t.toISOString()} className="grid grid-cols-2 gap-2">
                        <span className="grid h-[52px] place-items-center rounded-lg bg-[#666A73] text-[15px] font-bold text-white">{fTime(t)}</span>
                        <button type="button" onClick={() => { setSlot(t); setError(null); setStep("details"); track("interactive_demo_used", { demo: "home_booking_calendar" }); }} className="s-focus h-[52px] rounded-lg text-[15px] font-bold text-white" style={{ background: BLUE }}>Next</button>
                      </div>
                    ) : (
                      <button key={t.toISOString()} type="button" onClick={() => setPending(t)} className="s-focus h-[52px] rounded-lg border border-[var(--s-ocean)]/50 text-[15px] font-bold text-[var(--s-ocean)] transition hover:border-2 hover:border-[var(--s-ocean)]">{fTime(t)}</button>
                    ))}
                    {times.length === 0 && <p className="text-sm text-[#6B6B6B]">No times left that day.</p>}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const FIELD = "s-focus h-12 w-full rounded-xl border border-[#D9DEE6] bg-white px-3.5 text-[15px] text-[#1A1A1A] placeholder:text-[#9AA1AC] focus:border-[var(--s-ocean)]/60";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-[13.5px] font-semibold text-[#1A1A1A]">{label}</span>{children}</label>;
}
