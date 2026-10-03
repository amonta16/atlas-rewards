"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowLeft, ArrowRight, Ban, CalendarDays, Check, ChevronDown, ImagePlus, MessageSquare, Pipette,
  Smartphone, Sparkles, Ticket, TrendingUp, Users, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { dominantColorsFromFile, paletteFromColor } from "@/lib/logo-colors";
import { BRAND_SWATCHES, VENUE_TYPES, type LiveBrand, type VenueTypeId } from "@/lib/landing/live-app-data";
import { BENCHMARK, GUEST_BANDS, RETENTION, SCENARIOS, SPEND_BANDS, estimate, fmtMoney, fmtPct } from "@/lib/landing/quiz-model";
import { track } from "@/lib/landing/analytics";
import { LiveApp } from "./live-app/live-app";
import { BookingCalendar } from "./booking-calendar";

/**
 * AppQuiz — CP-181. Replaces the "make it yours + pick a time" double column
 * (too much asked at once) with a one-question-at-a-time quiz:
 *
 *   6 questions → a progress bar → "here's what your app could add" → book.
 *
 * Questions 1–3 build the visitor's app (it re-skins live in the phone beside
 * the quiz — the hook). Questions 4–6 are the three numbers the revenue
 * estimate needs (see lib/landing/quiz-model.ts — every assumption lives there).
 * Nothing is asked for contact info until the visitor chooses to book.
 */
const INDUSTRY_FOR: Record<VenueTypeId, string> = {
  arcade: "Arcade / family fun center",
  cages: "Batting cages / sports",
  bowling: "Trampoline park / bowling",
  karts: "Go-karts / mini golf",
  golf: "Other",
  trampoline: "Trampoline park / bowling",
};

const STEPS = ["type", "name", "color", "guests", "spend", "retention"] as const;
type StepId = (typeof STEPS)[number];

const TITLES: Record<StepId, { q: string; hint: string }> = {
  type: { q: "What do you run?", hint: "We'll start your app with the right bookings and rewards." },
  name: { q: "What's it called?", hint: "This goes on your app's home screen." },
  color: { q: "Pick your brand color", hint: "Or drop in your logo and we'll pull the colors from it." },
  guests: { q: "How many guests come through in a typical month?", hint: "A rough guess is perfect." },
  spend: { q: "What does the average guest spend per visit?", hint: "Roughly. Games, food, lanes, all-in." },
  retention: { q: "How do you bring guests back today?", hint: "No wrong answers. This tells us how much room there is to grow." },
};

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Eases a number up from 0 once `run` is true. Reduced-motion users get the final value. */
function useCountUp(target: number, run: boolean, ms = 1500) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) { setV(0); return; }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

export function AppQuiz({
  source, firstFieldRef, layout = "modal",
}: { source: string; firstFieldRef?: RefObject<HTMLInputElement>; layout?: "modal" | "page" }) {
  const [step, setStep] = useState(0); // 0..5 = questions, 6 = results
  const [view, setView] = useState<"quiz" | "book">("quiz");
  const [type, setType] = useState<VenueTypeId>("arcade");
  const [typeChosen, setTypeChosen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(BRAND_SWATCHES[0]);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [spendId, setSpendId] = useState<string | null>(null);
  const [retId, setRetId] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);
  const started = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo); }, [logo]);
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current); }, []);

  const done = step >= STEPS.length;
  const id: StepId | null = done ? null : STEPS[step];
  const venue = VENUE_TYPES.find((v) => v.id === type) ?? VENUE_TYPES[0];

  const brand: LiveBrand = useMemo(() => {
    const p = paletteFromColor(color);
    return { name: name.trim() || "Your Venue", logoUrl: logo, primary: p.primary, secondary: mix(p.primary, "#ffffff", 0.45), accent: p.secondary, heroUrl: venue.hero };
  }, [name, color, logo, venue.hero]);

  const guests = GUEST_BANDS.find((b) => b.id === guestId);
  const spend = SPEND_BANDS.find((b) => b.id === spendId);
  const ret = RETENTION.find((r) => r.id === retId);
  const est = useMemo(() => (guests && spend && ret ? estimate(guests.mid, spend.mid, ret.factor) : null), [guests, spend, ret]);

  // Move focus with the question so keyboard / screen-reader users follow along.
  useEffect(() => {
    if (id === "name") nameRef.current?.focus({ preventScroll: true });
    else headRef.current?.focus({ preventScroll: true });
  }, [id, done, view]);

  const touch = () => {
    if (started.current) return;
    started.current = true;
    track("quiz_started", { source });
  };

  function go(to: number) {
    if (advance.current) clearTimeout(advance.current);
    setStep(Math.max(0, to));
  }

  /** Tap an option → show it selected for a beat → next question. */
  function pick(set: () => void, stepId: StepId, label: string, nextIndex: number) {
    touch();
    set();
    track("quiz_step", { source, step: stepId, answer: label });
    if (advance.current) clearTimeout(advance.current);
    advance.current = setTimeout(() => go(nextIndex), 260);
  }

  // Fire once when the visitor lands on their results.
  useEffect(() => {
    if (done && est) {
      track("quiz_completed", { source, type, guests_mid: guests?.mid, spend_mid: spend?.mid, retention: retId ?? "", est_likely: est.likely, est_low: est.low, est_high: est.high });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  async function onLogo(f: File | undefined) {
    if (!f) return;
    touch();
    if (logo) URL.revokeObjectURL(logo);
    setLogo(URL.createObjectURL(f));
    setLogoName(f.name);
    const cols = await dominantColorsFromFile(f, 3);
    if (cols[0]) setColor(cols[0]);
  }

  const likely = useCountUp(est?.likely ?? 0, done && view === "quiz");

  const notes = est
    ? [
        `App quiz: ${venue.label}, color ${brand.primary}${logoName ? `, has logo (${logoName}) — ask them to email it` : ""}`,
        `Guests/mo ${guests?.label} · spend/visit ${spend?.label} · today: ${ret?.label}`,
        `Estimated added revenue: ${fmtMoney(est.likely)}/yr likely (${fmtMoney(est.low)}–${fmtMoney(est.high)}), about +${fmtPct(est.likelyPct)}`,
      ].join("\n")
    : undefined;

  const progress = done ? 100 : Math.round((step / STEPS.length) * 100);
  const showPhone = !done || view === "quiz";

  return (
    <div className={cn("grid gap-8 lg:items-start", layout === "modal" ? "lg:grid-cols-[minmax(0,1fr)_250px]" : "lg:grid-cols-[minmax(0,1fr)_280px]")}>
      {/* ── The quiz ─────────────────────────────────────────────── */}
      <div className="min-w-0">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1f5f8b]">
            <span>{done ? (view === "book" ? "Last step" : "Your results") : `Question ${step + 1} of ${STEPS.length}`}</span>
            <span className="tabular-nums text-slate-400">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e6f1f8]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Quiz progress">
            <div className="h-full rounded-full bg-gradient-to-r from-[#1f5f8b] to-[#38bdf8] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* One screen at a time. `key` replays the entrance animation per step. */}
        <div key={done ? `done-${view}` : id} className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none">
          {id && (
            <>
              <h3 ref={headRef} tabIndex={-1} className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-[#14213d] outline-none sm:text-[28px]">{TITLES[id].q}</h3>
              <p className="mt-2 text-[15px] text-slate-500">{TITLES[id].hint}</p>
            </>
          )}

          {/* 1 · venue type — photo tiles */}
          {id === "type" && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Venue type">
              {VENUE_TYPES.map((v) => {
                const sel = typeChosen && v.id === type;
                return (
                  <button key={v.id} type="button" role="radio" aria-checked={sel}
                    onClick={() => pick(() => { setType(v.id); setTypeChosen(true); }, "type", v.label, 1)}
                    className={cn("lp-focus group relative aspect-[4/3] overflow-hidden rounded-2xl border-2 text-left transition", sel ? "border-[#1f5f8b] ring-4 ring-[#1f5f8b]/15" : "border-transparent hover:border-[#1f5f8b]/40")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={optimizedUrl(v.hero, 480)} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-[#0b1426]/85 via-[#0b1426]/20 to-transparent" />
                    <span className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[15px] font-semibold text-white">
                      {v.label}
                      {sel && <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[#1f5f8b]"><Check className="h-3 w-3" aria-hidden /></span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 2 · name */}
          {id === "name" && (
            <form className="mt-6" onSubmit={(e) => { e.preventDefault(); touch(); track("quiz_step", { source, step: "name", answer: name.trim() ? "named" : "skipped" }); go(2); }}>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => { touch(); setName(e.target.value.slice(0, 40)); }}
                placeholder="e.g. Sunset Fun Center"
                autoComplete="organization"
                className="lp-focus h-14 w-full rounded-xl border-2 border-[#e3e9f0] bg-white px-4 text-lg text-[#14213d] placeholder:text-slate-400 focus:border-[#1f5f8b]/60"
              />
              <div className="mt-5 flex items-center gap-4">
                <button type="submit" className="lp-focus inline-flex h-12 items-center gap-2 rounded-xl bg-[#14213d] px-6 font-semibold text-white hover:bg-[#1f2f55]">
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
                {!name.trim() && <button type="button" onClick={() => go(2)} className="lp-focus text-sm text-slate-500 hover:text-[#14213d]">Skip for now</button>}
              </div>
            </form>
          )}

          {/* 3 · color / logo */}
          {id === "color" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-3">
                {BRAND_SWATCHES.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => { touch(); setColor(c); }}
                    className={cn("lp-focus h-11 w-11 rounded-full ring-offset-2 transition-transform hover:scale-110", c === color && "ring-2 ring-[#14213d]")}
                    style={{ background: c }} />
                ))}
                <label className="lp-focus relative grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-500" title="Custom color">
                  <Pipette className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Custom color</span>
                  <input type="color" value={color} onChange={(e) => { touch(); setColor(e.target.value); }} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="lp-focus inline-flex h-11 items-center gap-2 rounded-xl border border-[#e3e9f0] bg-white px-4 text-sm font-medium text-[#14213d] hover:border-[#14213d]/40">
                  <ImagePlus className="h-4 w-4 text-[#1f5f8b]" aria-hidden /> {logoName ? "Change logo" : "Drop in your logo"}
                </button>
                {logoName && (
                  <button type="button" onClick={() => { if (logo) URL.revokeObjectURL(logo); setLogo(null); setLogoName(null); }}
                    className="lp-focus inline-flex h-11 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:text-[#14213d]">
                    <X className="h-3.5 w-3.5" aria-hidden /> Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Your logo stays in your browser. We only pull the colors.</p>
              <button type="button" onClick={() => { track("quiz_step", { source, step: "color", answer: logoName ? "logo" : color }); go(3); }}
                className="lp-focus mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-[#14213d] px-6 font-semibold text-white hover:bg-[#1f2f55]">
                Looks good <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}

          {/* 4–6 · option lists */}
          {id === "guests" && (
            <OptionList icon={Users} items={GUEST_BANDS} value={guestId} onPick={(b) => pick(() => setGuestId(b.id), "guests", b.label, 4)} />
          )}
          {id === "spend" && (
            <OptionList icon={Wallet} items={SPEND_BANDS} value={spendId} onPick={(b) => pick(() => setSpendId(b.id), "spend", b.label, 5)} />
          )}
          {id === "retention" && (
            <OptionList
              items={RETENTION.map((r) => ({ id: r.id, label: r.label, sub: r.sub, icon: r.id === "nothing" ? Ban : r.id === "blasts" ? MessageSquare : r.id === "punch" ? Ticket : Smartphone }))}
              value={retId}
              onPick={(r) => pick(() => setRetId(r.id), "retention", r.label, 6)}
            />
          )}

          {/* ── Results ──────────────────────────────────────────── */}
          {done && est && view === "quiz" && (
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f1f8] px-3 py-1 text-xs font-semibold text-[#1f5f8b]"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Your app is ready</p>
              <h3 ref={headRef} tabIndex={-1} className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.02em] text-[#14213d] outline-none sm:text-[28px]">
                Here&apos;s what {brand.name === "Your Venue" ? "an app like this" : `${brand.name}'s app`} could add.
              </h3>

              <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#14213d] via-[#16406b] to-[#1f5f8b] p-6 text-white shadow-lg">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Estimated new revenue, year one</div>
                <div className="mt-1 text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl" aria-label={`${fmtMoney(est.likely)} per year`}>{fmtMoney(likely)}</div>
                <div className="mt-1 text-sm text-sky-100">
                  about {fmtMoney(est.perMonth)} a month · a range of {fmtMoney(est.low)} to {fmtMoney(est.high)} · roughly <b className="text-white">+{fmtPct(est.likelyPct)}</b> on today&apos;s sales
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <Stat n={est.members.toLocaleString()} l="members in year one" />
                  <Stat n={est.extraVisits.toLocaleString()} l="extra visits a year" />
                  <Stat n={`+${fmtPct(est.likelyPct)}`} l="more revenue" />
                </div>

                <div className="mt-5 space-y-1.5" aria-hidden>
                  <Bar label="Today" pct={100} max={100 + est.highPct * 100} value={fmtMoney(est.baselineYear)} muted />
                  <Bar label="With the app" pct={100 + est.likelyPct * 100} max={100 + est.highPct * 100} value={fmtMoney(est.baselineYear + est.likely)} />
                </div>
              </div>

              <button type="button" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}
                className="lp-focus mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#1f5f8b] hover:underline">
                How we worked this out <ChevronDown className={cn("h-4 w-4 transition-transform", showMath && "rotate-180")} aria-hidden />
              </button>
              {showMath && (
                <div className="mt-2 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] p-4 text-[13px] leading-relaxed text-slate-600">
                  <p>
                    Guests who join a venue&apos;s loyalty program visit <b className="text-[#14213d]">{BENCHMARK.memberVisitsPerYear}× a year</b>, against <b className="text-[#14213d]">{BENCHMARK.nonMemberVisitsPerYear}×</b> for guests who don&apos;t ({BENCHMARK.source}). Part of that gap is simply that your most loyal guests are the ones who join, so we don&apos;t credit the app with all of it.
                  </p>
                  <p className="mt-2">
                    Likely case: <b className="text-[#14213d]">{Math.round(SCENARIOS.likely.join * 100)}%</b> of your guests join in year one, and <b className="text-[#14213d]">{Math.round(SCENARIOS.likely.causal * 100)}%</b> of the visit gap is down to the app{ret && ret.factor < 1 ? `, trimmed because you already use: ${ret.label.toLowerCase()}` : ""}. Low case uses {Math.round(SCENARIOS.low.join * 100)}% and {Math.round(SCENARIOS.low.causal * 100)}%; high uses {Math.round(SCENARIOS.high.join * 100)}% and {Math.round(SCENARIOS.high.causal * 100)}%.
                  </p>
                  <p className="mt-2">
                    Your inputs: about {guests?.mid.toLocaleString()} guests a month at about {fmtMoney(spend?.mid ?? 0)} a visit. This doesn&apos;t include membership fees or party bookings. It&apos;s a planning estimate, not a promise. We&apos;ll check it against your real numbers on the call.
                  </p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => { track("quiz_book_clicked", { source, est_likely: est.likely }); setView("book"); }}
                  className="lp-focus lp-cta-primary inline-flex h-14 items-center gap-2 rounded-xl bg-[#1f5f8b] px-7 text-base font-semibold text-white hover:bg-[#174a6e]">
                  <CalendarDays className="h-5 w-5" aria-hidden /> Book my 20-minute walkthrough
                </button>
                <button type="button" onClick={() => go(0)} className="lp-focus text-sm text-slate-500 hover:text-[#14213d]">Start over</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">We&apos;ll bring this app and these numbers to the call. No contract, no pressure.</p>
            </div>
          )}

          {done && est && view === "book" && (
            <div>
              <h3 ref={headRef} tabIndex={-1} className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-[#14213d] outline-none sm:text-[28px]">Pick a time. We&apos;ll bring your plan.</h3>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f1f8] px-3 py-1 font-medium text-[#1f5f8b]"><TrendingUp className="h-3.5 w-3.5" aria-hidden /> ~{fmtMoney(est.likely)} a year</span>
                <button type="button" onClick={() => setView("quiz")} className="lp-focus inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#14213d]"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to my results</button>
              </div>
              <div className="mt-5">
                <BookingCalendar source={source} firstFieldRef={firstFieldRef} compact={false} prefill={{ business: name.trim(), industry: INDUSTRY_FOR[type] }} extraNotes={notes} />
              </div>
            </div>
          )}
        </div>

        {/* Back */}
        {!done && step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="lp-focus mt-8 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#14213d]">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </button>
        )}
      </div>

      {/* ── Live phone ──────────────────────────────────────────── */}
      {showPhone && (
        <div className={cn("lg:sticky lg:top-6", done ? "block" : "hidden lg:block")}>
          <div className="relative mx-auto h-[522px] w-[246px]">
            <div className="absolute left-0 top-0 origin-top-left scale-[0.82]">
              <LiveApp brand={brand} categories={venue.categories} guest="Alex" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">{done ? "Your app on day one. Tap it, it works." : "Your app updates as you answer."}</p>
        </div>
      )}
    </div>
  );
}

function OptionList<T extends { id: string; label: string; sub?: string; icon?: React.ComponentType<{ className?: string }> }>({
  items, value, onPick, icon: Default,
}: { items: T[]; value: string | null; onPick: (item: T) => void; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mt-6 grid gap-2.5" role="radiogroup">
      {items.map((it) => {
        const Icon = it.icon ?? Default;
        const sel = it.id === value;
        return (
          <button key={it.id} type="button" role="radio" aria-checked={sel} onClick={() => onPick(it)}
            className={cn("lp-focus flex items-center gap-4 rounded-2xl border-2 bg-white px-4 py-3.5 text-left transition", sel ? "border-[#1f5f8b] bg-[#f2f8fc] ring-4 ring-[#1f5f8b]/10" : "border-[#e3e9f0] hover:border-[#1f5f8b]/40 hover:bg-[#f9fbfd]")}>
            {Icon && <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", sel ? "bg-[#1f5f8b] text-white" : "bg-[#e6f1f8] text-[#1f5f8b]")}><Icon className="h-5 w-5" aria-hidden /></span>}
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-[#14213d]">{it.label}</span>
              {it.sub && <span className="block text-[13px] text-slate-500">{it.sub}</span>}
            </span>
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", sel ? "border-[#1f5f8b] bg-[#1f5f8b] text-white" : "border-slate-300")}>{sel && <Check className="h-3.5 w-3.5" aria-hidden />}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-2 py-3 backdrop-blur-sm">
      <div className="text-xl font-semibold tabular-nums sm:text-2xl">{n}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-sky-100">{l}</div>
    </div>
  );
}

function Bar({ label, pct, max, value, muted }: { label: string; pct: number; max: number; value: string; muted?: boolean }) {
  const w = Math.max(8, Math.min(100, (pct / max) * 100));
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-24 shrink-0 text-sky-100">{label}</span>
      <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
        <span className={cn("block h-full rounded-full", muted ? "bg-white/40" : "bg-gradient-to-r from-sky-300 to-white")} style={{ width: `${w}%` }} />
      </span>
      <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}
