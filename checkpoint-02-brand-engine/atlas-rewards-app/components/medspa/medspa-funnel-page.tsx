"use client";
/**
 * components/medspa/medspa-funnel-page.tsx — CP-201 · /medspa, the Meta ads landing page.
 *
 * Same look as atlas-engine.app (white glass & ocean blue, Manrope, the .site
 * tokens in app/site.css, GSAP scroll moments), built for cold ad traffic:
 * no site nav to wander off through, one action everywhere ("See your
 * practice's app"), and every CTA opens the funnel (components/medspa/medspa-funnel.tsx):
 *
 *   build your app → your numbers → estimate → qualify (the gate) → pick a time
 *   → pre-call page → reminders → walkthrough → Andrew marks Paid → Meta Purchase
 *
 * Claims (Atlas Messaging Library): no invented results or reviews; the
 * Flippo's clips are labeled as an arcade; the estimate is labeled a planning
 * estimate; price is quoted on the call unless PRICE_BEFORE_CALL is set.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Clock, MapPin, Play, Plus, ShieldCheck, Sparkles, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import { fmtMoney } from "@/lib/landing/quiz-model";
import { REBOOK, SCENARIOS, estimateMedspa } from "@/lib/landing/medspa-quiz-model";
import { MEDSPA_FAQ, MEDSPA_OFFER_COPY, MEDSPA_STACK } from "@/lib/landing/medspa-offer";
import { Compare, ReviewsBand } from "@/components/site/site-page";
import { DeskListMock } from "@/components/site/site-mocks";
import { useSiteMotion } from "@/components/site/motion";
// CP-202: buttons go to the funnel page; hero A/B; video placeholder; offer block
// CP-204: no app preview anywhere; the hook is "is your area still open?"; the offer = area lock + founding spots + guarantees
import { FOUNDING, GUARANTEES, LANDING_VSL, TERRITORY } from "@/lib/landing/medspa-funnel";
import { withQuery } from "@/lib/landing/ab";


export function MedspaFunnelPage() {
  // Every button goes to the funnel page (area check first), carrying UTMs/fbclid.
  const start = (where: string) => {
    track("hero_cta_clicked", { source: `medspa_${where}`, variant: "landing" });
    window.location.assign(withQuery("/medspa/start", { from: "landing", at: where }));
  };
  const rootRef = useRef<HTMLDivElement>(null);
  useSiteMotion(rootRef);
  useEffect(() => {
    // The "your times are still open" email used to link here; send those straight to the calendar.
    const lead = new URLSearchParams(window.location.search).get("lead");
    if (lead) window.location.replace(`/medspa/start?lead=${encodeURIComponent(lead)}`);
  }, []);
  return (
    <div ref={rootRef} className="site overflow-x-clip">
      <Header onStart={() => start("header")} onDark />
      <main id="main">
        <HeroVideo onStart={() => start("hero")} />
        <Assurances />
        <Leak />
        <WhatAtlasRuns />
        <Calculator onStart={() => start("calculator")} />
        <DeskBand />
        <HowItWorks onStart={() => start("steps")} />
        <Offer onStart={() => start("offer")} />
        <Included onStart={() => start("included")} />
        <Compare />
        <ReviewsBand />
        <Faq />
        <Closing onStart={() => start("closing")} />
      </main>
      <Footer />
      <MobileBar onStart={() => start("sticky_bar")} />
    </div>
  );
}

/* ───────────── header: logo + one button, nothing to wander off to ───────────── */
function Header({ onStart, onDark = false }: { onStart: () => void; onDark?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 10); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition-[background,box-shadow] duration-300", scrolled ? "bg-white/85 shadow-[0_1px_0_var(--s-line)] backdrop-blur-xl" : "bg-transparent")}>
      <div className="s-wrap flex h-[68px] items-center justify-between gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={onDark && !scrolled ? "/atlas-engine-logo.png" : "/landing/atlas-engine-logo-navy.png"} alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        <button type="button" onClick={onStart} className={cn("s-btn s-focus !h-11 !px-5 text-[15px]", scrolled ? "s-btn-primary" : onDark ? "s-btn-light" : "s-btn-quiet")}>Check your area</button>
      </div>
    </header>
  );
}

/* ───────────── hero: the founder video on the brand ocean (CP-202; the phone hero was removed in CP-204) ───────────── */
function HeroVideo({ onStart }: { onStart: () => void }) {
  return (
    <section className="s-ocean relative -mt-[68px] overflow-hidden pb-20 pt-[104px] sm:pt-[124px] lg:pb-24" aria-labelledby="hero-title">
      <div className="s-ocean-img" aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent to-[#06318F]/45" />
      <div className="s-wrap relative text-center">
        <p className="s-load-1 mx-auto inline-flex items-center gap-2.5 rounded-full bg-white/12 py-1.5 pl-2 pr-4 text-[14px] font-semibold text-white ring-1 ring-white/30 backdrop-blur">
          <span className="relative h-2 w-2 rounded-full bg-white s-ping" aria-hidden />For med spas and aesthetic practices
        </p>
        <h1 id="hero-title" className="s-display s-load-1 mx-auto mt-6 max-w-[14ch] text-white">Every patient has a due date.</h1>
        <p className="s-lead s-load-2 mx-auto mt-5 max-w-[36rem]">Your own patient app that brings each patient back before her treatment wears off, and memberships that bill every month. Watch how it works.</p>
        <div className="s-load-3 mx-auto mt-10 max-w-[900px]"><VideoFrame onStart={onStart} /></div>
        <div className="s-load-4 mt-9 flex flex-col items-center gap-3">
          <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus"><MapPin className="h-4 w-4" aria-hidden />Check if your area is open</button>
          <p className="text-[14px] text-white/80">We work with one med spa per area. Takes 10 seconds.</p>
        </div>
      </div>
    </section>
  );
}

/** The video, or a branded placeholder until LANDING_VSL.embed is set. The player loads only after a tap. */
function VideoFrame({ onStart }: { onStart: () => void }) {
  const [state, setState] = useState<"idle" | "playing" | "soon">("idle");
  const src = LANDING_VSL.embed ? `${LANDING_VSL.embed}${LANDING_VSL.embed.includes("?") ? "&" : "?"}autoplay=1&playsinline=1` : null;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[26px] bg-[#06318F] shadow-[0_40px_90px_-30px_rgba(2,20,70,.8)] ring-1 ring-white/25">
      {state === "playing" && src ? (
        <iframe src={src} title={LANDING_VSL.label} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
      ) : (
        <>
          <div aria-hidden className="absolute inset-0 bg-[url('/landing/blue-lines.jpg')] bg-cover bg-center" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#041F5C]/70 via-transparent to-transparent" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/atlas-engine-logo.png" alt="" aria-hidden width={1315} height={494} className="absolute left-6 top-6 h-6 w-auto opacity-90" />
          {state === "soon" ? (
            <div className="absolute inset-0 grid place-items-center p-6" role="status">
              <div className="max-w-[26rem] rounded-3xl bg-white/95 p-6 text-center text-[var(--s-ink)] shadow-2xl">
                <div className="text-[1.15rem] font-bold">The video is on its way.</div>
                <p className="mt-2 text-[15px] text-[var(--s-ink-2)]">In the meantime, check whether your area is still open. We work with one med spa per area.</p>
                <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus mt-5 !h-12">Check if your area is open <ArrowRight className="h-4 w-4" aria-hidden /></button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setState(src ? "playing" : "soon"); track("vsl_played", { source: "medspa_hero", placeholder: !src }); }}
              className="s-focus absolute inset-0 grid place-items-center" aria-label={src ? `Play: ${LANDING_VSL.label}` : "Video coming soon"}>
              <span className="relative grid h-20 w-20 place-items-center rounded-full bg-white text-[var(--s-ocean)] shadow-[0_20px_50px_-10px_rgba(0,0,0,.5)] transition-transform hover:scale-105 sm:h-24 sm:w-24">
                <span aria-hidden className="absolute inset-0 rounded-full bg-white/40 s-ping" />
                <Play className="relative ml-1 h-8 w-8 fill-current sm:h-10 sm:w-10" aria-hidden />
              </span>
            </button>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-left text-white sm:p-6">
            <div><div className="text-[15px] font-bold sm:text-[17px]">{LANDING_VSL.label}</div><div className="text-[13px] text-white/75">{src ? `${LANDING_VSL.minutes} min · sound on` : "Video coming soon"}</div></div>
            <span className="hidden rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold ring-1 ring-white/25 backdrop-blur sm:inline">{LANDING_VSL.minutes}:00</span>
          </div>
        </>
      )}
    </div>
  );
}

function Assurances() {
  const items = [["One med spa per area", "We never help your competitor"], ["Pays for itself", "Or you stop paying until it does"], ["Live in 7 days", "Or setup and month one are free"], ["Month to month", "Leave any month, keep everything"]];
  return (
    <div className="border-y border-[var(--s-line)] bg-white/70">
      <ul data-gs="stagger" className="s-wrap grid grid-cols-2 gap-x-6 gap-y-5 py-7 md:grid-cols-4">
        {items.map(([t, d]) => (
          <li key={t} data-gs-item className="flex items-start gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--s-ice)] text-[var(--s-ocean)]"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /></span>
            <span><span className="block text-[15px] font-bold">{t}</span><span className="block text-[13px] text-[var(--s-ink-3)]">{d}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── the leak: one patient, one year ───────────── */
const WEEKS = 52;
const WITHOUT = [{ w: 0, kind: "visit" }, { w: 17, kind: "visit" }, { w: 34, kind: "missed" }, { w: 48, kind: "missed" }] as const;
const WITH = [{ w: 0, kind: "visit" }, { w: 12, kind: "visit" }, { w: 25, kind: "visit" }, { w: 37, kind: "visit" }, { w: 50, kind: "visit" }] as const;
const PINGS = [10, 23, 35, 48];

function Leak() {
  const fig = useInView<HTMLElement>({ threshold: 0.35 });
  return (
    <section className="s-section" aria-labelledby="leak-title">
      <div className="s-wrap">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
          <h2 id="leak-title" className="s-h2 max-w-[14ch]">The leak nobody sees on the schedule.</h2>
          <div className="s-body max-w-[36rem] space-y-4 text-[1.06rem]">
            <p>Neurotoxin lasts about three to four months. If nobody reaches out around week ten, a patient who loved her results often just doesn&apos;t rebook, or books with whoever had a promo that week.</p>
            <p>It never shows up as a cancellation. It shows up as a quieter month you can&apos;t quite explain.</p>
          </div>
        </div>
        <figure ref={fig.ref} className={cn("s-panel mt-14 p-6 sm:p-12", fig.inView && "s-in")}>
          <figcaption className="flex flex-wrap items-baseline justify-between gap-3"><span className="text-[1.05rem] font-bold">One patient, one year</span><span className="s-small">Illustration of a typical neurotoxin schedule</span></figcaption>
          <div className="mt-12 space-y-14">
            <Track label="On her own" note="2 visits" items={WITHOUT} delay={0} on={fig.inView} />
            <Track label="With Atlas reminders" note="5 visits" items={WITH} pings={PINGS} delay={0.5} on={fig.inView} />
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--s-line)] pt-6 text-[14px] text-[var(--s-ink-2)] sm:flex sm:flex-wrap sm:gap-8">
            <span className="flex items-center gap-2.5"><span className="h-3.5 w-3.5 rounded-full bg-[var(--s-ocean)]" />Treatment</span>
            <span className="flex items-center gap-2.5"><span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-[#E08A3C]" />Due, never booked</span>
            <span className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rotate-45 bg-[var(--s-sky)]" />Atlas reminder</span>
          </div>
        </figure>
      </div>
    </section>
  );
}

function Track({ label, note, items, pings = [], delay, on }: { label: string; note: string; items: ReadonlyArray<{ w: number; kind: "visit" | "missed" }>; pings?: number[]; delay: number; on: boolean }) {
  const x = (w: number) => `${(w / WEEKS) * 100}%`;
  const at = (w: number) => `${(delay + 0.15 + (w / WEEKS) * 1.3).toFixed(2)}s`;
  const fade = (w: number): React.CSSProperties => ({ left: x(w), transitionDelay: at(w), opacity: on ? 1 : 0, transform: `translate(-50%,-50%) scale(${on ? 1 : 0.4})`, transition: "opacity .4s ease, transform .4s cubic-bezier(.2,.8,.2,1.4)" });
  return (
    <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-6">
      <div className="flex items-baseline justify-between sm:block"><div className="font-bold">{label}</div><div className="s-small">{note}</div></div>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--s-ice)]" />
        <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--s-ocean)]/30" style={{ width: on ? "100%" : "0%", transition: `width 1.4s cubic-bezier(.4,0,.2,1) ${delay}s` }} />
        {pings.map((w) => <span key={`p${w}`} aria-hidden className="absolute top-1/2 h-2.5 w-2.5 bg-[var(--s-sky)]" style={{ ...fade(w), transform: `translate(-50%,-50%) rotate(45deg) scale(${on ? 1 : 0.4})` }} />)}
        {items.map((it) => (
          <span key={it.w} className={cn("absolute top-1/2 h-5 w-5 rounded-full", it.kind === "visit" ? "bg-[var(--s-ocean)] ring-4 ring-white" : "border-2 border-dashed border-[#E08A3C] bg-white")} style={fade(it.w)}
            aria-label={it.kind === "visit" ? `Treatment, week ${it.w}` : `Due at week ${it.w}, never booked`} />
        ))}
      </div>
    </div>
  );
}

/* ───────────── what atlas runs (CP-204: the demo phone is gone; four plain cards) ───────────── */
const PARTS = [
  { id: "app", t: "Your own patient app", d: "Your name, logo and colors on every patient's phone. They open it from a QR code at checkout: points, rewards, offers and their membership in one place. No marketplace, no other practices next to yours." },
  { id: "recall", t: "Reminders before it wears off", d: "Each treatment carries its own cycle. Her app shows when she's due, and the front desk gets the list of who to reach this week. You approve the wording once; we set up the timing with you." },
  { id: "members", t: "Memberships that bill monthly", d: "Sell a monthly membership right in the app. Dues go straight to your own Stripe account and renew automatically, so your month starts with revenue already in." },
];
function WhatAtlasRuns() {
  const [open, setOpen] = useState("recall");
  return (
    <section id="product" className="s-section scroll-mt-16 bg-[var(--s-paper)]" aria-labelledby="runs-title">
      <div className="s-wrap grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-24">
        <div>
          <h2 id="runs-title" className="s-h2 max-w-[15ch]">Three things Atlas runs, so your front desk doesn&apos;t have to.</h2>
          <div className="mt-12 divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
            {PARTS.map((p) => {
              const on = p.id === open;
              return (
                <div key={p.id} className="relative">
                  <span aria-hidden className={cn("absolute -left-5 top-0 h-full w-[3px] origin-top rounded-full bg-[var(--s-ocean)] transition-transform duration-500", on ? "scale-y-100" : "scale-y-0")} />
                  <button type="button" aria-expanded={on} onClick={() => { setOpen(p.id); track("demo_clicked", { source: "medspa_parts", kind: p.id }); }} className="s-focus group flex w-full items-center justify-between gap-6 py-6 text-left">
                    <span className={cn("text-[1.45rem] font-bold leading-tight tracking-[-0.02em] transition-colors sm:text-[1.7rem]", on ? "text-[var(--s-ink)]" : "text-[var(--s-ink-3)] group-hover:text-[var(--s-ink-2)]")}>{p.t}</span>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full transition duration-300", on ? "bg-[var(--s-ocean)] text-white" : "bg-[var(--s-ice)] text-[var(--s-ocean)]")}><Plus className={cn("h-4 w-4 transition-transform duration-300", on && "rotate-45")} aria-hidden /></span>
                  </button>
                  <div className={cn("grid transition-[grid-template-rows,opacity] duration-500", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                    <p className="s-body max-w-[38rem] overflow-hidden text-[1.05rem]" style={{ paddingBottom: on ? "1.75rem" : 0 }}>{p.d}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[420px]">
          <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.22),transparent)]" />
          <ul data-gs="stagger" className="relative grid gap-3">
            {[["Due-date reminders", "Every treatment carries its own cycle"], ["Memberships", "Billed to your own Stripe every month"], ["Rewards", "Points for visits, reviews and referrals"], ["Front-desk list", "Who's due, who's overdue, who booked"]].map(([t, d]) => (
              <li key={t} data-gs-item className="s-glass flex items-center gap-4 !rounded-2xl p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--s-ocean)] text-white"><Check className="h-5 w-5" strokeWidth={3} aria-hidden /></span>
                <span><span className="block font-bold">{t}</span><span className="block text-[14px] text-[var(--s-ink-3)]">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────── calculator (ocean band) ───────────── */
const CHOICES = REBOOK.filter((r) => r.id !== "unknown");
function Calculator({ onStart }: { onStart: () => void }) {
  const [visits, setVisits] = useState(200);
  const [value, setValue] = useState(400);
  const [rebook, setRebook] = useState(CHOICES[1].id);
  const touched = useRef(false);
  const lapse = CHOICES.find((c) => c.id === rebook)?.lapse ?? 0.5;
  const est = useMemo(() => estimateMedspa(visits, value, lapse, 1), [visits, value, lapse]);
  const touch = () => { if (!touched.current) { touched.current = true; track("interactive_demo_used", { demo: "medspa_calculator" }); } };
  return (
    <section className="s-ocean relative overflow-hidden" aria-labelledby="calc-title">
      <div className="s-ocean-img opacity-70" aria-hidden />
      <div className="s-wrap relative py-24 lg:py-32">
        <div className="max-w-2xl">
          <h2 id="calc-title" className="s-h2">Put your own numbers on it.</h2>
          <p className="s-lead mt-5">Three answers and you&apos;ll see roughly what slips through your schedule each year, and what reminders could bring back.</p>
        </div>
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div className="space-y-9">
            <Slider label="Patient visits in a typical month" value={visits} min={50} max={1000} step={25} display={visits.toLocaleString()} onChange={(v) => { touch(); setVisits(v); }} />
            <Slider label="What a typical visit is worth" value={value} min={100} max={1200} step={25} display={fmtMoney(value)} onChange={(v) => { touch(); setValue(v); }} />
            <fieldset>
              <legend className="text-[15px] text-white/85">Of patients due for their next treatment, how many book on time?</legend>
              <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup">
                {CHOICES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={c.id === rebook} onClick={() => { touch(); setRebook(c.id); }}
                    className={cn("s-focus rounded-2xl px-3 py-3 text-left text-[14px] font-semibold leading-tight transition-colors", c.id === rebook ? "bg-white text-[var(--s-ocean-deep)]" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20")}>
                    {c.label.replace(" (80%+)", "")}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="s-glass flex flex-col justify-between !bg-white/12 p-7 !ring-0 sm:p-9" style={{ borderColor: "rgba(255,255,255,.3)" }}>
            <div>
              <p className="text-[15px] text-white/85">What reminders could win back in a year</p>
              <p className="mt-2 text-[clamp(3.2rem,2rem+4vw,5rem)] font-extrabold leading-none tracking-tight text-white tabular-nums" aria-live="polite">{fmtMoney(est.likely)}</p>
              <p className="mt-3 text-[15px] text-white/85">About {fmtMoney(est.perMonth)} a month, from roughly {est.recovered.toLocaleString()} of the {est.lapsedVisits.toLocaleString()} due visits that slip each year. Range {fmtMoney(est.low)} to {fmtMoney(est.high)}.</p>
            </div>
            <div className="mt-8">
              <button type="button" onClick={() => { track("hero_cta_clicked", { source: "medspa_calculator", est_likely: est.likely }); onStart(); }} className="s-btn s-btn-light s-focus w-full sm:w-auto">Check my area and full estimate <ArrowRight className="h-4 w-4" aria-hidden /></button>
              <p className="mt-4 text-[13px] leading-relaxed text-white/70">A planning estimate, not a promise: it assumes reminders win back {Math.round(SCENARIOS.likely * 100)}% of missed visits ({Math.round(SCENARIOS.low * 100)}% to {Math.round(SCENARIOS.high * 100)}% for the range). We check it against your real numbers on the call.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4"><label htmlFor={id} className="text-[15px] text-white/85">{label}</label><span className="text-[1.6rem] font-extrabold tabular-nums text-white">{display}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="s-focus mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-white [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
        style={{ background: `linear-gradient(90deg, #fff ${pct}%, rgba(255,255,255,.22) 0)` }} />
    </div>
  );
}

/* ───────────── front desk ───────────── */
function DeskBand() {
  return (
    <section className="s-section" aria-labelledby="desk-title">
      <div className="s-wrap grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <h2 id="desk-title" className="s-h2 max-w-[16ch]">Your front desk gets a list, not a dashboard.</h2>
          <p className="s-lead mt-6 max-w-[30rem]">Who is overdue, who is due within two weeks, who already booked. Open the patient, log the treatment, or text her the reminder you wrote.</p>
          <ul data-gs="stagger" className="mt-8 grid gap-4 sm:grid-cols-2">
            {[["Check-in by QR or phone number", "No app training for staff."], ["Points at the counter", "The tap that logs a treatment awards the visit."], ["On the tablet you have", "No new hardware."], ["Set up with you", "Staff trained in about 15 minutes."]].map(([t, d]) => (
              <li key={t} data-gs-item><div className="font-bold">{t}</div><div className="s-small mt-1">{d}</div></li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-[520px]">
          <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.2),transparent)]" />
          <div data-gs="parallax" data-gs-y="30"><DeskListMock className="relative !w-full" /></div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── how it works: the funnel, honestly ───────────── */
const STEPS = [
  { icon: MapPin, when: "Today, 10 seconds", t: "Check your area", d: "We work with one med spa per area. Enter your zip and see if yours is still open." },
  { icon: Sparkles, when: "Today, 60 seconds", t: "See your numbers", d: "Five taps about your practice, then what patient recall could win back each year." },
  { icon: Clock, when: "Today", t: "Pick a time", d: "If you qualify, a 20-minute slot on Andrew's calendar." },
  { icon: ShieldCheck, when: "The call", t: "20 minutes, no pressure", d: "Your numbers, how Atlas runs at your desk, and the offer for your area. You decide." },
  { icon: Check, when: "Within 7 days", t: "Live at your checkout", d: "We load your menu, set up your first membership, print your QR and train your staff." },
];
function HowItWorks({ onStart }: { onStart: () => void }) {
  const v = useInView<HTMLOListElement>({ threshold: 0.25 });
  return (
    <section className="s-section bg-[var(--s-paper)]" aria-labelledby="how-title">
      <div className="s-wrap">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="how-title" className="s-h2 max-w-[16ch]">From first look to live in about a week.</h2>
          <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus self-start lg:self-auto">Check your area <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </div>
        <ol ref={v.ref} data-gs="pop" className={cn("relative mt-16 grid gap-10 md:grid-cols-5 md:gap-6", v.inView && "s-in")}>
          <span aria-hidden className="pointer-events-none absolute left-[18px] right-0 top-[17px] hidden h-[2px] bg-[var(--s-ice)] md:block"><span data-gs="draw" data-gs-axis="x" className="block h-full w-full bg-[var(--s-ocean)]" /></span>
          <span aria-hidden className="pointer-events-none absolute bottom-6 left-[17px] top-[18px] w-[2px] bg-[var(--s-ice)] md:hidden"><span data-gs="draw" data-gs-axis="y" className="block h-full w-full bg-[var(--s-ocean)]" /></span>
          {STEPS.map((s, i) => (
            <li key={s.t} className="s-reveal relative max-md:pl-14" style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="flex items-center gap-3"><span data-gs-pop className="relative z-10 grid h-9 w-9 place-items-center rounded-full bg-[var(--s-ocean)] text-white ring-[6px] ring-[var(--s-paper)] max-md:absolute max-md:left-0 max-md:top-0"><s.icon className="h-4 w-4" aria-hidden /></span><span className="relative z-10 text-[13px] font-semibold text-[var(--s-ocean)] max-md:leading-9 md:-ml-1.5 md:bg-[var(--s-paper)] md:px-2">{s.when}</span></div>
              <div className="mt-5 text-[1.2rem] font-bold leading-snug tracking-[-0.015em]">{s.t}</div>
              <p className="s-body mt-2 text-[15px]">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────── CP-204: the offer — area lock, founding spots, three guarantees ───────────── */
function Offer({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section id="offer" className="s-ocean relative overflow-hidden scroll-mt-16" aria-labelledby="offer-title">
      <div className="s-ocean-img" aria-hidden />
      <div className="s-wrap relative py-24 lg:py-32">
        <div className="mx-auto max-w-[44rem] text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-[13.5px] font-semibold text-white ring-1 ring-white/30"><MapPin className="h-4 w-4" aria-hidden />One med spa per {TERRITORY.radiusMiles}-mile area</p>
          <h2 id="offer-title" className="s-h2 mt-5 text-white">Your area, locked. Your risk, gone.</h2>
          <p className="s-lead mx-auto mt-5 max-w-[36rem]">Once you&apos;re in, we won&apos;t work with another med spa within {TERRITORY.radiusMiles} miles of you for as long as you&apos;re a client. And every practice gets the same three promises.</p>
        </div>

        <ul className="mt-14 grid gap-4 lg:grid-cols-3">
          {GUARANTEES.map((g, i) => (
            <li key={g.id} className={cn("flex flex-col rounded-[26px] p-6 sm:p-7", i === 0 ? "bg-white text-[var(--s-ink)] shadow-[0_30px_60px_-30px_rgba(2,20,70,.7)]" : "bg-white/10 text-white ring-1 ring-white/25 backdrop-blur")}>
              <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", i === 0 ? "bg-[var(--s-ocean)] text-white" : "bg-white text-[var(--s-ocean)]")}><ShieldCheck className="h-6 w-6" aria-hidden /></span>
              <h3 className={cn("mt-5 text-[1.3rem] font-bold leading-snug tracking-[-0.015em]", i === 0 ? "text-[var(--s-ink)]" : "text-white")}>{g.title}</h3>
              <p className={cn("mt-2 flex-1 text-[15px] leading-relaxed", i === 0 ? "text-[var(--s-ink-2)]" : "text-white/85")}>{g.body}</p>
              <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id} className={cn("s-focus mt-4 inline-flex items-center gap-1 self-start rounded text-[13px] font-semibold", i === 0 ? "text-[var(--s-ocean)]" : "text-white/85")}>
                The fine print <ChevronDown className={cn("h-4 w-4 transition-transform", open === g.id && "rotate-180")} aria-hidden />
              </button>
              {open === g.id && <p className={cn("mt-2 text-[13px] leading-relaxed", i === 0 ? "text-[var(--s-ink-3)]" : "text-white/75")}>{g.fine}</p>}
            </li>
          ))}
        </ul>

        {FOUNDING.active && (
          <div className="mx-auto mt-8 flex max-w-[60rem] flex-col items-start justify-between gap-5 rounded-[26px] bg-white/10 p-6 ring-1 ring-white/25 backdrop-blur sm:flex-row sm:items-center sm:p-7">
            <div>
              <div className="flex items-center gap-2 text-[1.15rem] font-bold text-white"><Sparkles className="h-5 w-5" aria-hidden />Founding practices: setup {fmtMoney(FOUNDING.setupFounding)} instead of {fmtMoney(FOUNDING.setupFull)}</div>
              <p className="mt-1.5 max-w-[38rem] text-[14.5px] text-white/85">For the first {FOUNDING.spots} med spas, in exchange for {FOUNDING.trade}. Setup covers your app, large banner, table tents, their design and QR scanners. Check your area to see how many spots are left.</p>
            </div>
            <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus shrink-0"><MapPin className="h-4 w-4" aria-hidden />Check my area</button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────── what's included + risk reversal ───────────── */
function Included({ onStart }: { onStart: () => void }) {
  return (
    <section className="s-section" aria-labelledby="inc-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="inc-title" className="s-h2 max-w-[12ch]">Everything your practice gets.</h2>
          <p className="s-lead mt-6 max-w-[28rem]">One flat monthly fee. No per-patient fees, no percentage of your treatment revenue. {MEDSPA_OFFER_COPY.riskReversal}</p>
          <p className="s-body mt-4 max-w-[28rem]">{MEDSPA_OFFER_COPY.rationale}</p>
          <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus mt-9">Check if your area is open <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </div>
        <div className="s-panel p-7 sm:p-10">
          <div className="flex items-baseline justify-between"><span className="s-h3">Everything included</span><span className="s-small">No tiers</span></div>
          <div className="s-rule mt-5" />
          <dl data-gs="stagger" className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {MEDSPA_STACK.map((s) => <div key={s.t} data-gs-item><dt className="font-bold">{s.t}</dt><dd className="s-small mt-1 leading-relaxed">{s.d}</dd></div>)}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ───────────── faq ─────────────
 * CP-204: the funnel's own list. Area lock and guarantee questions first; the
 * cost answer reflects the setup pricing in FOUNDING. The main site keeps MEDSPA_FAQ. */
const FUNNEL_FAQ: { q: string; a: string }[] = [
  { q: "What does \"one med spa per area\" mean?", a: `Once you're a client, we won't work with another med spa within ${TERRITORY.radiusMiles} miles of your practice for as long as you stay with us. If you cancel, the area opens back up.` },
  { q: "How does the pays-for-itself guarantee work?", a: `${GUARANTEES[0].body} ${GUARANTEES[0].fine}` },
  ...MEDSPA_FAQ.map((f) => f.q === "What does it cost?"
    ? { q: f.q, a: `Setup is ${fmtMoney(FOUNDING.setupFull)}${FOUNDING.active ? ` (${fmtMoney(FOUNDING.setupFounding)} for our first ${FOUNDING.spots} founding practices)` : ""} and covers your app, banner, table tents, their design and QR scanners. Then one flat monthly plan, month to month, quoted on your walkthrough. No percentage of your treatment revenue, ever.` }
    : f),
];
function Faq() {
  return (
    <section className="s-section" aria-labelledby="faq-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <h2 id="faq-title" className="s-h2 max-w-[12ch]">What owners ask us first.</h2>
        <div className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
          {FUNNEL_FAQ.map((f) => (
            <details key={f.q} className="group py-6" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("faq_opened", { source: "medspa", q: f.q.slice(0, 60) })}>
              <summary className="s-focus flex cursor-pointer list-none items-center justify-between gap-6 rounded-md text-left text-[1.1rem] font-bold">{f.q}<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--s-ice)] text-[var(--s-ocean)]"><Plus className="s-plus h-4 w-4" aria-hidden /></span></summary>
              <p className="s-body mt-3 max-w-[40rem]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────── closing, footer, sticky phone bar ───────────── */
function Closing({ onStart }: { onStart: () => void }) {
  return (
    <section className="s-ocean relative overflow-hidden" aria-labelledby="close-title">
      <div className="s-ocean-img" aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#06318F]/60 to-transparent" />
      <div className="s-wrap relative py-28 text-center sm:py-40">
        <h2 id="close-title" className="s-display mx-auto max-w-[14ch] text-[clamp(2.4rem,1.5rem+4vw,5rem)] text-white">Some of your patients are due this week.</h2>
        <p className="s-lead mx-auto mt-6 max-w-[32rem]">Make sure they hear from you before they hear from someone else. We take one med spa per area, and checking yours takes 10 seconds.</p>
        <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus mt-10">Check if your area is open <ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--s-line)] bg-white py-10 pb-28 text-[14px] text-[var(--s-ink-3)] lg:pb-10">
      <div className="s-wrap flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Atlas Engine · Bakersfield · Morro Bay, California</span>
        <span className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="s-focus rounded hover:text-[var(--s-ink)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>
          <a className="s-focus rounded hover:text-[var(--s-ink)]" href="/legal/privacy">Privacy</a>
          <a className="s-focus rounded hover:text-[var(--s-ink)]" href="/legal/terms">Terms</a>
        </span>
      </div>
    </footer>
  );
}

function MobileBar({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--s-line)] bg-white/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
      <button type="button" onClick={onStart} className="s-focus flex w-full items-center justify-center gap-3 text-[1.05rem] font-bold text-[var(--s-ink)]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--s-ocean)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-[15px] w-auto object-contain" />
        </span>Check if your area is open <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/*
 * CP-204 notes: the phone hero (arm A of the CP-202 hero test), its app screenshots and the
 * tap-through demo app were removed. The landing page now sells the offer: one med spa per area
 * (lib/landing/territory.ts), founding spots and the three guarantees in GUARANTEES
 * (lib/landing/medspa-funnel.ts). Every button sends visitors to /medspa/start, area check first.
 */
