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
import { ArrowRight, Check, Clock, Plus, ShieldCheck, Sparkles, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import { LandingProviders, useLanding } from "@/components/landing/landing-providers";
import { LiveApp } from "@/components/landing/live-app/live-app";
import { siteFontClass } from "@/lib/landing/site-fonts";
import { fmtMoney } from "@/lib/landing/quiz-model";
import { REBOOK, SCENARIOS, estimateMedspa } from "@/lib/landing/medspa-quiz-model";
import { MEDSPA_FAQ, MEDSPA_OFFER_COPY, MEDSPA_STACK } from "@/lib/landing/medspa-offer";
import { MEDSPA_BOOKING, MEDSPA_BRAND, MEDSPA_HOURS, MEDSPA_MEMBER_NOTE, MEDSPA_OFFER, MEDSPA_REWARDS } from "@/lib/landing/medspa-data";
import { AppShot, Compare, ReviewsBand } from "@/components/site/site-page";
import { BookedPillMock, DeskListMock, PhoneShell, ReminderMock } from "@/components/site/site-mocks";
import { useSiteMotion } from "@/components/site/motion";
import { MedspaFunnel } from "./medspa-funnel";

const DEMO = { brand: MEDSPA_BRAND, categories: MEDSPA_BOOKING, rewards: MEDSPA_REWARDS, hours: MEDSPA_HOURS, offer: MEDSPA_OFFER, memberNote: MEDSPA_MEMBER_NOTE, guest: "Maya" };

function useAdSource() {
  const [source, setSource] = useState("medspa");
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      setSource(["medspa", p.get("utm_source"), p.get("utm_campaign"), p.get("utm_content")].filter(Boolean).join(":").slice(0, 120));
    } catch { /* keep default */ }
  }, []);
  return source;
}

export function MedspaFunnelPage() {
  return (
    <LandingProviders fontClassName={`site ${siteFontClass}`} renderQuiz={(src, ref) => <MedspaFunnel source={src} firstFieldRef={ref} />}>
      <Page />
    </LandingProviders>
  );
}

function Page() {
  const source = useAdSource();
  const { openDemo } = useLanding();
  const start = (where: string) => { track("hero_cta_clicked", { source: `medspa_${where}` }); openDemo(`${source}:${where}`); };
  const rootRef = useRef<HTMLDivElement>(null);
  useSiteMotion(rootRef);
  // The "your times are still open" email links to /medspa?lead=<id>: open straight onto the calendar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("lead")) openDemo(`${source}:return`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={rootRef} className="site overflow-x-clip">
      <Header onStart={() => start("header")} />
      <main id="main">
        <Hero onStart={() => start("hero")} />
        <Assurances />
        <Leak />
        <WhatAtlasRuns />
        <Calculator onStart={() => start("calculator")} />
        <DeskBand />
        <HowItWorks onStart={() => start("steps")} />
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
function Header({ onStart }: { onStart: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 10); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition-[background,box-shadow] duration-300", scrolled ? "bg-white/85 shadow-[0_1px_0_var(--s-line)] backdrop-blur-xl" : "bg-transparent")}>
      <div className="s-wrap flex h-[68px] items-center justify-between gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        <button type="button" onClick={onStart} className={cn("s-btn s-focus !h-11 !px-5 text-[15px]", scrolled ? "s-btn-primary" : "s-btn-quiet")}>See your app</button>
      </div>
    </header>
  );
}

/* ───────────── hero ───────────── */
const SCREENS = [
  { src: "/landing/app-screens/shop.jpg", alt: "A practice's app with a treatment to rebook" },
  { src: "/landing/app-screens/membership.jpg", alt: "The membership tab in a practice's app" },
  { src: "/landing/app-screens/rewards.jpg", alt: "The rewards tab in a practice's app" },
];
function Hero({ onStart }: { onStart: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((k) => (k + 1) % SCREENS.length), 3800);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="relative -mt-[68px] overflow-hidden pb-20 pt-[104px] sm:pt-[128px] lg:pb-28" aria-labelledby="hero-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="s-blob absolute -right-[12%] -top-[25%] h-[820px] w-[820px] rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.22),transparent)]" />
        <div className="absolute -left-[18%] top-[35%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(11,95,214,.10),transparent)]" />
      </div>
      <div className="s-wrap relative grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <div className="relative z-10">
          <p className="s-load-1 inline-flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-2 pr-4 text-[14px] font-semibold text-[var(--s-ocean-deep)] ring-1 ring-[var(--s-line)] backdrop-blur">
            <span className="relative h-2 w-2 rounded-full bg-[var(--s-sky)] s-ping" aria-hidden />For med spas and aesthetic practices
          </p>
          <h1 id="hero-title" className="s-display s-load-1 mt-6 max-w-[11ch]">Every patient has a due date.</h1>
          <p className="s-lead s-load-2 mt-6 max-w-[33rem]">Atlas gives your practice its own patient app that reminds each patient before her treatment wears off, and sells memberships that bill every month. We set it up and run it with you.</p>
          <div className="s-load-3 mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus">See your practice&apos;s app <ArrowRight className="h-4 w-4" aria-hidden /></button>
            <a href="#demo" onClick={() => track("demo_clicked", { source: "medspa_hero", kind: "try" })} className="s-btn s-btn-quiet s-focus">Try the demo app</a>
          </div>
          <p className="s-small s-load-3 mt-5">{MEDSPA_OFFER_COPY.ctaNote} Month to month, cancel anytime.</p>
        </div>

        <div className="s-load-4 relative mx-auto h-[600px] w-full max-w-[460px] sm:h-[680px]">
          <div className="absolute left-1/2 top-0 origin-top -translate-x-1/2 scale-[.86] sm:scale-100">
            <div aria-hidden className="absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.28),transparent)]" />
            <PhoneShell tilt={false}>
              {SCREENS.map((s, k) => <div key={s.src} className={cn("s-screen", k === i && "s-on")} aria-hidden={k !== i}><AppShot src={s.src} alt={s.alt} /></div>)}
            </PhoneShell>
          </div>
          <div className="s-float-in absolute -left-2 top-16 z-10 w-[270px] sm:-left-16 sm:w-[300px]"><div className="s-drift"><ReminderMock className="!w-full" /></div></div>
          <div className="s-float-in-2 absolute bottom-24 right-0 z-10 sm:-right-8"><div className="s-drift-2"><BookedPillMock /></div></div>
        </div>
      </div>
    </section>
  );
}

function Assurances() {
  const items = [["Your name on the app", "Not a listing in someone else's"], ["Live in about a week", "We load your menu and train staff"], ["Month to month", "No contract, no 90-day notice"], ["Built in California", "Same people on every call"]];
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

/* ───────────── what atlas runs + the tap-through demo app ───────────── */
const PARTS = [
  { id: "app", t: "Your own patient app", d: "Your name, logo and colors on every patient's phone. They open it from a QR code at checkout: points, rewards, offers and their membership in one place. No marketplace, no other practices next to yours." },
  { id: "recall", t: "Reminders before it wears off", d: "Each treatment carries its own cycle. Her app shows when she's due, and the front desk gets the list of who to reach this week. You approve the wording once; we set up the timing with you." },
  { id: "members", t: "Memberships that bill monthly", d: "Sell a monthly membership right in the app. Dues go straight to your own Stripe account and renew automatically, so your month starts with revenue already in." },
];
function WhatAtlasRuns() {
  const [open, setOpen] = useState("recall");
  return (
    <section id="demo" className="s-section scroll-mt-16 bg-[var(--s-paper)]" aria-labelledby="runs-title">
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
        <div className="relative mx-auto w-full max-w-[380px]">
          <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.25),transparent)]" />
          <div data-gs="parallax" data-gs-y="24" className="relative">
            <div className="rounded-[48px] bg-gradient-to-b from-[#EAF3FF] via-[#DCEBFF] to-[#C9DFFF] px-6 py-10 shadow-[0_50px_100px_-50px_rgba(6,49,143,.5)] ring-1 ring-white/80 sm:px-9">
              <LiveApp {...DEMO} onEvent={(e) => { if (e !== "tab") track("interactive_demo_used", { demo: "medspa_live_app", step: e }); }} />
            </div>
          </div>
          <p className="s-small relative mt-6 text-center">A demo practice app. Tap around like a patient would.</p>
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
              <button type="button" onClick={() => { track("hero_cta_clicked", { source: "medspa_calculator", est_likely: est.likely }); onStart(); }} className="s-btn s-btn-light s-focus w-full sm:w-auto">See my practice&apos;s app and full estimate <ArrowRight className="h-4 w-4" aria-hidden /></button>
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
  { icon: Sparkles, when: "Today, 60 seconds", t: "See your app and your numbers", d: "Seven taps. Your colors and name on the app, and a recall estimate from your own numbers." },
  { icon: Clock, when: "Today", t: "Pick a time", d: "A few quick questions about your practice, then a 20-minute slot on Andrew's calendar." },
  { icon: Video, when: "Before the call", t: "A 3-minute video", d: "What Atlas does and how the call works, so the call is about your practice, not a pitch." },
  { icon: ShieldCheck, when: "The call", t: "20 minutes, no pressure", d: "Andrew walks through the app he built for you and your numbers. You decide." },
  { icon: Check, when: "Within 7 days", t: "Live at your checkout", d: "We load your menu, set up your first membership, print your QR and train your staff." },
];
function HowItWorks({ onStart }: { onStart: () => void }) {
  const v = useInView<HTMLOListElement>({ threshold: 0.25 });
  return (
    <section className="s-section bg-[var(--s-paper)]" aria-labelledby="how-title">
      <div className="s-wrap">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="how-title" className="s-h2 max-w-[16ch]">From first look to live in about a week.</h2>
          <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus self-start lg:self-auto">Start with your app <ArrowRight className="h-4 w-4" aria-hidden /></button>
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

/* ───────────── what's included + risk reversal ───────────── */
function Included({ onStart }: { onStart: () => void }) {
  return (
    <section className="s-section" aria-labelledby="inc-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="inc-title" className="s-h2 max-w-[12ch]">Everything your practice gets.</h2>
          <p className="s-lead mt-6 max-w-[28rem]">One flat monthly fee. No per-patient fees, no percentage of your treatment revenue. {MEDSPA_OFFER_COPY.riskReversal}</p>
          <p className="s-body mt-4 max-w-[28rem]">{MEDSPA_OFFER_COPY.rationale}</p>
          <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus mt-9">See your practice&apos;s app <ArrowRight className="h-4 w-4" aria-hidden /></button>
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

/* ───────────── faq ───────────── */
function Faq() {
  return (
    <section className="s-section" aria-labelledby="faq-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <h2 id="faq-title" className="s-h2 max-w-[12ch]">What owners ask us first.</h2>
        <div className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
          {MEDSPA_FAQ.map((f) => (
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
        <p className="s-lead mx-auto mt-6 max-w-[32rem]">Make sure they hear from you before they hear from someone else. Seeing your app costs nothing.</p>
        <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus mt-10">See your practice&apos;s app <ArrowRight className="h-4 w-4" aria-hidden /></button>
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
        </span>See your practice&apos;s app <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
