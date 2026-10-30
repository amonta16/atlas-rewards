"use client";
/**
 * components/home/home-page.tsx — CP-206 · atlas-engine.app, for ANY local business.
 *
 * The business cards (cold, door-to-door) point here, so a donut shop, a smoke shop
 * and a med spa all land on the same page. It is a simple funnel:
 *   the VSL (the main event) → one big "Book a free demo" → proof (reviews band)
 *   → apps in other businesses' brands → what the app does → how it works → book.
 * Booking opens components/home/demo-booker.tsx (Calendly-style, Andrew's calendar).
 *
 * The med spa site that used to live here is unchanged at /med-spas (app/med-spas).
 * Claims: capability-ledger Live items only (Atlas Messaging Library). No numbers
 * we don't measure, no invented reviews (the reviews band shows real videos and
 * clearly labeled empty slots).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, BellRing, Check, CreditCard, Gift, HeartHandshake, Play, QrCode, RotateCcw, ScanLine, Smartphone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { APP_MOCKUPS } from "@/lib/landing/apps";
import { ReviewsBand } from "@/components/site/site-page";
import { useSiteMotion } from "@/components/site/motion";
import { DemoBooker } from "./demo-booker";

export const VSL = { src: "/landing/atlas-vsl.mp4", poster: "/landing/atlas-vsl-poster.jpg", length: "2:33" };

const FEATURES = [
  { icon: Smartphone, t: "Your own app", d: "Your name, logo and colors on their phone. Opens from a QR code at your counter, nothing to download." },
  { icon: Gift, t: "Points and rewards", d: "Customers earn on every visit and redeem from your own rewards store." },
  { icon: HeartHandshake, t: "Come-back offers, on autopilot", d: "Welcome, birthday and \"we miss you\" offers go out by themselves, with a reward that expires." },
  { icon: BellRing, t: "Straight to their phone", d: "Offers land as notifications, with quiet hours and daily limits so you never spam." },
  { icon: CreditCard, t: "Memberships", d: "Sell a monthly membership in your app. The money goes straight to your Stripe account." },
  { icon: ScanLine, t: "Front desk in one tap", d: "Look a customer up by phone number, add points, redeem a reward. Runs on the phone or tablet you have." },
  { icon: Star, t: "Reviews and referrals", d: "Reward Google reviews and friend referrals, so happy customers bring the next ones." },
  { icon: BarChart3, t: "Real numbers", d: "A simple dashboard of visits, members and who came back. Only what it actually tracks." },
];

const TYPES = ["Coffee shops", "Donut shops", "Restaurants", "Smoke shops", "Salons", "Med spas", "Arcades and venues", "Retail"];

const STEPS = [
  { t: "Book a 20-minute demo", d: "On video with Andrew. You see your own app and what it costs." },
  { t: "We build it with you", d: "Your logo, colors, rewards and offers. We do the setup; you approve it." },
  { t: "Live at your counter", d: "A QR code at the register and your staff trained. Usually about a week." },
];

export function HomePage() {
  const [booking, setBooking] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useSiteMotion(rootRef);
  const book = (where: string) => { track("hero_cta_clicked", { source: `home_${where}` }); setBooking(where); };
  return (
    <div ref={rootRef} className="site overflow-x-clip">
      <Nav onBook={() => book("nav")} />
      <main id="main">
        <Hero onBook={() => book("hero")} onBookEnd={() => book("vsl_end")} />
        <Apps />
        <ReviewsBand audience="general" />
        <Features onBook={() => book("features")} />
        <How onBook={() => book("steps")} />
        <Closing onBook={() => book("closing")} />
      </main>
      <Footer />
      <MobileBar onBook={() => book("sticky_bar")} />
      <DemoBooker open={booking !== null} source={booking ?? "home"} onClose={() => setBooking(null)} />
    </div>
  );
}

/* ───────────── nav ───────────── */
function Nav({ onBook }: { onBook: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 10); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  return (
    <header className={cn("sticky top-0 z-40 transition-[background,box-shadow] duration-300", scrolled ? "bg-white/85 shadow-[0_1px_0_var(--s-line)] backdrop-blur-xl" : "bg-transparent")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <div className="s-wrap flex h-[68px] items-center justify-between gap-6">
        <Link href="/" className="s-focus rounded-md" aria-label="Atlas Engine home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scrolled ? "/landing/atlas-engine-logo-navy.png" : "/atlas-engine-logo.png"} alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          <Link href="/med-spas" className={cn("s-focus hidden rounded-md px-3 py-2 text-[14.5px] font-medium md:block", scrolled ? "text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" : "text-white/85 hover:text-white")}>Med spas</Link>
          <Link href="/venues" className={cn("s-focus hidden rounded-md px-3 py-2 text-[14.5px] font-medium md:block", scrolled ? "text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" : "text-white/85 hover:text-white")}>Entertainment venues</Link>
          <Link href="/login" className={cn("s-focus hidden rounded-md px-3 py-2 text-[14.5px] font-medium sm:block", scrolled ? "text-[var(--s-ink-2)] hover:text-[var(--s-ink)]" : "text-white/85 hover:text-white")}>Log in</Link>
          <button type="button" onClick={onBook} className={cn("s-btn s-focus ml-2 !h-11 !px-5 text-[15px]", scrolled ? "s-btn-primary" : "s-btn-light")}>Book a demo</button>
        </nav>
      </div>
    </header>
  );
}

/* ───────────── hero: the VSL is the main event ───────────── */
function Hero({ onBook, onBookEnd }: { onBook: () => void; onBookEnd: () => void }) {
  return (
    <section className="s-ocean relative -mt-[68px] overflow-hidden pb-16 pt-[96px] sm:pb-20 sm:pt-[108px]" aria-labelledby="hero-title">
      <div className="s-ocean-img" aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#06318F]/50" />
      <div className="s-wrap relative text-center">
        <p className="s-load-1 mx-auto inline-flex items-center gap-2.5 rounded-full bg-white/12 py-1.5 pl-2 pr-4 text-[13.5px] font-semibold text-white ring-1 ring-white/30 backdrop-blur">
          <span className="relative h-2 w-2 rounded-full bg-white s-ping" aria-hidden />For local businesses
        </p>
        <h1 id="hero-title" className="s-display s-load-1 mx-auto mt-5 max-w-[22ch] !text-[clamp(2.1rem,1.2rem+2.9vw,3.6rem)] text-white">The loyalty app big chains have. Now in your name.</h1>
        <p className="s-lead s-load-2 mx-auto mt-3 max-w-[38rem]">Watch the 2-minute video, then see your own app on a free demo.</p>
        <div className="s-load-3 mx-auto mt-8 max-w-[1000px]"><VslPlayer onBook={onBookEnd} /></div>
        <div className="s-load-4 mt-9 flex flex-col items-center">
          <button type="button" onClick={onBook} className="s-btn s-btn-light s-focus group !h-16 !rounded-full !px-10 text-[1.15rem] shadow-[0_24px_60px_-20px_rgba(2,20,70,.9)] sm:!h-[72px] sm:!px-14 sm:text-[1.3rem]">
            Book your free demo <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden />
          </button>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[14px] font-semibold text-white/90">
            {["20 minutes on video", "See your own app", "Month to month"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4" strokeWidth={3} aria-hidden />{t}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Poster + play → the real video with sound and controls. When it ends, a card offers the demo. */
function VslPlayer({ onBook }: { onBook: () => void }) {
  const [state, setState] = useState<"poster" | "playing" | "ended">("poster");
  const vid = useRef<HTMLVideoElement>(null);
  const marks = useRef(new Set<number>());
  function play() {
    setState("playing"); track("vsl_played", { source: "home_hero" });
    setTimeout(() => { const v = vid.current; if (v) { v.currentTime = 0; v.play().catch(() => {}); } }, 0);
  }
  function onTime(e: React.SyntheticEvent<HTMLVideoElement>) {
    const v = e.currentTarget; if (!v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    for (const [m, ev] of [[25, "vsl_25_percent"], [50, "vsl_50_percent"], [75, "vsl_75_percent"]] as const) {
      if (pct >= m && !marks.current.has(m)) { marks.current.add(m); track(ev, { source: "home_hero" }); }
    }
  }
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[22px] bg-[#04122E] shadow-[0_50px_100px_-30px_rgba(2,20,70,.85)] ring-1 ring-white/25 sm:rounded-[28px]">
      {state !== "poster" && (
        <video ref={vid} src={VSL.src} poster={VSL.poster} controls playsInline preload="auto" onTimeUpdate={onTime}
          onEnded={() => { setState("ended"); track("vsl_completed", { source: "home_hero" }); }}
          className="absolute inset-0 h-full w-full bg-black object-contain" />
      )}
      {state === "poster" && (
        <button type="button" onClick={play} className="s-focus group absolute inset-0" aria-label={`Play the video, ${VSL.length}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={VSL.poster} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#04122E]/70 via-[#04122E]/10 to-transparent" />
          <span className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[var(--s-ocean)] shadow-[0_20px_50px_-10px_rgba(0,0,0,.6)] transition-transform group-hover:scale-105 sm:h-24 sm:w-24">
            <span aria-hidden className="absolute inset-0 rounded-full bg-white/40 s-ping" />
            <Play className="relative ml-1 h-8 w-8 fill-current sm:h-10 sm:w-10" aria-hidden />
          </span>
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 text-left text-white sm:p-6">
            <span className="hidden sm:block"><span className="block text-[17px] font-bold">Why the big chains keep your customers</span><span className="block text-[13px] text-white/75">Andrew, founder of Atlas · sound on</span></span><span className="text-[12.5px] font-semibold text-white/85 sm:hidden">Sound on</span>
            <span className="rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-semibold tabular-nums ring-1 ring-white/25 backdrop-blur">{VSL.length}</span>
          </span>
        </button>
      )}
      {state === "ended" && (
        <div className="absolute inset-0 grid place-items-center bg-[#04122E]/80 p-6 backdrop-blur-sm animate-in fade-in duration-500" role="status">
          <div className="text-center text-white">
            <div className="text-[1.4rem] font-bold tracking-[-0.02em] sm:text-[2rem]">Want to see yours?</div>
            <p className="mt-2 text-[14px] text-white/80 sm:text-[16px]">20 minutes. Your business&apos;s own app, live.</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={onBook} className="s-btn s-btn-light s-focus !h-12">Book my free demo <ArrowRight className="h-4 w-4" aria-hidden /></button>
              <button type="button" onClick={play} className="s-focus inline-flex h-12 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-white/85 hover:text-white"><RotateCcw className="h-4 w-4" aria-hidden />Watch again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── apps in other businesses' brands ───────────── */
function Apps() {
  return (
    <section className="s-section !pb-14 sm:!pb-20" aria-labelledby="apps-title">
      <div className="s-wrap text-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--s-ocean)]">Built on Atlas</p>
        <h2 id="apps-title" className="s-h2 mx-auto mt-3 max-w-[18ch]">Your brand on their phone. Not ours.</h2>
        <p className="s-lead mx-auto mt-4 max-w-[34rem] !text-[var(--s-ink-2)]">Every business gets its own app: its name, its colors, its rewards. Here are a few.</p>
        <ul data-gs="stagger" className="mx-auto mt-12 grid max-w-[1080px] grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
          {APP_MOCKUPS.map((a, i) => (
            <li key={a.id} data-gs-item className={cn("flex flex-col items-center", i % 2 === 1 && "lg:translate-y-8")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.upright} alt={a.alt} width={640} height={1300} loading="lazy" className="w-full max-w-[230px] drop-shadow-[0_30px_40px_rgba(6,20,60,.25)]" />
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--s-paper)] px-3 py-1 text-[13px] font-semibold text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">
                <span className="h-2 w-2 rounded-full" style={{ background: a.color }} aria-hidden />{a.label}
              </span>
            </li>
          ))}
        </ul>
        <div className="mx-auto mt-16 max-w-[860px]">
          <p className="text-[14px] font-semibold text-[var(--s-ink-3)]">Made for independent local businesses</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {TYPES.map((t) => <li key={t} className="rounded-full border border-[var(--s-line)] bg-white px-3.5 py-1.5 text-[14px] font-semibold text-[var(--s-ink)]">{t}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ───────────── what the app does ───────────── */
function Features({ onBook }: { onBook: () => void }) {
  return (
    <section id="features" className="s-section scroll-mt-16 bg-[var(--s-paper)]" aria-labelledby="features-title">
      <div className="s-wrap">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--s-ocean)]">What your app does</p>
            <h2 id="features-title" className="s-h2 mt-3 max-w-[16ch]">Everything that brings them back.</h2>
          </div>
          <button type="button" onClick={onBook} className="s-btn s-btn-primary s-focus shrink-0">See it on a demo <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </div>
        <ul data-gs="stagger" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <li key={f.t} data-gs-item className={cn("group relative flex flex-col overflow-hidden rounded-[24px] p-6 transition-shadow", i === 0 ? "s-ocean text-white shadow-[0_30px_60px_-30px_rgba(11,95,214,.7)]" : "bg-white ring-1 ring-[var(--s-line)] hover:shadow-[0_20px_40px_-28px_rgba(6,24,58,.35)]")}>
              {i === 0 && <span className="s-ocean-img opacity-60" aria-hidden />}
              <span className={cn("relative grid h-11 w-11 place-items-center rounded-2xl", i === 0 ? "bg-white text-[var(--s-ocean)]" : "bg-[var(--s-ice)] text-[var(--s-ocean)]")}><f.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className={cn("relative mt-5 text-[1.12rem] font-bold leading-snug tracking-[-0.01em]", i === 0 ? "text-white" : "text-[var(--s-ink)]")}>{f.t}</h3>
              <p className={cn("relative mt-1.5 text-[14.5px] leading-relaxed", i === 0 ? "text-white/85" : "text-[var(--s-ink-3)]")}>{f.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ───────────── how it works ───────────── */
function How({ onBook }: { onBook: () => void }) {
  return (
    <section className="s-section" aria-labelledby="how-title">
      <div className="s-wrap">
        <div className="text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--s-ocean)]">How it works</p>
          <h2 id="how-title" className="s-h2 mx-auto mt-3 max-w-[18ch]">From demo to your counter in about a week.</h2>
        </div>
        <ol className="relative mx-auto mt-14 grid max-w-[1000px] gap-10 md:grid-cols-3 md:gap-8">
          <span aria-hidden data-gs="draw" className="absolute left-[16%] right-[16%] top-[22px] hidden h-px bg-[var(--s-ocean)]/30 md:block" />
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative text-center">
              <span className="relative z-10 mx-auto grid h-11 w-11 place-items-center rounded-full bg-[var(--s-ocean)] text-[15px] font-bold text-white ring-8 ring-white">{i === 2 ? <QrCode className="h-5 w-5" aria-hidden /> : i + 1}</span>
              <h3 className="mt-5 text-[1.2rem] font-bold tracking-[-0.01em]">{s.t}</h3>
              <p className="s-body mx-auto mt-2 max-w-[18rem] text-[15px]">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 text-center">
          <button type="button" onClick={onBook} className="s-btn s-btn-primary s-focus">Book your free demo <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </div>
      </div>
    </section>
  );
}

/* ───────────── closing ───────────── */
function Closing({ onBook }: { onBook: () => void }) {
  return (
    <section className="s-section !pt-0" aria-labelledby="close-title">
      <div className="s-wrap">
        <div className="s-ocean relative overflow-hidden rounded-[36px] px-6 py-16 text-center sm:py-24">
          <div className="s-ocean-img" aria-hidden />
          <div className="relative">
            <h2 id="close-title" className="s-h2 mx-auto max-w-[16ch] text-white">Your regulars deserve your app.</h2>
            <p className="s-lead mx-auto mt-4 max-w-[32rem]">20 minutes on video. You&apos;ll see your own app and exactly what it costs. Month to month, no contract.</p>
            <button type="button" onClick={onBook} className="s-btn s-btn-light s-focus mt-9 !h-14 !px-9 text-[1.05rem]">Book your free demo <ArrowRight className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--s-line)] bg-white py-10 pb-28 text-[14px] text-[var(--s-ink-3)] lg:pb-10">
      <div className="s-wrap flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-6 w-auto" />
          <span>© {new Date().getFullYear()} · Bakersfield · Morro Bay, California</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
          <Link className="s-focus rounded hover:text-[var(--s-ink)]" href="/med-spas">Med spas</Link>
          <Link className="s-focus rounded hover:text-[var(--s-ink)]" href="/venues">Entertainment venues</Link>
          <Link className="s-focus rounded hover:text-[var(--s-ink)]" href="/login">Log in</Link>
          <a className="s-focus rounded hover:text-[var(--s-ink)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>
          <Link className="s-focus rounded hover:text-[var(--s-ink)]" href="/legal/privacy">Privacy</Link>
          <Link className="s-focus rounded hover:text-[var(--s-ink)]" href="/legal/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}

function MobileBar({ onBook }: { onBook: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--s-line)] bg-white/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
      <button type="button" onClick={onBook} className="s-focus flex w-full items-center justify-center gap-3 text-[1.05rem] font-bold text-[var(--s-ink)]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--s-ocean)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-[15px] w-auto object-contain" />
        </span>Book your free demo <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
