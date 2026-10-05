"use client";
/**
 * components/site/site-page.tsx — CP-187 · atlas-engine.app, med spa first
 *
 * The brand site. /medspa sells one outcome to cold ad traffic; this page
 * sells the whole system to someone who typed our name: the patient app,
 * the front desk, the builder, the people, the price shape, the FAQ.
 * Fresh look ("pearl & aubergine", Instrument Serif + Manrope), one load
 * sequence in the hero, product moments drawn in code (site-mocks.tsx).
 *
 * Claims rules (Atlas Messaging Library): recall SENDING and the credit
 * ledger are not live yet; copy says what the app shows and what the desk
 * does today. No invented customers, numbers or logos. Entertainment venues
 * are routed to /venues from the nav and footer.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, BellRing, CreditCard, Crown, Gift, Menu, MonitorSmartphone, Play, Plus, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import { LandingProviders, useLanding } from "@/components/landing/landing-providers";
import { LiveApp } from "@/components/landing/live-app/live-app";
import { interClass } from "@/lib/landing/font";
import { CONTACT_EMAIL, IOS_APP_URL } from "@/lib/landing/config";
import { MEDSPA_FAQ, MEDSPA_OFFER_COPY, MEDSPA_STACK } from "@/lib/landing/medspa-offer";
import { MEDSPA_BOOKING, MEDSPA_BRAND, MEDSPA_HOURS, MEDSPA_MEMBER_NOTE, MEDSPA_OFFER, MEDSPA_REWARDS } from "@/lib/landing/medspa-data";
import { TESTIMONIALS } from "@/lib/landing/testimonials";
import { MedspaQuiz } from "@/components/medspa/medspa-quiz";
import { AftercareMock, DeskListMock, DueCardMock, MemberCardMock, PhoneShell, ScreenFinancing, ScreenMembership, ScreenRecall, ScreenRewards } from "./site-mocks";
import { SHOW_REVIEW_SLOTS, SITE_BADGES, SITE_REVIEWS } from "@/lib/landing/site-reviews";

const DEMO = { brand: MEDSPA_BRAND, categories: MEDSPA_BOOKING, rewards: MEDSPA_REWARDS, hours: MEDSPA_HOURS, offer: MEDSPA_OFFER, memberNote: MEDSPA_MEMBER_NOTE, guest: "Maya" };

export function SitePage() {
  return (
    <LandingProviders fontClassName={interClass} renderQuiz={(src, ref) => <MedspaQuiz source={src} firstFieldRef={ref} />}>
      <Page />
    </LandingProviders>
  );
}

function Page() {
  const { openDemo } = useLanding();
  const start = (where: string) => { track("hero_cta_clicked", { source: `site_${where}` }); openDemo(`site:${where}`); };
  return (
    <div className="site overflow-x-clip">
      <Nav onStart={() => start("nav")} />
      <main id="main">
        <Showcase onStart={() => start("hero")} />
        <Facts />
        <Pillars onStart={() => start("pillars")} />
        <Desk />
        <Week />
        <Pricing onStart={() => start("pricing")} />
        <Compare />
        <ReviewsBand />
        <Team />
        <Faq />
        <Closing onStart={() => start("closing")} />
      </main>
      <Footer />
      <MobileBar onStart={() => start("sticky_bar")} />
    </div>
  );
}

/* ───────────── nav ───────────── */
const LINKS = [{ href: "#product", t: "Product" }, { href: "#desk", t: "Front desk" }, { href: "#pricing", t: "Pricing" }, { href: "#faq", t: "FAQ" }];

function Nav({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 10); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition-[background,box-shadow] duration-300", scrolled || open ? "bg-[var(--s-pearl)]/85 shadow-[0_1px_0_var(--s-line)] backdrop-blur-xl" : "bg-transparent")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <div className="s-wrap flex h-[68px] items-center justify-between gap-6">
        <Link href="/" className="s-focus flex items-center rounded-md" aria-label="Atlas Engine home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {LINKS.map((l) => <a key={l.href} href={l.href} className="s-focus rounded-md px-3 py-2 text-[14.5px] font-medium text-[var(--s-ink-2)] hover:text-[var(--s-ink)]">{l.t}</a>)}
          <Link href="/venues" className="s-focus ml-2 rounded-md px-3 py-2 text-[14.5px] font-medium text-[var(--s-ocean)] hover:underline">For entertainment venues</Link>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="s-focus rounded-md px-3 py-2 text-[14.5px] font-medium text-[var(--s-ink-2)] hover:text-[var(--s-ink)]">Log in</Link>
          <button type="button" onClick={onStart} className={cn("s-btn s-focus !h-11 !px-5 text-[15px]", scrolled ? "s-btn-primary" : "s-btn-quiet")}>See your app</button>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="s-focus grid h-10 w-10 place-items-center rounded-full lg:hidden" aria-expanded={open} aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <div className="s-wrap flex flex-col gap-1 pb-5 lg:hidden">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium">{l.t}</a>)}
          <Link href="/venues" onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium text-[var(--s-ocean)]">For entertainment venues</Link>
          <Link href="/login" onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium">Log in</Link>
          <button type="button" onClick={() => { setOpen(false); onStart(); }} className="s-btn s-btn-primary s-focus mt-2">See your practice&apos;s app</button>
        </div>
      )}
    </header>
  );
}

/* ───────────── showcase (Dermis-style top): headline, "See how", a rail of features, the phone changes ───────────── */
type Feature = { id: string; label: string; icon: React.ReactNode; blurb: string; status?: string; screen: React.ReactNode };
const DWELL = 4500;

function Showcase({ onStart }: { onStart: () => void }) {
  const features: Feature[] = [
    { id: "recall", label: "Recall reminders", icon: <BellRing className="h-5 w-5" />, blurb: "Every treatment carries how long results last. Her app shows the countdown; she hears from you before she forgets you.", screen: <ScreenRecall /> },
    { id: "members", label: "Memberships", icon: <Crown className="h-5 w-5" />, blurb: "Sold in the app, billed through your own Stripe, banking a monthly credit toward treatments.", screen: <ScreenMembership /> },
    { id: "rewards", label: "Rewards", icon: <Gift className="h-5 w-5" />, blurb: "Points for visits, reviews and referrals, redeemed on add-ons and treatments you choose.", screen: <ScreenRewards /> },
    { id: "financing", label: "Patient financing", icon: <CreditCard className="h-5 w-5" />, status: "In development", blurb: "Pay over time at checkout, through the practice's own Stripe, so a $720 treatment is a yes today.", screen: <ScreenFinancing /> },
    { id: "desk", label: "Front desk", icon: <MonitorSmartphone className="h-5 w-5" />, blurb: "Who is due, who is overdue, who already booked. Open her, log the treatment, or text the reminder you wrote.", screen: <div className="relative flex h-full items-center justify-center p-3"><DeskListMock className="!w-full scale-[.92]" /></div> },
  ];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((k) => (k + 1) % features.length), DWELL);
    return () => clearTimeout(t);
  }, [i, paused, features.length]);
  return (
    <section className="relative -mt-[68px] overflow-hidden pt-[100px] sm:pt-[124px]" aria-labelledby="hero-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="s-blob absolute -right-[12%] -top-[25%] h-[820px] w-[820px] rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.22),transparent)]" />
        <div className="absolute -left-[18%] top-[35%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(11,95,214,.10),transparent)]" />
      </div>
      {/* Dermis geometry: headline over everything; below it a narrow rail on the left and the phone on the right,
          on every screen size. On phones the rail is icon-over-label and the phone hangs off the right edge. */}
      <div className="s-wrap relative grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-x-12" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <h1 id="hero-title" className="s-display s-load-1 max-w-[12ch]">Sell more treatments and memberships.</h1>
          <p className="s-lead s-load-2 mt-5 max-w-[32rem]">An app with your name on it that brings each patient back on time. We set it up with you in about a week.</p>
          <div className="s-load-3 mt-6 flex items-center gap-3 text-[1.3rem] font-semibold text-[var(--s-ink-2)]">See how <ArrowDown className="s-arrow h-6 w-6" aria-hidden /></div>
        </div>

        <ol className="s-load-3 flex flex-col border-l border-[var(--s-line)] lg:mt-2" aria-label="What Atlas runs">
          {features.map((f, k) => {
            const on = k === i;
            return (
              <li key={f.id} className="relative">
                <span aria-hidden className="absolute -left-px top-0 h-full w-[3px] overflow-hidden rounded-r"><span className={cn("s-rail-fill block h-full w-full bg-[var(--s-ocean)]", on && "s-on")} style={{ ["--s-dwell" as string]: `${DWELL}ms` }} /></span>
                <button type="button" onClick={() => { setI(k); track("demo_clicked", { source: "site_showcase", kind: f.id }); }} aria-current={on ? "true" : undefined}
                  className={cn("s-focus flex w-full flex-col items-start gap-1.5 rounded-r-2xl py-3 pl-3 pr-1 text-left transition-colors sm:flex-row sm:items-center sm:gap-3 sm:py-3.5 sm:pl-4 sm:pr-2", on ? "text-[var(--s-ink)]" : "text-[var(--s-ink-3)] hover:text-[var(--s-ink-2)]")}>
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors", on ? "bg-[var(--s-ocean)] text-white shadow-[0_10px_20px_-10px_rgba(11,95,214,.8)]" : "bg-[var(--s-ice)] text-[var(--s-ocean)]")}>{f.icon}</span>
                  <span className="min-w-0 flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                    <span className={cn("text-[13px] leading-tight sm:text-[17px]", on ? "font-bold" : "font-semibold")}>{f.label}</span>
                    {f.status && <span className="rounded-full bg-[var(--s-ice)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--s-ocean-deep)] sm:text-[10px]">{f.status}</span>}
                  </span>
                </button>
                <div className={cn("max-sm:hidden grid transition-[grid-template-rows,opacity] duration-400", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <p className="s-body overflow-hidden pl-[4.25rem] pr-4 text-[15px]" style={{ paddingBottom: on ? "0.9rem" : 0 }}>{f.blurb}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="s-load-4 relative h-[560px] w-full sm:h-[690px] lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:h-[760px]">
          <div className="absolute left-[8%] top-0 origin-top-left scale-[.78] sm:left-1/2 sm:-translate-x-1/2 sm:scale-100 lg:top-10">
            <div className="absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.28),transparent)]" aria-hidden />
            <PhoneShell>
              {features.map((f, k) => <div key={f.id} className={cn("s-screen", k === i && "s-on")} aria-hidden={k !== i}>{f.screen}</div>)}
            </PhoneShell>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1">
          <p className="s-body max-w-[36rem] text-[15px] sm:hidden">{features[i].blurb}</p>
          <div className="s-load-4 mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:mt-2">
            <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus">Build my app <ArrowRight className="h-4 w-4" /></button>
            <span className="s-small">{MEDSPA_OFFER_COPY.ctaNote} Month to month.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Dermis keeps the CTA pinned on phones. Hidden on desktop, hidden once the closing section is in view. */
function MobileBar({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--s-line)] bg-white/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
      <button type="button" onClick={onStart} className="s-focus flex w-full items-center justify-center gap-3 text-[1.1rem] font-bold text-[var(--s-ink)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/atlas-icon-white.png" alt="" className="h-7 w-7 rounded-lg bg-[var(--s-ocean)] p-1" />Build my app in 60 seconds <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

/* ───────────── facts strip (no invented logos) ───────────── */
function Facts() {
  const items = ["Built and run from California", "Live at your checkout in about a week", "Month to month, no long contract", "Your own Stripe account, every dollar", "Free AE Rewards app on iPhone"];
  return (
    <div className="mt-10 border-y border-[var(--s-line)] bg-[var(--s-paper)]">
      <div className="s-wrap flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-5 text-[14px] font-medium text-[var(--s-ink-2)]">
        {items.map((t, i) => <span key={t} className="flex items-center gap-3">{i > 0 && <span className="hidden h-1.5 w-1.5 rounded-full bg-[var(--s-ocean)] sm:block" aria-hidden />}{t}</span>)}
      </div>
    </div>
  );
}

/* ───────────── three pillars, each with the real screen ───────────── */
function Pillars({ onStart }: { onStart: () => void }) {
  const rows: { k: string; h: string; p: string; bullets: string[]; art: React.ReactNode }[] = [
    {
      k: "recall", h: "She finds out she's due before she forgets you.",
      p: "Every treatment on your menu carries how long results last. The desk logs today's treatment in one tap, and her app shows the countdown, the aftercare, and a button to book.",
      bullets: ["Due-date card on her Home screen", "Aftercare appears the moment it's logged", "Your recall message, in your words"],
      art: <div className="relative h-[420px]"><div className="s-reveal absolute left-0 top-4"><DueCardMock /></div><div className="s-reveal s-d2 absolute right-0 top-[210px]"><AftercareMock className="!w-[300px]" /></div></div>,
    },
    {
      k: "members", h: "A membership that pays you on the first of the month.",
      p: "Sell it in the app, bill it through your own Stripe, and let it bank a monthly credit toward treatments. Members see their balance; your desk applies it at checkout.",
      bullets: ["Monthly dues straight to your Stripe", "Credit banks toward any treatment", "Member pricing shown on the menu"],
      art: <div className="flex h-[340px] items-center justify-center"><div className="s-reveal"><MemberCardMock /></div></div>,
    },
    {
      k: "app", h: "Your name on the icon. No marketplace, no competitors next to you.",
      p: "Patients open it from a QR at checkout. Points, rewards, booking, your providers and before-and-afters, all in your colors. Try it; it's the real app with a demo practice loaded.",
      bullets: ["Branded in your colors, your logo", "Providers and real results on Home", "Booking one tap away"],
      art: <div className="relative mx-auto w-[300px]"><div className="rounded-[42px] bg-gradient-to-b from-[#F6F9FD] to-[#DCEBFF] p-4 ring-1 ring-white/80 shadow-[0_50px_100px_-50px_rgba(6,49,143,.45)]"><LiveApp {...DEMO} onEvent={(e) => { if (e !== "tab") track("interactive_demo_used", { demo: "site_pillar_app", step: e }); }} /></div></div>,
    },
  ];
  return (
    <section id="product" className="s-section scroll-mt-16" aria-labelledby="pillars-title">
      <div className="s-wrap">
        <div className="max-w-2xl">
          <h2 id="pillars-title" className="s-h2">Three things that change the week after you switch it on.</h2>
          <p className="s-lead mt-5">Not a points program bolted onto your POS. The repeat-visit system for an aesthetics practice.</p>
        </div>
        <div className="mt-20 space-y-28">
          {rows.map((r, i) => <PillarRow key={r.k} r={r} flip={i % 2 === 1} />)}
        </div>
        <div className="mt-20 flex justify-center"><button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus">See it with your name on it <ArrowRight className="h-4 w-4" /></button></div>
      </div>
    </section>
  );
}

function PillarRow({ r, flip }: { r: { h: string; p: string; bullets: string[]; art: React.ReactNode }; flip: boolean }) {
  const v = useInView<HTMLDivElement>({ threshold: 0.25 });
  return (
    <div ref={v.ref} className={cn("grid items-center gap-12 lg:grid-cols-2 lg:gap-20", v.inView && "s-in")}>
      <div className={cn(flip && "lg:order-2")}>
        <h3 className="s-h3 s-reveal max-w-[20ch] text-[clamp(1.7rem,1.2rem+1.6vw,2.5rem)]">{r.h}</h3>
        <p className="s-body s-reveal s-d1 mt-5 max-w-[34rem] text-[1.06rem]">{r.p}</p>
        <ul className="s-reveal s-d2 mt-7 space-y-2.5">
          {r.bullets.map((b) => <li key={b} className="flex items-center gap-3 text-[15px]"><span className="h-px w-6 bg-[var(--s-ocean)]" aria-hidden />{b}</li>)}
        </ul>
      </div>
      <div className={cn("s-panel relative overflow-hidden p-6 sm:p-10", flip && "lg:order-1")} style={{ background: "linear-gradient(160deg,#ffffff 0%,#EEF5FF 100%)" }}>{r.art}</div>
    </div>
  );
}

/* ───────────── the desk ───────────── */
function Desk() {
  const v = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <section id="desk" className="s-ocean relative overflow-hidden scroll-mt-16" aria-labelledby="desk-title">
      <div className="s-ocean-img opacity-70" aria-hidden />
      <div ref={v.ref} className={cn("s-wrap relative grid items-center gap-14 py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-36", v.inView && "s-in")}>
        <div>
          <h2 id="desk-title" className="s-h2 s-reveal max-w-[16ch]">Your front desk gets a list, not a dashboard.</h2>
          <p className="s-lead s-reveal s-d1 mt-6 max-w-[30rem]">Who is overdue, who is due within two weeks, who already booked. Open the patient, log the treatment, or text her the reminder you wrote. That&apos;s the whole screen.</p>
          <dl className="s-reveal s-d2 mt-9 grid gap-6 sm:grid-cols-2">
            {[["Check-in by QR or phone number", "No app training for staff: scan, tap the treatment, done."], ["Points and rewards at the counter", "The same tap that logs the treatment awards the visit."], ["Consents on file", "Signed intake and consent forms, searchable by patient."], ["Bookings in the same place", "Resources, durations and deposits shown in the app."]].map(([t, d]) => (
              <div key={t}><dt className="font-semibold text-white">{t}</dt><dd className="s-small mt-1">{d}</dd></div>
            ))}
          </dl>
        </div>
        <div className="s-reveal s-d1 relative mx-auto w-full max-w-[520px]">
          <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.25),transparent)]" />
          <DeskListMock className="relative !w-full" />
        </div>
      </div>
    </section>
  );
}

/* ───────────── the week (a real sequence) ───────────── */
const WEEK = [
  { when: "Today", t: "Build your app in 60 seconds", d: "Seven questions. Your colors and name on the app, and a recall estimate from your own numbers." },
  { when: "This week", t: "A 20-minute call", d: "We walk through your app, your menu and your membership. You decide." },
  { when: "Setup", t: "We load your practice", d: "Treatments with recall windows, providers, aftercare, your first membership. Staff trained in about 15 minutes." },
  { when: "Day 7", t: "Live at checkout", d: "A QR at the desk. Every patient who scans is now reachable, and every treatment you log starts a clock." },
];
function Week() {
  const v = useInView<HTMLOListElement>({ threshold: 0.3 });
  return (
    <section className="s-section" aria-labelledby="week-title">
      <div className="s-wrap">
        <h2 id="week-title" className="s-h2 max-w-[16ch]">From first look to live in about a week.</h2>
        <ol ref={v.ref} className={cn("mt-16 grid gap-10 md:grid-cols-4 md:gap-8", v.inView && "s-in")}>
          {WEEK.map((s, i) => (
            <li key={s.t} className="s-reveal" style={{ transitionDelay: `${i * 0.12}s` }}>
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--s-ocean)] text-[0.95rem] font-bold text-white">{i + 1}</span><span className="text-[13px] font-semibold text-[var(--s-ocean)]">{s.when}</span></div>
              <div className="s-h3 mt-5 text-[1.35rem]">{s.t}</div>
              <p className="s-body mt-2 text-[15px]">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────── pricing (shape, not a number: offer of record is quoted on the call) ───────────── */
function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section id="pricing" className="s-section scroll-mt-16 bg-[var(--s-paper)]" aria-labelledby="pricing-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="pricing-title" className="s-h2 max-w-[12ch]">One flat monthly fee.</h2>
          <p className="s-lead mt-6 max-w-[28rem]">No per-patient fees, no percentage of your treatment revenue, no setup charge. {MEDSPA_OFFER_COPY.riskReversal}</p>
          <p className="s-body mt-4 max-w-[28rem]">We quote it on the call once we&apos;ve seen your volume and what you want to run first. Most practices earn it back with a handful of rebooked patients.</p>
          <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus mt-9">Start with your app <ArrowRight className="h-4 w-4" /></button>
        </div>
        <div className="s-panel p-7 sm:p-10">
          <div className="flex items-baseline justify-between"><span className="s-h3">Everything included</span><span className="s-small">No tiers</span></div>
          <div className="s-rule mt-5" />
          <dl className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {MEDSPA_STACK.map((s) => <div key={s.t}><dt className="font-semibold">{s.t}</dt><dd className="s-small mt-1 leading-relaxed">{s.d}</dd></div>)}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ───────────── compare ───────────── */
const COMPARE: { q: string; a: [string, string, string] }[] = [
  { q: "Whose name is on the app?", a: ["Theirs; you're a listing", "Your POS vendor's", "Yours"] },
  { q: "Tells a patient when she's due?", a: ["No", "No", "Yes, per treatment"] },
  { q: "Memberships billed to your Stripe?", a: ["Rarely", "Sometimes, with fees", "Yes, your account"] },
  { q: "Front-desk list of who to call?", a: ["No", "Reports, if you dig", "Yes, every morning"] },
  { q: "Who sets it up?", a: ["You, from a help center", "You, from a help center", "We do, with you"] },
  { q: "Contract", a: ["Varies", "Often annual", "Month to month"] },
];
function Compare() {
  return (
    <section className="s-section" aria-labelledby="cmp-title">
      <div className="s-wrap">
        <h2 id="cmp-title" className="s-h2 max-w-[18ch]">Six questions to ask before you sign anything.</h2>
        <div className="s-panel mt-12 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead><tr className="border-b border-[var(--s-line)] text-[13px] text-[var(--s-ink-3)]"><th className="p-5 font-medium"></th><th className="p-5 font-medium">Marketplace apps</th><th className="p-5 font-medium">POS loyalty add-on</th><th className="p-5 font-semibold text-[var(--s-ocean)]">Atlas</th></tr></thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.q} className="border-b border-[var(--s-line)] last:border-0">
                  <th scope="row" className="p-5 font-semibold">{r.q}</th>
                  {r.a.map((c, i) => <td key={i} className={cn("p-5", i === 2 ? "font-semibold text-[var(--s-ink)] bg-[var(--s-ice)]/60" : "text-[var(--s-ink-2)]")}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ───────────── reviews band (Owner-style): ocean panel, badges, cards sliding across ───────────── */
function ReviewsBand() {
  const flippos = TESTIMONIALS.find((t) => t.id === "flippos-owner" && t.embed);
  const real = SITE_REVIEWS.filter((r) => r.quote);
  const cards = SHOW_REVIEW_SLOTS ? SITE_REVIEWS : real;
  const [playing, setPlaying] = useState(false);
  if (!flippos && cards.length === 0) return null;
  return (
    <section className="s-section !pt-0" aria-labelledby="reviews-title">
      <div className="s-wrap">
        <div className="s-ocean relative overflow-hidden rounded-[36px] pb-10 pt-16 sm:pt-24">
          <div className="s-ocean-img" aria-hidden />
          <div className="relative px-5 text-center">
            <h2 id="reviews-title" className="s-h2 mx-auto max-w-[16ch] text-[clamp(2.2rem,1.4rem+3.2vw,4.2rem)]">See what owners say about Atlas.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {SITE_BADGES.map((b) => (
                <span key={b.t} className="inline-flex items-center gap-2.5 rounded-2xl bg-white/12 px-4 py-2.5 text-left ring-1 ring-white/25 backdrop-blur">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[var(--s-ocean)]"><Star className="h-4 w-4 fill-current" /></span>
                  <span><span className="block text-[14px] font-bold text-white">{b.t}</span><span className="block text-[12px] text-white/75">{b.d}</span></span>
                </span>
              ))}
            </div>
            {real.length === 0 && <p className="s-small mt-6 text-white/80">Our first practices are going live now. Their words land here as they come in; nothing on this page is invented.</p>}
          </div>

          {/* Cards slide across; pause on hover. The whole set renders twice so the loop has no seam. */}
          <div className="s-marquee-wrap relative mt-12 overflow-hidden">
            <div className="s-marquee flex w-max gap-4 px-4">
              {[0, 1].map((pass) => (
                <div key={pass} className="flex gap-4" aria-hidden={pass === 1}>
                  {flippos && (
                    <figure className="w-[380px] shrink-0 overflow-hidden rounded-3xl bg-[var(--s-ice)] p-3">
                      <div className="relative aspect-video overflow-hidden rounded-2xl bg-[var(--s-ocean-deep)]">
                        {playing && pass === 0 ? <iframe src={`${flippos.embed}&autoplay=1`} title="Flippo's Arcade & Batting Cage on Atlas" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" /> : (
                          <button type="button" onClick={() => { setPlaying(true); track("demo_clicked", { source: "site_reviews", kind: "flippos" }); }} className="s-focus group absolute inset-0 text-left" aria-label="Play: Flippo's owner on Atlas" tabIndex={pass === 1 ? -1 : 0}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={flippos.poster} alt="" className="h-full w-full object-cover" />
                            <span className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[var(--s-ink)] shadow-xl"><Play className="ml-0.5 h-5 w-5 fill-current" /></span>
                          </button>
                        )}
                      </div>
                      <figcaption className="px-2 pb-1 pt-3"><div className="text-[15px] font-bold text-[var(--s-ink)]">Flippo&apos;s Arcade &amp; Batting Cage</div><div className="text-[12px] text-[var(--s-ink-3)]">Morro Bay · the first business running Atlas · video</div></figcaption>
                    </figure>
                  )}
                  {cards.map((r) => (
                    <figure key={r.id} className={cn("flex w-[340px] shrink-0 flex-col justify-between rounded-3xl p-6", r.quote ? "bg-[var(--s-ice)]" : "border border-dashed border-white/40 bg-white/10 text-white backdrop-blur")}>
                      <div>
                        <div className={cn("flex gap-0.5", r.quote ? "text-[var(--s-ink)]" : "text-white/50")}>{[0, 1, 2, 3, 4].map((n) => <Star key={n} className={cn("h-4 w-4", r.quote && r.rating && n < r.rating ? "fill-current" : "")} />)}</div>
                        <blockquote className={cn("mt-4 text-[17px] font-semibold leading-snug", r.quote ? "text-[var(--s-ink)]" : "text-white/85")}>{r.quote ? `“${r.quote}”` : "Review slot: this fills with a real owner's words when the first practices go live."}</blockquote>
                      </div>
                      <figcaption className="mt-6 flex items-center gap-3">
                        <span className={cn("grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold", r.quote ? "bg-[var(--s-ocean)] text-white" : "bg-white/20 text-white")}>{r.name[0]}</span>
                        <span><span className={cn("block text-[14px] font-bold", r.quote ? "text-[var(--s-ink)]" : "text-white")}>{r.name}</span><span className={cn("block text-[12px]", r.quote ? "text-[var(--s-ink-3)]" : "text-white/70")}>{r.role} · {r.business} · {r.city}</span></span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── team ───────────── */
function Team() {
  const v = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <section className="s-section" aria-labelledby="team-title">
      <div ref={v.ref} className={cn("s-wrap grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20", v.inView && "s-in")}>
        <div>
          <h2 id="team-title" className="s-h2 s-reveal max-w-[14ch]">Built by people who come to your front desk.</h2>
          <p className="s-lead s-reveal s-d1 mt-6 max-w-[30rem]">Atlas started on California&apos;s Central Coast, with local businesses that were tired of watching chains have apps while they had punch cards. We still set every practice up in person or on a call with the same people who built it.</p>
          <ul className="s-reveal s-d2 mt-8 grid gap-6 sm:grid-cols-3">
            {[["Local first", "We work with practices we can actually talk to."], ["Hands-on setup", "Your menu, your providers, your membership: loaded with you."], ["Here after launch", "Same people on the call every time."]].map(([t, d]) => <li key={t}><div className="font-semibold">{t}</div><div className="s-small mt-1">{d}</div></li>)}
          </ul>
        </div>
        <div className="s-reveal s-d1 grid grid-cols-[1.3fr_1fr] gap-4">
          <div className="overflow-hidden rounded-[32px] shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/team-sunset.jpg" alt="The Atlas Engine team at sunset" width={1600} height={1067} loading="lazy" className="aspect-[4/5] h-full w-full object-cover" />
          </div>
          <div className="mt-16 overflow-hidden rounded-[32px] shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/team-field.jpg" alt="The Atlas Engine team at a local ballfield" width={1600} height={1067} loading="lazy" className="aspect-[3/4] h-full w-full object-cover object-[60%_center]" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── faq ───────────── */
function Faq() {
  return (
    <section id="faq" className="s-section scroll-mt-16 bg-[var(--s-paper)]" aria-labelledby="faq-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <h2 id="faq-title" className="s-h2 max-w-[12ch]">What owners ask us first.</h2>
        <div className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
          {MEDSPA_FAQ.map((f) => (
            <details key={f.q} className="group py-6" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("faq_opened", { source: "site", q: f.q.slice(0, 60) })}>
              <summary className="s-focus flex cursor-pointer list-none items-center justify-between gap-6 rounded-md text-left text-[1.1rem] font-semibold">{f.q}<Plus className="s-plus h-5 w-5 shrink-0 text-[var(--s-ocean)]" aria-hidden /></summary>
              <p className="s-body mt-3 max-w-[40rem]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────── closing + footer ───────────── */
function Closing({ onStart }: { onStart: () => void }) {
  return (
    <section className="s-ocean relative overflow-hidden" aria-labelledby="close-title">
      <div className="s-ocean-img" aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#06318F]/60 to-transparent" />
      <div className="s-wrap relative py-28 text-center sm:py-40">
        <h2 id="close-title" className="s-display mx-auto max-w-[14ch] text-[clamp(2.4rem,1.5rem+4vw,5rem)] text-white">Some of your patients are due this week.</h2>
        <p className="s-lead mx-auto mt-6 max-w-[32rem]">See what your practice&apos;s app looks like. It takes a minute, and nobody has to install anything.</p>
        <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus mt-10">See your practice&apos;s app <ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#061B3A] py-14 pb-28 text-[14px] text-[#A9C3E6] lg:pb-14">
      <div className="s-wrap grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-icon-white.png" alt="" width={64} height={64} className="h-9 w-9 opacity-90" />
          <p className="mt-4 max-w-[28ch] leading-relaxed">The patient app for independent med spas. Built in California.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="s-focus mt-3 inline-block rounded text-white/90 hover:text-white">{CONTACT_EMAIL}</a>
        </div>
        <FooterCol title="Product" links={[["#product", "What it does"], ["#desk", "Front desk"], ["#pricing", "Pricing"], ["#faq", "FAQ"]]} />
        <FooterCol title="Also from Atlas" links={[["/venues", "For entertainment venues"], ["/medspa", "Med spa recall estimate"], [IOS_APP_URL, "AE Rewards on the App Store"]]} />
        <FooterCol title="Company" links={[["/login", "Log in"], ["/support", "Support"], ["/legal/privacy", "Privacy"], ["/legal/terms", "Terms"]]} />
      </div>
      <div className="s-wrap mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-[13px] sm:flex-row"><span>© {new Date().getFullYear()} Atlas Engine. All rights reserved.</span><span>Bakersfield · Morro Bay, California</span></div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[12px] font-semibold tracking-wide text-white/70">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([href, t]) => <li key={href}>{href.startsWith("http") ? <a href={href} target="_blank" rel="noopener" className="s-focus rounded hover:text-white">{t}</a> : href.startsWith("#") ? <a href={href} className="s-focus rounded hover:text-white">{t}</a> : <Link href={href} className="s-focus rounded hover:text-white">{t}</Link>}</li>)}
      </ul>
    </div>
  );
}

