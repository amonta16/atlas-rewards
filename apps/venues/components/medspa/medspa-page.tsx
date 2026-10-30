"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import {
  MEDSPA_FAQ, MEDSPA_OFFER_COPY, MEDSPA_STACK, MEDSPA_TESTIMONIALS, SHOW_MEDSPA_TESTIMONIAL_SLOTS, type MedspaTestimonial,
} from "@/lib/landing/medspa-offer";
import { MEDSPA_BOOKING, MEDSPA_BRAND, MEDSPA_HOURS, MEDSPA_LIB, MEDSPA_MEMBER_NOTE, MEDSPA_OFFER, MEDSPA_REWARDS } from "@/lib/landing/medspa-data";
import { LiveApp } from "@/components/landing/live-app/live-app";
import { LandingProviders, useLanding } from "@/components/landing/landing-providers";
import { interClass } from "@/lib/landing/font";
import { MedspaQuiz } from "./medspa-quiz";
import { CycleDial } from "./cycle-dial";
import { RecallCalculator } from "./recall-calculator";

/**
 * /medspa — CP-184 ("porcelain & deep water", with motion).
 *
 * Same story as CP-183 (every patient has a due date), with a richer surface:
 *  - Hero: one orchestrated load sequence (headline lines rise, the practice
 *    photo unmasks, the dial sweeps, the reminder lands, the booking confirms)
 *    over two slow-breathing glows.
 *  - A treatment marquee, a patient-year strip that draws itself on scroll,
 *    a parallax photo band, a floating demo phone, and a steps line that draws.
 *  - Owner video testimonials: 9:16 slots driven by MEDSPA_TESTIMONIALS.
 *    Empty slots show "coming soon" only while SHOW_MEDSPA_TESTIMONIAL_SLOTS
 *    is true; turn it off before ads if no videos are in yet.
 * All motion is CSS (transform/opacity) and is disabled for reduced motion.
 *
 * Claims rules (Atlas Messaging Library): recall and banked credits must ship
 * before ads run; no revenue promises; no brand-name treatments in ad copy.
 */
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

/** Sets --ms-py on the element from its position in the viewport (parallax). */
function useParallax<T extends HTMLElement>(strength = 0.12) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2 - window.innerHeight / 2;
      const py = Math.max(-70, Math.min(70, -center * strength));
      el.style.setProperty("--ms-py", `${py.toFixed(1)}px`);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [strength]);
  return ref;
}

export function MedspaPage() {
  return (
    <LandingProviders fontClassName={interClass} renderQuiz={(src, ref) => <MedspaQuiz source={src} firstFieldRef={ref} />}>
      <Page />
    </LandingProviders>
  );
}

function Page() {
  const source = useAdSource();
  const { openDemo } = useLanding();
  const start = (where: string) => { track("hero_cta_clicked", { source: `medspa_${where}` }); openDemo(`${source}:${where}`); };
  return (
    <div className="ms overflow-x-clip">
      <Header onStart={() => start("header")} />
      <main id="main">
        <Hero onStart={() => start("hero")} />
        <TreatmentMarquee />
        <PatientYear />
        <WhatAtlasRuns />
        <PhotoBand />
        <Calculator onStart={() => start("calculator")} />
        <Testimonials />
        <Included onStart={() => start("included")} />
        <AskAnyVendor />
        <Setup />
        <Faq />
        <Closing onStart={() => start("closing")} />
      </main>
      <Footer />
    </div>
  );
}

/* ─────────────────────────── header ─────────────────────────── */
function Header({ onStart }: { onStart: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition-[background,box-shadow] duration-300",
      scrolled ? "bg-[var(--ms-porcelain)]/80 shadow-[0_1px_0_var(--ms-line)] backdrop-blur-xl" : "bg-transparent")}>
      <div className="ms-wrap flex h-16 items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        <button type="button" onClick={onStart} className={cn("ms-btn ms-focus !h-10 !px-5 text-[15px] transition-colors", scrolled ? "ms-btn-primary" : "ms-btn-quiet")}>See your app</button>
      </div>
    </header>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative -mt-16 overflow-hidden pb-16 pt-28 sm:pt-32 lg:pb-24 lg:pt-36" aria-labelledby="hero-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="ms-glow-a absolute -right-[18%] -top-[30%] h-[900px] w-[900px] rounded-full bg-[radial-gradient(closest-side,rgba(44,110,127,.20),transparent)]" />
        <div className="ms-glow-b absolute -left-[20%] top-[30%] h-[700px] w-[700px] rounded-full bg-[radial-gradient(closest-side,rgba(213,140,134,.16),transparent)]" />
      </div>
      <div className="ms-wrap relative grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-8">
        <div className="relative z-10">
          <p className="ms-load-1 inline-flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-2 pr-4 text-[14px] font-medium text-[var(--ms-tide)] ring-1 ring-[var(--ms-line)] backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-[var(--ms-quartz)] ms-pulse-dot" aria-hidden />
            For med spas and aesthetic practices
          </p>
          <h1 id="hero-title" className="ms-display mt-6 max-w-[11ch]">
            <span className="ms-line">Every patient</span>
            <span className="ms-line">has a due date.</span>
          </h1>
          <p className="ms-lead ms-load-2 mt-7 max-w-[33rem]">
            Atlas gives your practice its own patient app, reminds each patient before her treatment wears off, and sells memberships that bill every month. We set it up and run it with you.
          </p>
          <div className="ms-load-3 mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <button type="button" onClick={onStart} className="ms-btn ms-btn-primary ms-btn-shine ms-focus">See your practice&apos;s app</button>
            <a href="#demo" className="ms-btn ms-btn-quiet ms-focus" onClick={() => track("demo_clicked", { source: "medspa_hero", kind: "try" })}>Try the demo app</a>
          </div>
          <p className="ms-small ms-load-3 mt-5">{MEDSPA_OFFER_COPY.ctaNote} Month to month, cancel anytime.</p>
        </div>

        {/* Layered visual: practice photo, the dial in front of it */}
        <div className="relative mx-auto h-[560px] w-full max-w-[600px] sm:h-[600px]">
          <div className="ms-photo-in absolute right-0 top-0 h-[74%] w-[70%] overflow-hidden rounded-[40px] bg-[var(--ms-mist)] shadow-[0_40px_90px_-50px_rgba(14,36,51,.6)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedUrl(MEDSPA_LIB.hero1, 900)} alt="" className="h-full w-full object-cover" fetchPriority="high" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0E2433]/35 via-transparent to-transparent" />
            <span className="absolute left-5 top-5 rounded-full bg-white/85 px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--ms-ink)] backdrop-blur">Luma Aesthetics, demo practice</span>
          </div>
          <div className="absolute bottom-24 left-0 w-[88%] sm:bottom-6 sm:w-[78%]">
            <div className="rounded-full bg-[var(--ms-porcelain)]/80 p-3 shadow-[0_40px_80px_-40px_rgba(14,36,51,.45)] ring-1 ring-white/70 backdrop-blur-xl">
              <CycleDial />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── marquee ─────────────────────────── */
const TREATMENTS = ["Neurotoxin", "Dermal filler", "HydraFacial", "Microneedling", "Chemical peels", "Laser hair removal", "IPL", "Lip filler", "Skin boosters", "LED therapy"];

function TreatmentMarquee() {
  const row = TREATMENTS.flatMap((t) => [t, "◆"]);
  return (
    <div className="ms-marquee-wrap relative border-y border-[var(--ms-line)] bg-white/50 py-6" aria-label="Treatments Atlas can run recall for">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--ms-porcelain)] to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--ms-porcelain)] to-transparent" />
      <div className="flex overflow-hidden">
        <div className="ms-marquee flex shrink-0 items-center gap-8 whitespace-nowrap pr-8" aria-hidden>
          {[...row, ...row].map((t, i) => t === "◆"
            ? <span key={i} className="h-2 w-2 rotate-45 bg-[var(--ms-champagne)]" />
            : <span key={i} className="font-[family-name:var(--font-ms-display)] text-[1.6rem] tracking-[-0.01em] text-[var(--ms-ink-2)]" style={{ fontVariationSettings: '"opsz" 48, "SOFT" 80' }}>{t}</span>)}
        </div>
      </div>
      <span className="sr-only">{TREATMENTS.join(", ")}</span>
    </div>
  );
}

/* ─────────────────────────── patient year ─────────────────────────── */
const WEEKS = 52;
const WITHOUT = [{ w: 0, kind: "visit" }, { w: 17, kind: "visit" }, { w: 34, kind: "missed" }, { w: 48, kind: "missed" }] as const;
const WITH = [{ w: 0, kind: "visit" }, { w: 12, kind: "visit" }, { w: 25, kind: "visit" }, { w: 37, kind: "visit" }, { w: 50, kind: "visit" }] as const;
const REMINDERS = [10, 23, 35, 48];

function PatientYear() {
  const head = useInView<HTMLDivElement>();
  const fig = useInView<HTMLElement>({ threshold: 0.35 });
  return (
    <section className="ms-section bg-[var(--ms-mist-2)]" aria-labelledby="year-title">
      <div className="ms-wrap">
        <div ref={head.ref} className={cn("grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-20", head.inView && "ms-in")}>
          <h2 id="year-title" className="ms-h2 ms-reveal max-w-[14ch]">The leak nobody sees on the schedule.</h2>
          <div className="ms-body ms-reveal ms-d2 max-w-[36rem] space-y-4 text-[1.06rem]">
            <p>Neurotoxin lasts about three to four months. If nobody reaches out around week ten, a patient who loved her results often just doesn&apos;t rebook, or books with whoever had a promo that week.</p>
            <p>It never shows up as a cancellation. It shows up as a quieter month you can&apos;t quite explain.</p>
          </div>
        </div>

        <figure ref={fig.ref} className={cn("mt-16 rounded-[36px] bg-white p-6 shadow-[0_40px_100px_-60px_rgba(14,36,51,.55)] ring-1 ring-black/[0.03] sm:p-12", fig.inView && "ms-in")}>
          <figcaption className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[1.05rem] font-semibold">One patient, one year</span>
            <span className="ms-small">Illustration of a typical neurotoxin schedule</span>
          </figcaption>
          <div className="mt-12 space-y-14">
            <Track label="On her own" note="2 visits" items={WITHOUT} delay={0} />
            <Track label="With Atlas recall" note="5 visits" items={WITH} reminders={REMINDERS} delay={0.5} />
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--ms-line)] pt-6 text-[14px] text-[var(--ms-ink-2)] sm:flex sm:flex-wrap sm:gap-8">
            <Legend swatch={<span className="h-3.5 w-3.5 rounded-full bg-[var(--ms-ink)]" />} t="Treatment" />
            <Legend swatch={<span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-[var(--ms-quartz)]" />} t="Due, never booked" />
            <Legend swatch={<span className="h-2.5 w-2.5 rotate-45 bg-[var(--ms-quartz)]" />} t="Atlas reminder" />
          </div>
        </figure>
      </div>
    </section>
  );
}

function Track({ label, note, items, reminders = [], delay }: { label: string; note: string; items: ReadonlyArray<{ w: number; kind: "visit" | "missed" }>; reminders?: number[]; delay: number }) {
  const x = (w: number) => `${(w / WEEKS) * 100}%`;
  // Dots appear as the line reaches them (line draws in 1.4s).
  const at = (w: number) => `${(delay + 0.15 + (w / WEEKS) * 1.3).toFixed(2)}s`;
  return (
    <div className="grid gap-3 sm:grid-cols-[170px_1fr] sm:items-center sm:gap-6">
      <div className="flex items-baseline justify-between sm:block">
        <div className="font-semibold">{label}</div>
        <div className="ms-small">{note}</div>
      </div>
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--ms-mist)]" />
        <div className="ms-track-line absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--ms-ink)]/25" style={{ transitionDelay: `${delay}s` }} />
        {reminders.map((w) => (
          <span key={`r${w}`} className="ms-diamond absolute top-1/2 h-2.5 w-2.5 bg-[var(--ms-quartz)]" style={{ left: x(w), transitionDelay: at(w) }} aria-hidden />
        ))}
        {items.map((it) => (
          <span key={it.w} className={cn("ms-dot absolute top-1/2 h-5 w-5 rounded-full",
            it.kind === "visit" ? "bg-[var(--ms-ink)] ring-4 ring-white" : "border-2 border-dashed border-[var(--ms-quartz)] bg-white")}
            style={{ left: x(it.w), transitionDelay: at(it.w) }} aria-label={it.kind === "visit" ? `Treatment, week ${it.w}` : `Due at week ${it.w}, never booked`} />
        ))}
      </div>
    </div>
  );
}

function Legend({ swatch, t }: { swatch: React.ReactNode; t: string }) {
  return <span className="flex items-center gap-2.5">{swatch}{t}</span>;
}

/* ─────────────────────────── what atlas runs ─────────────────────────── */
const PARTS = [
  {
    id: "app",
    t: "Your own patient app",
    d: "Your name, logo and colors on every patient's phone. They open it from a QR code at checkout: points, rewards, booking, offers and their membership in one place. No marketplace, no other practices next to yours.",
  },
  {
    id: "recall",
    t: "Recall, run for you",
    d: "Each treatment gets its own cycle. Before it wears off, the patient gets a personal reminder with a one-tap way to book; if she goes quiet, a gentle win-back follows. You approve the messages once, and we handle the timing.",
  },
  {
    id: "members",
    t: "Memberships that bill monthly",
    d: "Sell a monthly membership right in the app. Dues go straight to your own Stripe account and renew automatically, so your best patients stay on schedule and your month starts with revenue already in.",
  },
];

function WhatAtlasRuns() {
  const [open, setOpen] = useState("recall");
  return (
    <section id="demo" className="ms-section scroll-mt-16" aria-labelledby="runs-title">
      <div className="ms-wrap grid items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-24">
        <div>
          <h2 id="runs-title" className="ms-h2 max-w-[15ch]">Three things Atlas runs, so your front desk doesn&apos;t have to.</h2>
          <div className="mt-12 divide-y divide-[var(--ms-line)] border-y border-[var(--ms-line)]">
            {PARTS.map((p) => {
              const on = p.id === open;
              return (
                <div key={p.id} className="relative">
                  <span aria-hidden className={cn("absolute -left-5 top-0 h-full w-[3px] origin-top rounded-full bg-[var(--ms-quartz)] transition-transform duration-500", on ? "scale-y-100" : "scale-y-0")} />
                  <button type="button" aria-expanded={on} onClick={() => { setOpen(p.id); track("demo_clicked", { source: "medspa_parts", kind: p.id }); }}
                    className="ms-focus group flex w-full items-center justify-between gap-6 py-6 text-left">
                    <span className={cn("font-[family-name:var(--font-ms-display)] text-[1.7rem] leading-tight tracking-[-0.015em] transition-colors duration-300 sm:text-[2rem]", on ? "text-[var(--ms-ink)]" : "text-[var(--ms-ink-3)] group-hover:text-[var(--ms-ink-2)]")}
                      style={{ fontVariationSettings: '"opsz" 72, "SOFT" 50' }}>{p.t}</span>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full transition duration-300", on ? "bg-[var(--ms-ink)] text-white" : "bg-[var(--ms-mist)] text-[var(--ms-ink)]")}>
                      <Plus className={cn("h-4 w-4 transition-transform duration-300", on && "rotate-45")} aria-hidden />
                    </span>
                  </button>
                  <div className={cn("grid transition-[grid-template-rows,opacity] duration-500", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                    <p className="ms-body max-w-[38rem] overflow-hidden text-[1.05rem]" style={{ paddingBottom: on ? "1.75rem" : 0 }}>{p.d}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[380px]">
          <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(44,110,127,.22),transparent)]" />
          <div className="ms-float relative">
            <div className="rounded-[48px] bg-gradient-to-b from-[#e6eeeb] via-[#d7e3df] to-[#c4d4cf] px-6 py-10 shadow-[0_50px_100px_-50px_rgba(14,36,51,.55)] ring-1 ring-white/80 sm:px-9">
              <LiveApp {...DEMO} onEvent={(e) => { if (e !== "tab") track("interactive_demo_used", { demo: "medspa_live_app", step: e }); }} />
            </div>
          </div>
          <p className="ms-small relative mt-6 text-center">A demo practice app. Tap around like a patient would.</p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── parallax photo band ─────────────────────────── */
function PhotoBand() {
  const ref = useParallax<HTMLDivElement>(0.14);
  const view = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <section className="relative isolate overflow-hidden" aria-label="Why timing matters">
      <div ref={ref} className="absolute inset-x-0 -inset-y-[90px] -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={optimizedUrl(MEDSPA_LIB.hero4, 1600)} alt="" loading="lazy" className="ms-parallax h-full w-full object-cover" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(14,36,51,.86)_0%,rgba(14,36,51,.55)_55%,rgba(14,36,51,.25)_100%)]" />
      <div ref={view.ref} className={cn("ms-wrap py-28 sm:py-40", view.inView && "ms-in")}>
        <p className="ms-reveal max-w-[22ch] font-[family-name:var(--font-ms-display)] text-[clamp(2rem,1.2rem+3vw,3.6rem)] leading-[1.08] tracking-[-0.02em] text-white" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 60' }}>
          The best time to rebook her is before she starts wondering where to go.
        </p>
        <p className="ms-reveal ms-d2 mt-6 max-w-[34rem] text-[1.08rem] leading-relaxed text-[#cfdcdc]">Atlas times each reminder to the treatment she had, so it lands in week ten, not week sixteen.</p>
      </div>
    </section>
  );
}

/* ─────────────────────────── calculator ─────────────────────────── */
function Calculator({ onStart }: { onStart: () => void }) {
  return (
    <section className="ms-deep relative overflow-hidden ms-section" aria-labelledby="calc-title">
      <div className="ms-grain" aria-hidden />
      <div aria-hidden className="ms-glow-a pointer-events-none absolute -left-40 bottom-[-30%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(213,140,134,.16),transparent)]" />
      <div className="ms-wrap relative">
        <div className="max-w-2xl">
          <h2 id="calc-title" className="ms-h2 text-white">Put your own numbers on it.</h2>
          <p className="ms-lead mt-5">Three answers and you&apos;ll see roughly what slips through your schedule each year, and what recall could bring back.</p>
        </div>
        <div className="mt-14"><RecallCalculator onContinue={onStart} /></div>
      </div>
    </section>
  );
}

/* ─────────────────────────── testimonials (video) ─────────────────────────── */
function Testimonials() {
  const withVideo = MEDSPA_TESTIMONIALS.filter((t) => t.embed);
  const slots = SHOW_MEDSPA_TESTIMONIAL_SLOTS ? MEDSPA_TESTIMONIALS : withVideo;
  const view = useInView<HTMLDivElement>({ threshold: 0.15 });
  if (slots.length === 0) return null;
  return (
    <section className="ms-section" aria-labelledby="voices-title">
      <div className="ms-wrap">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 id="voices-title" className="ms-h2 max-w-[16ch]">Owners, in their own words.</h2>
          <p className="ms-body max-w-[26rem]">Short, unscripted clips from the practices running Atlas.</p>
        </div>
        <div ref={view.ref} className={cn("mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3", view.inView && "ms-in")}>
          {slots.map((t, i) => <VideoCard key={t.id} t={t} i={i} />)}
        </div>
      </div>
    </section>
  );
}

function VideoCard({ t, i }: { t: MedspaTestimonial; i: number }) {
  const [playing, setPlaying] = useState(false);
  const isFile = !!t.embed && /\.(mp4|webm|mov)(\?|$)/i.test(t.embed);
  const embedSrc = t.embed && !isFile ? `${t.embed}${t.embed.includes("?") ? "&" : "?"}autoplay=1&playsinline=1` : "";
  return (
    <figure className={cn("ms-reveal", i === 1 && "ms-d2 lg:mt-10", i === 2 && "ms-d4")}>
      <div className="ms-video shadow-[0_40px_80px_-50px_rgba(14,36,51,.6)]">
        {playing && t.embed ? (
          isFile
            ? <video src={t.embed} poster={t.poster} controls autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
            : <iframe src={embedSrc} title={`${t.name}, ${t.practice}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedUrl(t.poster, 520)} alt="" loading="lazy" className={cn("absolute inset-0 h-full w-full object-cover", !t.embed && "opacity-70 saturate-[.7]")} />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1d29]/85 via-[#0b1d29]/10 to-transparent" />
            {t.embed ? (
              <button type="button" onClick={() => { setPlaying(true); track("demo_clicked", { source: "medspa_testimonial", kind: t.id }); }}
                className="ms-focus absolute inset-0 grid place-items-center" aria-label={`Play video from ${t.name}, ${t.practice}`}>
                <span className="ms-play grid h-16 w-16 place-items-center rounded-full bg-white/90 text-[var(--ms-ink)] shadow-xl backdrop-blur">
                  <Play className="ml-1 h-6 w-6 fill-current" aria-hidden />
                </span>
              </button>
            ) : (
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/15 px-4 py-2 text-[13px] font-medium text-white ring-1 ring-white/30 backdrop-blur-md">
                Video coming soon
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6 text-white">
              <p className="text-[1.05rem] font-semibold">{t.name}</p>
              <p className="text-[14px] text-white/75">{t.role}, {t.practice}</p>
            </div>
          </>
        )}
      </div>
      <figcaption className="mt-4 px-1">
        {t.quote && <p className="font-[family-name:var(--font-ms-display)] text-[1.2rem] leading-snug text-[var(--ms-ink)]" style={{ fontVariationSettings: '"opsz" 36, "SOFT" 50' }}>&ldquo;{t.quote}&rdquo;</p>}
        <p className="ms-small mt-1">{t.city}</p>
      </figcaption>
    </figure>
  );
}

/* ─────────────────────────── included ─────────────────────────── */
function Included({ onStart }: { onStart: () => void }) {
  const view = useInView<HTMLDListElement>({ threshold: 0.1 });
  return (
    <section className="ms-section bg-[var(--ms-mist-2)]" aria-labelledby="inc-title">
      <div className="ms-wrap grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="inc-title" className="ms-h2 max-w-[12ch]">Everything your practice gets.</h2>
          <p className="ms-lead mt-6 max-w-[28rem]">{MEDSPA_OFFER_COPY.riskReversal}</p>
          <p className="ms-body mt-4 max-w-[28rem]">{MEDSPA_OFFER_COPY.rationale}</p>
          <button type="button" onClick={onStart} className="ms-btn ms-btn-primary ms-focus mt-9">See your practice&apos;s app</button>
        </div>
        <dl ref={view.ref} className={cn("grid gap-x-10 gap-y-9 sm:grid-cols-2", view.inView && "ms-in")}>
          {MEDSPA_STACK.map((s, i) => (
            <div key={s.t} className="ms-reveal relative pt-5" style={{ transitionDelay: `${(i % 2) * 0.08 + Math.floor(i / 2) * 0.06}s` }}>
              <span aria-hidden className="ms-connector absolute left-0 top-0 h-[2px] w-full bg-[var(--ms-ink)]" style={{ transitionDelay: `${0.1 + Math.floor(i / 2) * 0.08}s` }} />
              <dt className="ms-h3">{s.t}</dt>
              <dd className="ms-body mt-2">{s.d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ─────────────────────────── questions to ask any vendor ─────────────────────────── */
const ASK = [
  { q: "Can I cancel any month?", a: "Yes. Month to month, no long-term contract and no 90-day notice." },
  { q: "Is the app mine, or a listing inside someone else's app?", a: "Yours: your name and icon on the patient's phone, no other practices next to you." },
  { q: "Who sets it up and keeps it running?", a: "We do, with you. Rewards, recall timing, your first membership and staff training." },
  { q: "Do you take a cut of my treatment revenue?", a: "Never. One flat monthly fee." },
];

function AskAnyVendor() {
  return (
    <section className="ms-section" aria-labelledby="ask-title">
      <div className="ms-wrap">
        <h2 id="ask-title" className="ms-h2 max-w-[18ch]">Four questions to ask before you sign any patient app.</h2>
        <p className="ms-lead mt-5 max-w-[40rem]">Here are ours, answered plainly.</p>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[32px] bg-[var(--ms-line)] ring-1 ring-[var(--ms-line)] sm:grid-cols-2">
          {ASK.map((x) => (
            <div key={x.q} className="group bg-[var(--ms-porcelain)] p-7 transition-colors duration-300 hover:bg-white sm:p-10">
              <p className="font-[family-name:var(--font-ms-display)] text-[1.45rem] leading-snug tracking-[-0.01em]" style={{ fontVariationSettings: '"opsz" 48, "SOFT" 50' }}>{x.q}</p>
              <p className="ms-body mt-3">{x.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── setup (a real sequence) ─────────────────────────── */
const STEPS = [
  { when: "Today", t: "See your app and your numbers", d: "Seven quick questions. Your app takes shape as you answer, and you get a recall estimate." },
  { when: "This week", t: "A 20-minute walkthrough", d: "We bring your app and numbers to the call: setup, staff, pricing. No pressure." },
  { when: "Within 7 days", t: "Live at your checkout", d: "QR at the desk, rewards, your first membership and recall timing set. Staff trained in about 15 minutes." },
  { when: "Every month", t: "A report you can read in a minute", d: "Overdue patients reached, how many rebooked, new members and membership revenue." },
];

function Setup() {
  const view = useInView<HTMLOListElement>({ threshold: 0.25 });
  return (
    <section className="ms-section border-t border-[var(--ms-line)]" aria-labelledby="setup-title">
      <div className="ms-wrap">
        <h2 id="setup-title" className="ms-h2 max-w-[16ch]">From first look to live in about a week.</h2>
        <ol ref={view.ref} className={cn("relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6", view.inView && "ms-in")}>
          <span aria-hidden className="absolute left-5 right-[12%] top-5 hidden h-px bg-[var(--ms-line)] md:block" />
          <span aria-hidden className="ms-connector absolute left-5 right-[12%] top-5 hidden h-[2px] -translate-y-px bg-[var(--ms-tide)] md:block" />
          {STEPS.map((s, i) => (
            <li key={s.t} className="ms-reveal relative" style={{ transitionDelay: `${0.15 + i * 0.22}s` }}>
              <span className="ms-num relative grid h-10 w-10 place-items-center rounded-full bg-[var(--ms-ink)] text-[1.1rem] text-white ring-8 ring-[var(--ms-porcelain)]">{i + 1}</span>
              <p className="mt-5 text-[14px] font-medium text-[var(--ms-tide)]">{s.when}</p>
              <p className="ms-h3 mt-1">{s.t}</p>
              <p className="ms-body mt-2 text-[15px]">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────── faq ─────────────────────────── */
function Faq() {
  return (
    <section className="ms-section bg-[var(--ms-mist-2)]" aria-labelledby="faq-title">
      <div className="ms-wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <h2 id="faq-title" className="ms-h2 max-w-[12ch]">What owners ask us first.</h2>
        <div className="divide-y divide-[var(--ms-line)] border-y border-[var(--ms-line)]">
          {MEDSPA_FAQ.map((f) => (
            <details key={f.q} className="group py-6" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("faq_opened", { source: "medspa", q: f.q.slice(0, 60) })}>
              <summary className="ms-focus flex items-center justify-between gap-6 rounded-md text-left text-[1.12rem] font-semibold">
                {f.q}
                <Plus className="ms-plus h-5 w-5 shrink-0 text-[var(--ms-tide)]" aria-hidden />
              </summary>
              <p className="ms-body ms-faq-a mt-3 max-w-[40rem]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── closing ─────────────────────────── */
function Closing({ onStart }: { onStart: () => void }) {
  const ref = useParallax<HTMLDivElement>(0.1);
  return (
    <section className="ms-deep relative isolate overflow-hidden" aria-labelledby="close-title">
      <div ref={ref} className="absolute inset-x-0 -inset-y-[90px] -z-10 opacity-30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={optimizedUrl(MEDSPA_LIB.hero6, 1600)} alt="" loading="lazy" className="ms-parallax h-full w-full object-cover" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(70%_80%_at_50%_100%,rgba(14,36,51,.2),#0b1d29_85%)]" />
      <div className="ms-grain" aria-hidden />
      <div className="ms-wrap relative py-28 text-center sm:py-40">
        <h2 id="close-title" className="ms-h2 mx-auto max-w-[16ch] text-white">Some of your patients are due this week.</h2>
        <p className="ms-lead mx-auto mt-6 max-w-[34rem]">Make sure they hear from you before they hear from someone else. Seeing your app costs nothing.</p>
        <button type="button" onClick={onStart} className="ms-btn ms-btn-light ms-btn-shine ms-focus mt-10">See your practice&apos;s app</button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0b1d29] py-10 text-[14px] text-[#8fa6aa]">
      <div className="ms-wrap flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Atlas Engine, California</span>
        <span className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="ms-focus hover:text-white" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>
          <a className="ms-focus hover:text-white" href="/legal/privacy">Privacy</a>
          <a className="ms-focus hover:text-white" href="/legal/terms">Terms</a>
        </span>
      </div>
    </footer>
  );
}
