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
import { ArrowRight, Menu, Play, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import { LandingProviders, useLanding } from "@/components/landing/landing-providers";
import { LiveApp } from "@/components/landing/live-app/live-app";
import { interClass } from "@/lib/landing/font";
import { CONTACT_EMAIL, IOS_APP_URL } from "@/lib/landing/config";
import { MEDSPA_FAQ, MEDSPA_OFFER_COPY, MEDSPA_STACK, MEDSPA_TESTIMONIALS, SHOW_MEDSPA_TESTIMONIAL_SLOTS } from "@/lib/landing/medspa-offer";
import { MEDSPA_BOOKING, MEDSPA_BRAND, MEDSPA_HOURS, MEDSPA_MEMBER_NOTE, MEDSPA_OFFER, MEDSPA_REWARDS } from "@/lib/landing/medspa-data";
import { TESTIMONIALS } from "@/lib/landing/testimonials";
import { MedspaQuiz } from "@/components/medspa/medspa-quiz";
import { AftercareMock, BookedPillMock, DeskListMock, DueCardMock, MemberCardMock, ReminderMock } from "./site-mocks";

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
        <Hero onStart={() => start("hero")} />
        <Facts />
        <Pillars onStart={() => start("pillars")} />
        <Desk />
        <Week />
        <Pricing onStart={() => start("pricing")} />
        <Compare />
        <Voices />
        <Team />
        <Faq />
        <Closing onStart={() => start("closing")} />
      </main>
      <Footer />
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
          <Link href="/venues" className="s-focus ml-2 rounded-md px-3 py-2 text-[14.5px] font-medium text-[var(--s-plum)] hover:underline">For entertainment venues</Link>
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
          <Link href="/venues" onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium text-[var(--s-plum)]">For entertainment venues</Link>
          <Link href="/login" onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium">Log in</Link>
          <button type="button" onClick={() => { setOpen(false); onStart(); }} className="s-btn s-btn-primary s-focus mt-2">See your practice&apos;s app</button>
        </div>
      )}
    </header>
  );
}

/* ───────────── hero ───────────── */
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative -mt-[68px] overflow-hidden pt-[112px] pb-20 sm:pt-[136px] lg:pb-28" aria-labelledby="hero-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="s-blob absolute -right-[10%] -top-[20%] h-[760px] w-[760px] rounded-full bg-[radial-gradient(closest-side,rgba(205,185,220,.55),transparent)]" />
        <div className="absolute -left-[15%] bottom-[-30%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(201,161,74,.12),transparent)]" />
      </div>
      <div className="s-wrap relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <p className="s-load-1 s-small inline-flex items-center gap-2 rounded-full bg-white/70 py-1.5 pl-2.5 pr-4 ring-1 ring-[var(--s-line)] backdrop-blur">
            <span className="relative h-2 w-2 rounded-full bg-[var(--s-plum)] s-ping" />The patient app for independent med spas
          </p>
          <h1 id="hero-title" className="s-display s-load-2 mt-6 max-w-[12ch]">Your practice, on every patient&apos;s phone.</h1>
          <p className="s-lead s-load-3 mt-7 max-w-[32rem]">
            An app with your name on it that tells each patient when she&apos;s due, banks her membership toward the next visit, and gives your front desk the list of who to call this week. We set it up with you in about a week.
          </p>
          <div className="s-load-4 mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <button type="button" onClick={onStart} className="s-btn s-btn-primary s-focus">See your practice&apos;s app <ArrowRight className="h-4 w-4" /></button>
            <a href="#product" className="s-btn s-btn-quiet s-focus">How it works</a>
          </div>
          <p className="s-small s-load-4 mt-5">{MEDSPA_OFFER_COPY.ctaNote} Month to month.</p>
        </div>

        {/* The product, both sides: her phone and your desk. */}
        <div className="relative mx-auto h-[640px] w-full max-w-[560px] sm:h-[700px]">
          {/* Positioning and animation live on different elements: the s-* keyframes end on transform:none, which would cancel a translate. */}
          <div className="absolute left-1/2 top-0 w-[320px] -translate-x-1/2 sm:left-0 sm:translate-x-0">
            <div className="s-load-3 rounded-[46px] bg-gradient-to-b from-[#f7f3f9] to-[#e4d9ee] p-5 shadow-[0_60px_120px_-50px_rgba(46,24,56,.5)] ring-1 ring-white/80">
              <LiveApp {...DEMO} onEvent={(e) => { if (e !== "tab") track("interactive_demo_used", { demo: "site_live_app", step: e }); }} />
            </div>
          </div>
          {/* Desk list: scaled on the wrapper, animated on the child. */}
          <div className="absolute right-0 top-[36%] hidden w-[420px] origin-top-right scale-[.78] sm:block lg:-right-4"><div className="s-float-in s-drift"><DeskListMock className="!w-full" /></div></div>
          {/* Her recall reminder, where a push banner actually lands: top of her screen. */}
          <div className="absolute left-1/2 top-[64px] w-[280px] -translate-x-1/2 sm:left-[20px] sm:translate-x-0"><div className="s-float-in-2"><ReminderMock className="!w-full" /></div></div>
          <div className="absolute bottom-6 right-8 hidden sm:block"><div className="s-float-in-2 s-drift-2"><BookedPillMock /></div></div>
        </div>
      </div>
    </section>
  );
}

/* ───────────── facts strip (no invented logos) ───────────── */
function Facts() {
  const items = ["Built and run from California", "Live at your checkout in about a week", "Month to month, no long contract", "Your own Stripe account, every dollar", "Free AE Rewards app on iPhone"];
  return (
    <div className="border-y border-[var(--s-line)] bg-white/50">
      <div className="s-wrap flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-5 text-[14px] font-medium text-[var(--s-ink-2)]">
        {items.map((t, i) => <span key={t} className="flex items-center gap-3">{i > 0 && <span className="hidden h-1.5 w-1.5 rotate-45 bg-[var(--s-honey)] sm:block" aria-hidden />}{t}</span>)}
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
      art: <div className="relative mx-auto w-[300px]"><div className="rounded-[42px] bg-gradient-to-b from-[#f7f3f9] to-[#e4d9ee] p-4 ring-1 ring-white/80 shadow-[0_50px_100px_-50px_rgba(46,24,56,.45)]"><LiveApp {...DEMO} onEvent={(e) => { if (e !== "tab") track("interactive_demo_used", { demo: "site_pillar_app", step: e }); }} /></div></div>,
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
          {r.bullets.map((b) => <li key={b} className="flex items-center gap-3 text-[15px]"><span className="h-px w-6 bg-[var(--s-honey)]" aria-hidden />{b}</li>)}
        </ul>
      </div>
      <div className={cn("s-panel relative overflow-hidden p-6 sm:p-10", flip && "lg:order-1")} style={{ background: "linear-gradient(160deg,#fff 0%,#f6f2f8 100%)" }}>{r.art}</div>
    </div>
  );
}

/* ───────────── the desk ───────────── */
function Desk() {
  const v = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <section id="desk" className="s-dark relative overflow-hidden scroll-mt-16" aria-labelledby="desk-title">
      <div ref={v.ref} className={cn("s-wrap grid items-center gap-14 py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-36", v.inView && "s-in")}>
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
          <div aria-hidden className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(205,185,220,.25),transparent)]" />
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
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--s-ink)] font-[family-name:var(--font-site-display)] text-[1.15rem] text-white">{i + 1}</span><span className="text-[13px] font-semibold text-[var(--s-plum)]">{s.when}</span></div>
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
    <section id="pricing" className="s-section scroll-mt-16 bg-[var(--s-pearl-2)]" aria-labelledby="pricing-title">
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
            <thead><tr className="border-b border-[var(--s-line)] text-[13px] text-[var(--s-ink-3)]"><th className="p-5 font-medium"></th><th className="p-5 font-medium">Marketplace apps</th><th className="p-5 font-medium">POS loyalty add-on</th><th className="p-5 font-semibold text-[var(--s-plum)]">Atlas</th></tr></thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.q} className="border-b border-[var(--s-line)] last:border-0">
                  <th scope="row" className="p-5 font-semibold">{r.q}</th>
                  {r.a.map((c, i) => <td key={i} className={cn("p-5", i === 2 ? "font-semibold text-[var(--s-ink)] bg-[var(--s-lilac)]/30" : "text-[var(--s-ink-2)]")}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ───────────── voices: real Flippo's video + med spa slots ───────────── */
function Voices() {
  const flippos = TESTIMONIALS.find((t) => t.id === "flippos-owner" && t.embed);
  const slots = SHOW_MEDSPA_TESTIMONIAL_SLOTS ? MEDSPA_TESTIMONIALS : MEDSPA_TESTIMONIALS.filter((t) => t.embed);
  const [playing, setPlaying] = useState(false);
  const v = useInView<HTMLDivElement>({ threshold: 0.2 });
  if (!flippos && slots.length === 0) return null;
  return (
    <section className="s-section bg-[var(--s-pearl-2)]" aria-labelledby="voices-title">
      <div className="s-wrap">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 id="voices-title" className="s-h2 max-w-[16ch]">From the people running Atlas.</h2>
          <p className="s-body max-w-[28rem]">Unscripted. Our first venue runs Atlas at the counter every day; med spa owners are next, and their clips will land here.</p>
        </div>
        <div ref={v.ref} className={cn("mt-12 grid gap-6 lg:grid-cols-[1.4fr_1fr_1fr]", v.inView && "s-in")}>
          {flippos && (
            <figure className="s-reveal">
              <div className="relative aspect-video overflow-hidden rounded-3xl bg-[var(--s-plum-deep)] shadow-xl">
                {playing ? <iframe src={`${flippos.embed}&autoplay=1`} title="Flippo's Arcade & Batting Cage on Atlas" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" /> : (
                  <button type="button" onClick={() => { setPlaying(true); track("demo_clicked", { source: "site_testimonial", kind: "flippos" }); }} className="s-focus group absolute inset-0 text-left" aria-label="Play: Flippo's owner on Atlas">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={flippos.poster} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[var(--s-ink)] shadow-xl"><Play className="ml-1 h-6 w-6 fill-current" /></span>
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white"><div className="font-semibold">Flippo&apos;s Arcade &amp; Batting Cage</div><div className="text-sm text-white/75">Morro Bay · the first business on Atlas</div></div>
                  </button>
                )}
              </div>
            </figure>
          )}
          {slots.slice(0, 2).map((t, i) => (
            <figure key={t.id} className={cn("s-reveal", i === 0 ? "s-d1" : "s-d2")}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[var(--s-plum-deep)] shadow-xl lg:aspect-auto lg:h-full lg:min-h-[280px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 saturate-[.6]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                {!t.embed && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/15 px-4 py-2 text-[13px] font-medium text-white ring-1 ring-white/30 backdrop-blur-md">Med spa owner · coming soon</span>}
                <div className="absolute inset-x-0 bottom-0 p-5 text-white"><div className="font-semibold">{t.role}</div><div className="text-sm text-white/75">{t.city}</div></div>
              </div>
            </figure>
          ))}
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
    <section id="faq" className="s-section scroll-mt-16 bg-[var(--s-pearl-2)]" aria-labelledby="faq-title">
      <div className="s-wrap grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <h2 id="faq-title" className="s-h2 max-w-[12ch]">What owners ask us first.</h2>
        <div className="divide-y divide-[var(--s-line)] border-y border-[var(--s-line)]">
          {MEDSPA_FAQ.map((f) => (
            <details key={f.q} className="group py-6" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("faq_opened", { source: "site", q: f.q.slice(0, 60) })}>
              <summary className="s-focus flex cursor-pointer list-none items-center justify-between gap-6 rounded-md text-left text-[1.1rem] font-semibold">{f.q}<Plus className="s-plus h-5 w-5 shrink-0 text-[var(--s-plum)]" aria-hidden /></summary>
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
    <section className="s-dark relative overflow-hidden" aria-labelledby="close-title">
      <div aria-hidden className="s-blob pointer-events-none absolute -left-40 top-[-40%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(closest-side,rgba(205,185,220,.25),transparent)]" />
      <div className="s-wrap relative py-28 text-center sm:py-40">
        <h2 id="close-title" className="s-display mx-auto max-w-[14ch] text-[clamp(2.4rem,1.5rem+4vw,5rem)]">Some of your patients are due this week.</h2>
        <p className="s-lead mx-auto mt-6 max-w-[32rem]">See what your practice&apos;s app looks like. It takes a minute, and nobody has to install anything.</p>
        <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus mt-10">See your practice&apos;s app <ArrowRight className="h-4 w-4" /></button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#1B0F22] py-14 text-[14px] text-[#B5A6C0]">
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

