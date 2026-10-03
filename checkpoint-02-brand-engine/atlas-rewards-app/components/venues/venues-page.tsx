"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, Crown, Gift, Megaphone, PartyPopper, Play, Plus, ScanLine, Smartphone, Sparkles, Sun, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { LIB } from "@/lib/landing/live-app-data";
import { track } from "@/lib/landing/analytics";
import { VENUES_FAQ, VENUES_OFFER, VENUES_PROOF, VENUES_STACK, VENUES_TESTIMONIALS, type VenueTestimonial } from "@/lib/landing/venues-offer";
import { LiveApp, type LiveEvent } from "@/components/landing/live-app/live-app";
import { LandingProviders, useLanding } from "@/components/landing/landing-providers";
import { Reveal } from "@/components/landing/reveal";

/**
 * /venues — the Meta ads landing page (CP-177).
 *
 * Built on Sabri Suby's "Sell Like Crazy" sales-page logic, adapted to a
 * founder-led B2B offer: call out the audience → name the leak → show the
 * mechanism → let them USE it → proof → the offer stack → risk reversal and
 * the reason for it → one action (build your app + book) → FAQ → P.S.
 *
 * One objective on the page: get to #build. No site nav, so ad traffic
 * can't wander. Every claim maps to a Live row in the Atlas Messaging
 * Library; copy lives in lib/landing/venues-offer.ts.
 */
const BUILD = "build";

/** Ad attribution: utm_* from the ad URL ride along as the lead's source. */
function useAdSource() {
  const [source, setSource] = useState("venues");
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const parts = ["venues", p.get("utm_source"), p.get("utm_campaign"), p.get("utm_content")].filter(Boolean);
      setSource(parts.join(":").slice(0, 120));
    } catch {
      /* keep default */
    }
  }, []);
  return source;
}

function BuildCta({ where, children = "Build my venue's app free", className }: { where: string; children?: React.ReactNode; className?: string }) {
  const { openDemo } = useLanding();
  return (
    <button
      type="button"
      className={cn("lpv-btn lpv-btn-primary lpv-focus", className)}
      onClick={() => { track("hero_cta_clicked", { source: `venues_${where}` }); openDemo(`venues_${where}`); }}
    >
      {children} <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function VenuesPage({ fontClassName = "" }: { fontClassName?: string }) {
  const source = useAdSource();
  return (
    <LandingProviders fontClassName={fontClassName}>
    <div className={`lpv ${fontClassName} antialiased`}>
      <div className="lpv-ocean" aria-hidden />
      <TopBar />
      <main id="main">
        <Hero />
        <Leak />
        <Pillars />
        <TryIt />
        <Proof />
        <Offer />
        <HowItWorks />
        <Build source={source} />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
    </LandingProviders>
  );
}

/* ───────────────────────── Top bar ───────────────────────── */
function TopBar() {
  const { openDemo } = useLanding();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--v-line)] bg-[#020a16]/70 backdrop-blur-xl">
      <div className="lpv-container flex h-16 items-center justify-between">
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-6 w-auto" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">Atlas Engine</span>
        </span>
        <button type="button" className="lpv-btn lpv-btn-ghost lpv-btn-sm lpv-focus" onClick={() => { track("nav_cta_clicked", { source: "venues_topbar" }); openDemo("venues_topbar"); }}>
          Build my app
        </button>
      </div>
    </header>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-14 md:pb-24 md:pt-20" aria-labelledby="hero-title">
      <div className="lpv-glow left-1/2 top-24 h-72 w-[38rem] -translate-x-1/2 bg-[#1c6f9f]/30" aria-hidden />
      <div className="lpv-container grid items-center gap-14 lg:grid-cols-[1.1fr_auto] lg:gap-16">
        <div>
          <Reveal>
            <p className="lpv-eyebrow">For arcades, batting cages, trampoline parks and fun centers</p>
          </Reveal>
          <Reveal delay={60}>
            <h1 id="hero-title" className="lpv-h1 mt-6">
              Turn first-time guests into <span className="lpv-gold">regulars and members.</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="lpv-lead mt-6 max-w-xl">
              Atlas gives your venue its own app, sends the come-back offers for you, and sells memberships that bill every month, so the families your parties and ads bring in actually return.
            </p>
          </Reveal>
          <Reveal delay={180} className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <BuildCta where="hero" />
            <a href="#try" className="lpv-btn lpv-btn-ghost lpv-focus" onClick={() => track("demo_clicked", { source: "venues_hero", kind: "try" })}>
              <Smartphone className="h-4 w-4" aria-hidden /> Try a real venue&apos;s app
            </a>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-4 text-sm text-[var(--v-dim)]">{VENUES_OFFER.ctaNote}</p>
          </Reveal>
          <Reveal delay={260} className="mt-10">
            <span className="lpv-chip">
              <span className="lpv-dot" aria-hidden /> Live at Flippo&apos;s Arcade &amp; Batting Cage, Morro Bay
            </span>
          </Reveal>
        </div>

        <Reveal delay={160} className="relative mx-auto w-full max-w-[400px]">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-[var(--v-line)] px-6 py-10 sm:px-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedUrl(LIB.arcadeNeon, 900)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-[3px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020a16]/60 via-[#062a44]/55 to-[#020a16]/90" />
            <LiveApp push className="relative" />
          </div>
          <p className="mt-3 text-center text-xs text-[var(--v-dim)]">A live copy of Flippo&apos;s app. Taps are simulated.</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── The leak (problem) ───────────────────────── */
const LEAKS = [
  { icon: PartyPopper, t: "Party guests leave with cake, not a reason to come back.", d: "Every party brings a room of new families. Most venues only save the host's name." },
  { icon: UserX, t: "Regulars drift away and nobody notices.", d: "No one at the desk has time to text the family that hasn't been in for six weeks." },
  { icon: Sun, t: "Weekends are full. Weekdays aren't.", d: "Slow days cost the same to staff and light. Nobody is giving guests a reason to come on a Tuesday." },
];

function Leak() {
  return (
    <section className="lpv-section" aria-labelledby="leak-title">
      <div className="lpv-container">
        <Reveal className="max-w-2xl">
          <p className="lpv-eyebrow">The leak</p>
          <h2 id="leak-title" className="lpv-h2 mt-5">Ads and parties fill your venue once. Then most of those guests never come back.</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {LEAKS.map(({ icon: I, t, d }, i) => (
            <Reveal key={t} delay={i * 80} className="lpv-card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--v-line)] bg-white/5 text-[var(--v-champagne)]">
                <I className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="lpv-h3 mt-5">{t}</h3>
              <p className="lpv-body mt-2">{d}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <p className="lpv-lead mt-10 max-w-2xl">
            Getting a family in the door is the expensive part. Bringing them back is cheap, but only if someone actually does the follow-up. <span className="text-white">That&apos;s the job Atlas takes off your plate.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Three pillars (mechanism) ───────────────────────── */
const PILLARS = [
  {
    icon: Smartphone,
    k: "01",
    t: "Your own app",
    d: "Your name and logo on every guest's phone. Rewards, booking, waivers and offers in one place, opened from a QR code at the desk.",
    pts: ["Points and a rewards store", "Online booking and party packages", "Digital waivers"],
  },
  {
    icon: Megaphone,
    k: "02",
    t: "Follow-ups, done for you",
    d: "Instead of remembering every follow-up yourself, Atlas sends them: welcome, birthday, holiday and we-miss-you offers that expire so guests act.",
    pts: ["Come-back offers that send themselves", "Slow-day and seasonal campaigns planned with you", "You approve once, we handle the rest"],
    featured: true,
  },
  {
    icon: Crown,
    k: "03",
    t: "Memberships that pay monthly",
    d: "Turn regulars into members who pay every month and visit more. Sold right in the app, paid straight into your own Stripe account.",
    pts: ["Monthly plans and passes", "Automatic billing and renewals", "Member perks and member-only offers"],
  },
];

function Pillars() {
  return (
    <section className="lpv-section" aria-labelledby="pillars-title">
      <div className="lpv-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lpv-eyebrow justify-center">How Atlas plugs it</p>
          <h2 id="pillars-title" className="lpv-h2 mt-5">One app. The follow-ups handled. Revenue that repeats.</h2>
        </Reveal>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {PILLARS.map(({ icon: I, k, t, d, pts, featured }, i) => (
            <Reveal key={t} delay={i * 90} className={cn("lpv-card flex flex-col p-7", featured && "lpv-card-gold")}>
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-[var(--v-sea)]">
                  <I className="h-5 w-5" aria-hidden />
                </span>
                <span className="lpv-num text-sm text-[var(--v-dim)]">{k}</span>
              </div>
              <h3 className="mt-6 text-[1.35rem] font-semibold tracking-[-0.02em] text-white">{t}</h3>
              <p className="lpv-body mt-3">{d}</p>
              <div className="lpv-rule my-6" />
              <ul className="grid gap-2.5">
                {pts.map((p) => (
                  <li key={p} className="flex gap-2.5 text-[15px] text-[var(--v-ink)]">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--v-champagne)]" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Try it (interactive) ───────────────────────── */
const TASKS: Array<{ id: Exclude<LiveEvent, "tab">; t: string; icon: typeof ScanLine }> = [
  { id: "checkin", t: "Check in at the desk", icon: ScanLine },
  { id: "spin", t: "Take the daily spin", icon: Sparkles },
  { id: "book", t: "Book a cage", icon: CalendarDays },
  { id: "redeem", t: "Redeem a reward", icon: Gift },
];

function TryIt() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const onEvent = useCallback((e: LiveEvent) => {
    if (e === "tab") return;
    setDone((d) => {
      if (d[e]) return d;
      track("interactive_demo_used", { demo: "venues_live_app", step: e });
      return { ...d, [e]: true };
    });
  }, []);
  const count = TASKS.filter((t) => done[t.id]).length;
  return (
    <section id="try" className="lpv-section scroll-mt-20" aria-labelledby="try-title">
      <div className="lpv-container grid items-center gap-14 lg:grid-cols-[1fr_auto]">
        <div>
          <Reveal>
            <p className="lpv-eyebrow">Don&apos;t watch a demo</p>
            <h2 id="try-title" className="lpv-h2 mt-5 max-w-xl">Use the app a real venue&apos;s guests use every week.</h2>
            <p className="lpv-lead mt-5 max-w-lg">This is Flippo&apos;s app in Morro Bay: their cages, their rewards, their hours. Tap around like a guest would.</p>
          </Reveal>
          <ol className="mt-9 grid gap-3 sm:grid-cols-2">
            {TASKS.map(({ id, t, icon: I }, i) => {
              const ok = !!done[id];
              return (
                <Reveal as="li" key={id} delay={i * 60} className={cn("lpv-card flex items-center gap-3 p-4 transition-colors duration-500", ok && "border-emerald-400/40 bg-emerald-400/10")}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", ok ? "bg-emerald-400 text-[#04121f]" : "bg-white/5 text-[var(--v-sea)]")}>
                    {ok ? <Check className="h-4 w-4" aria-hidden /> : <I className="h-4 w-4" aria-hidden />}
                  </span>
                  <span className="text-[15px] font-medium text-white">{t}</span>
                </Reveal>
              );
            })}
          </ol>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <BuildCta where="try">{count === TASKS.length ? "Get this with my logo" : "See it with my logo"}</BuildCta>
            <p className="text-sm text-[var(--v-dim)]" aria-live="polite">
              {count === 0 ? "Nothing here touches Flippo's real data." : `${count} of ${TASKS.length} done`}
            </p>
          </div>
        </div>
        <Reveal delay={120} className="mx-auto w-full max-w-[380px]">
          <div className="relative rounded-[2.5rem] border border-[var(--v-line)] bg-gradient-to-b from-[#0a3d62]/60 to-[#020a16]/60 px-6 py-10 sm:px-10">
            <div className="lpv-glow left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 bg-[#0284c7]/40" aria-hidden />
            <LiveApp onEvent={onEvent} className="relative" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Proof ───────────────────────── */
function Proof() {
  const isProd = process.env.NODE_ENV === "production";
  const items = VENUES_TESTIMONIALS.filter((t) => t.embed || !isProd);
  return (
    <section className="lpv-section" aria-labelledby="proof-title">
      <div className="lpv-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lpv-eyebrow justify-center">In their words</p>
          <h2 id="proof-title" className="lpv-h2 mt-5">Hear it from the people using it.</h2>
        </Reveal>
        {items.length > 0 && (
          <ul className={cn("mx-auto mt-12 grid gap-5 sm:grid-cols-2", items.length >= 3 ? "lg:grid-cols-4" : "max-w-3xl")}>
            {items.map((t, i) => (
              <Reveal as="li" key={t.id} delay={i * 70}>
                <VideoCard t={t} />
              </Reveal>
            ))}
          </ul>
        )}
        <div className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2">
          {VENUES_PROOF.map((p) => (
            <Reveal key={p.big} className="lpv-card p-6">
              <p className="lpv-num lpv-sea text-5xl">{p.big}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--v-ink)]">{p.small}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--v-dim)]">Source: {p.source}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function VideoCard({ t }: { t: VenueTestimonial }) {
  const [playing, setPlaying] = useState(false);
  const has = !!t.embed;
  return (
    <figure className={cn("lpv-card overflow-hidden", !has && "lpv-placeholder")}>
      <div className="relative aspect-[9/14] bg-[#04182e]">
        {playing && t.embed ? (
          <iframe src={`${t.embed}${t.embed.includes("?") ? "&" : "?"}autoplay=1`} title={`${t.name}, ${t.role}`} allow="autoplay; fullscreen; picture-in-picture" className="absolute inset-0 h-full w-full" />
        ) : (
          <button
            type="button"
            disabled={!has}
            onClick={() => {
              setPlaying(true);
              track("vsl_played", { source: "venues_testimonial", id: t.id });
            }}
            className="lpv-focus group absolute inset-0 block h-full w-full"
            aria-label={has ? `Play video: ${t.name}` : `Video coming soon: ${t.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.poster} alt="" loading="lazy" className={cn("h-full w-full object-cover transition-transform duration-700", has ? "group-hover:scale-105" : "opacity-40 saturate-50")} />
            <span className="absolute inset-0 bg-gradient-to-t from-[#020a16]/90 via-[#020a16]/15 to-transparent" />
            <span className={cn("absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full", has ? "bg-[var(--v-champagne)] text-[#0a1424] transition-transform group-hover:scale-110" : "border border-dashed border-white/60 text-white")}>
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
            </span>
            {!has && <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white">Dev only: add video</span>}
          </button>
        )}
      </div>
      <figcaption className="p-5">
        {t.quote && <p className="text-[15px] leading-relaxed text-white">&ldquo;{t.quote}&rdquo;</p>}
        <p className={cn("text-sm font-semibold text-white", t.quote && "mt-3")}>{t.name}</p>
        <p className="text-[13px] text-[var(--v-dim)]">{t.role}</p>
      </figcaption>
    </figure>
  );
}

/* ───────────────────────── The offer stack ───────────────────────── */
function Offer() {
  return (
    <section className="lpv-section" aria-labelledby="offer-title">
      <div className="lpv-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lpv-eyebrow justify-center">Everything your venue gets</p>
          <h2 id="offer-title" className="lpv-h2 mt-5">The whole repeat-visit system, set up with your team.</h2>
        </Reveal>
        <Reveal delay={80} className="lpv-card lpv-card-gold mx-auto mt-12 max-w-4xl p-6 sm:p-10">
          <ul className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            {VENUES_STACK.map((s) => (
              <li key={s.t} className="flex gap-3.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--v-champagne)]/15 text-[var(--v-champagne)]">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[15.5px] font-semibold text-white">{s.t}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-[var(--v-mute)]">{s.d}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="lpv-rule my-9" />
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xl font-semibold tracking-[-0.02em] text-white">{VENUES_OFFER.riskReversal}</p>
              <p className="lpv-body mt-2 max-w-xl">{VENUES_OFFER.rationale}</p>
              {VENUES_OFFER.priceLine && <p className="mt-3 text-[15px] text-[var(--v-champagne)]">{VENUES_OFFER.priceLine}</p>}
              {VENUES_OFFER.capacityLine && <p className="mt-3 text-sm text-[var(--v-champagne)]">{VENUES_OFFER.capacityLine}</p>}
            </div>
            <BuildCta where="offer" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── How it works ───────────────────────── */
const STEPS = [
  { t: "Build your app here", d: "Name it, pick a color or drop in your logo. It's a working app in about 30 seconds." },
  { t: "Book a 20-minute walkthrough", d: "We bring your app to the call and answer setup, staff and pricing questions. No pressure, no contract." },
  { t: "We set it up with your team", d: "QR signs at the desk, waivers, rewards, your first membership and come-back offers. Staff trained in about 15 minutes." },
];

function HowItWorks() {
  return (
    <section className="lpv-section" aria-labelledby="how-title">
      <div className="lpv-container">
        <Reveal className="max-w-2xl">
          <p className="lpv-eyebrow">How it works</p>
          <h2 id="how-title" className="lpv-h2 mt-5">Three steps, and you don&apos;t need to be a tech person for any of them.</h2>
        </Reveal>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 80} className="lpv-card p-7">
              <span className="lpv-num lpv-gold text-4xl">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="lpv-h3 mt-5">{s.t}</h3>
              <p className="lpv-body mt-2">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────── Build + book (the one action) ───────────────────────── */
function Build({ source }: { source: string }) {
  const { openDemo } = useLanding();
  return (
    <section id={BUILD} className="lpv-section scroll-mt-16" aria-labelledby="build-title">
      <div className="lpv-glow left-1/2 top-40 h-80 w-[44rem] -translate-x-1/2 bg-[#1c6f9f]/25" aria-hidden />
      <div className="lpv-container relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lpv-eyebrow justify-center">Your app, before we talk</p>
          <h2 id="build-title" className="lpv-h2 mt-5">Build your venue&apos;s app, see what it could add, then pick a time.</h2>
          <p className="lpv-lead mt-5">Six quick questions, about a minute. You&apos;ll see your own app take shape and an estimate of the extra revenue it could bring in.</p>
          <button
            type="button"
            className="lpv-btn lpv-btn-primary lpv-focus mt-8"
            onClick={() => { track("hero_cta_clicked", { source: "venues_build_section" }); openDemo(source); }}
          >
            Start the 1-minute quiz <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */
function Faq() {
  return (
    <section className="lpv-section" aria-labelledby="faq-title">
      <div className="lpv-container max-w-3xl">
        <Reveal className="text-center">
          <p className="lpv-eyebrow justify-center">Straight answers</p>
          <h2 id="faq-title" className="lpv-h2 mt-5">What owners ask us first.</h2>
        </Reveal>
        <div className="mt-10 grid gap-3">
          {VENUES_FAQ.map((f) => (
            <details key={f.q} className="lpv-card group px-6 py-5" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && track("faq_opened", { source: "venues", q: f.q.slice(0, 60) })}>
              <summary className="lpv-focus flex items-center justify-between gap-4 rounded-md text-left text-[16px] font-semibold text-white">
                {f.q}
                <Plus className="lpv-plus h-5 w-5 shrink-0 text-[var(--v-champagne)]" aria-hidden />
              </summary>
              <p className="lpv-body mt-3">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Closing + P.S. ───────────────────────── */
function Closing() {
  return (
    <section className="lpv-section pt-0" aria-labelledby="close-title">
      <div className="lpv-container">
        <Reveal className="lpv-card lpv-card-gold mx-auto max-w-4xl overflow-hidden p-8 text-center sm:p-14">
          <h2 id="close-title" className="lpv-h2">Your next party is already on the calendar.</h2>
          <p className="lpv-lead mx-auto mt-5 max-w-xl">Make sure those families have a reason to come back. See your venue&apos;s app first; it costs nothing to look.</p>
          <div className="mt-9 flex justify-center">
            <BuildCta where="closing" />
          </div>
          <p className="mx-auto mt-10 max-w-xl text-left text-[15px] leading-relaxed text-[var(--v-mute)]">
            <span className="font-semibold text-[var(--v-champagne)]">P.S.</span> If you scrolled straight here: Atlas gives your venue its own app, sends the come-back offers for you and sells memberships that bill monthly. {VENUES_OFFER.riskReversal}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Footer ───────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-[var(--v-line)] py-10">
      <div className="lpv-container flex flex-col items-start justify-between gap-4 text-sm text-[var(--v-dim)] sm:flex-row sm:items-center">
        <span>© {new Date().getFullYear()} Atlas Engine · Built in California</span>
        <span className="flex flex-wrap gap-x-5 gap-y-2">
          <a className="lpv-focus hover:text-white" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>
          <a className="lpv-focus hover:text-white" href="/legal/privacy">Privacy</a>
          <a className="lpv-focus hover:text-white" href="/legal/terms">Terms</a>
        </span>
      </div>
    </footer>
  );
}
