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
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, Menu, Minus, Play, Plus, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import { LandingProviders, useLanding } from "@/components/landing/landing-providers";
import { interClass } from "@/lib/landing/font";
import { CONTACT_EMAIL, IOS_APP_URL } from "@/lib/landing/config";
import { MEDSPA_OFFER_COPY, MEDSPA_STACK } from "@/lib/landing/medspa-offer";
import { TESTIMONIALS } from "@/lib/landing/testimonials";
import { MedspaQuiz } from "@/components/medspa/medspa-quiz";
import { DeskListMock, PhoneShell } from "./site-mocks";
import { SHOW_REVIEW_SLOTS, SITE_BADGES, SITE_REVIEWS } from "@/lib/landing/site-reviews";
// CP-194: Dermis-style client results band under the hero.
import { ClientResults } from "./client-results";
// CP-196: GSAP scroll motion, wired from data-gs attributes (components/site/motion.ts).
import { useSiteMotion } from "./motion";
import { IconDesk, IconFinancing, IconMembership, IconRecall, IconRewards } from "./feature-icons";


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
  const rootRef = useRef<HTMLDivElement>(null);
  useSiteMotion(rootRef);
  return (
    <div ref={rootRef} className="site overflow-x-clip">
      <Nav onStart={() => start("nav")} />
      <main id="main">
        <Showcase onStart={() => start("hero")} />
        <ClientResults />
        <Desk />
        <Week />
        <Pricing onStart={() => start("pricing")} />
        <Compare />
        <ReviewsBand />
        <Team />
        <Closing onStart={() => start("closing")} />
      </main>
      <Footer />
      <MobileBar onStart={() => start("sticky_bar")} />
    </div>
  );
}

/* ───────────── nav ───────────── */
const LINKS = [{ href: "#product", t: "Product" }, { href: "#desk", t: "Front desk" }, { href: "#pricing", t: "Pricing" }];

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
type Feature = { id: string; label: string; Icon: (p: { on?: boolean; className?: string }) => React.ReactElement; blurb: string; title: string; facts: [string, string][]; status?: string; screen: React.ReactNode };
const DWELL = 4500;

function Showcase({ onStart }: { onStart: () => void }) {
  const features: Feature[] = [
    { id: "recall", label: "Recall reminders", Icon: IconRecall, title: "She comes back on time, not when she remembers.", blurb: "Every treatment carries how long results last. Her app shows the countdown; she hears from you before she forgets you.", facts: [["Per treatment", "Each treatment on your menu carries its own recall window."], ["One tap", "The desk logs today's treatment; her app updates on the spot."]], screen: <AppShot src="/landing/app-screens/shop.jpg" alt="A practice's app with a treatment package to rebook" /> },
    { id: "members", label: "Memberships", Icon: IconMembership, title: "Revenue on the first of the month.", blurb: "Sold in the app, billed through your own Stripe, banking a monthly credit toward treatments.", facts: [["Your Stripe", "Dues settle in the practice's own account, never ours."], ["Banked credit", "A monthly credit toward treatments, shown on her card."]], screen: <AppShot src="/landing/app-screens/membership.jpg" alt="The membership tab in a practice's app" /> },
    { id: "rewards", label: "Rewards", Icon: IconRewards, title: "Points for the things that grow a practice.", blurb: "Points for visits, reviews and referrals, redeemed on add-ons and treatments you choose.", facts: [["Reviews + referrals", "The two actions worth paying for, rewarded automatically."], ["Your catalog", "Redeemed on add-ons and treatments you pick and price."]], screen: <AppShot src="/landing/app-screens/rewards.jpg" alt="The rewards tab in a practice's app" /> },
    { id: "financing", label: "Patient financing", Icon: IconFinancing, status: "In development", title: "A $720 treatment becomes a yes today.", blurb: "Pay over time at checkout, through the practice's own Stripe, so a $720 treatment is a yes today.", facts: [["In development", "On the roadmap; not live in any practice yet."], ["Through Stripe", "Pay-over-time options on the practice's own Stripe account, no new vendor."]], screen: <AppShot src="/landing/app-screens/shop.jpg" alt="The shop tab with packages and member pricing" /> },
    { id: "desk", label: "Front desk", Icon: IconDesk, title: "A list, not a dashboard.", blurb: "Who is due, who is overdue, who already booked. Open her, log the treatment, or text the reminder you wrote.", facts: [["Who's due", "Overdue, due within two weeks, coming up: one screen."], ["Text or open", "Send the reminder you wrote, or log the treatment, from the list."]], screen: <div className="relative flex h-full items-center justify-center p-3"><DeskListMock className="!w-full scale-[.92]" /></div> },
  ];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const n = desktop ? features.length - 1 : features.length; // desktop tab row has no Front desk tab
    const t = setTimeout(() => setI((k) => (k + 1) % n), DWELL);
    return () => clearTimeout(t);
  }, [i, paused, features.length]);
  return (
    <section id="product" className="relative -mt-[68px] overflow-hidden pt-[100px] sm:pt-[124px]" aria-labelledby="hero-title">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="s-blob absolute -right-[12%] -top-[25%] h-[820px] w-[820px] rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.22),transparent)]" />
        <div className="absolute -left-[18%] top-[35%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(11,95,214,.10),transparent)]" />
      </div>
      {/* ── Desktop (lg+): Dermis desktop geometry. Centered headline, "See how", the phone centered over a row of
          feature tabs, running down into an ocean band that explains the active feature. ── */}
      <div className="hidden lg:block" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="s-wrap relative">
          <Guides />
          <div className="relative z-[1] pt-6 text-center">
            <h1 id="hero-title-lg" className="s-display s-load-1 mx-auto !text-[clamp(3rem,2rem+2.6vw,4.3rem)]">Sell more treatments &amp; memberships.</h1>
            <div className="s-load-2 mt-6 text-[1.45rem] font-semibold text-[var(--s-ink-2)]">See how</div>
            <ArrowDown className="s-arrow s-load-3 mx-auto mt-3 h-10 w-10 stroke-[1.25] text-[var(--s-ink-2)]" aria-hidden />
          </div>

          <div className="relative mt-16">
            {/* Tab row */}
            {/* Four tabs around a middle slot the phone occupies (Dermis). Front desk has its own band below. */}
            <ol className="s-load-3 relative z-[1] grid grid-cols-5 border-t border-[var(--s-line)]" aria-label="What Atlas runs">
              {features.filter((f) => f.id !== "desk").map((f, idx) => {
                const k = features.indexOf(f);
                const on = k === i;
                return (
                  <li key={f.id} className={cn("relative", idx === 2 && "col-start-4")}>
                    {on && <span aria-hidden className="absolute inset-x-0 -top-px h-[3px] bg-[var(--s-ocean)]" />}
                    {on && <span aria-hidden className="absolute inset-0 bg-gradient-to-b from-[var(--s-ice)] to-transparent" />}
                    <button type="button" onClick={() => { setI(k); track("demo_clicked", { source: "site_showcase", kind: f.id }); }} aria-current={on ? "true" : undefined}
                      className={cn("s-focus relative flex h-[136px] w-full flex-col items-center justify-center gap-3 px-3 text-center transition-colors", on ? "text-[var(--s-ink)]" : "text-[var(--s-ink-3)] hover:text-[var(--s-ink-2)]")}>
                      <f.Icon on={on} className={cn("h-12 w-12 transition-transform duration-300", on && "-translate-y-0.5 scale-105")} />
                      <span className={cn("text-[15px] leading-tight", on ? "font-bold" : "font-semibold")}>{f.label}{f.status && <span className="mx-auto mt-1.5 block w-fit rounded-full bg-[var(--s-ice)] px-2 py-0.5 text-[10px] font-bold text-[var(--s-ocean-deep)]">{f.status}</span>}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Ocean band: full-bleed, the phone hangs into it */}
        <div className="s-ocean relative">
          <div className="s-ocean-img opacity-80" aria-hidden />
          <div className="s-wrap relative grid min-h-[560px] grid-cols-[1fr_380px_1fr] gap-10 py-20">
            <Guides light />
            <div key={`t-${i}`} className="s-load-1 relative z-[1] self-center pr-6">
              <h2 className="s-h2 !text-[clamp(1.6rem,1.2rem+1.1vw,2.2rem)] text-white">{features[i].title}</h2>
              <p className="s-lead mt-5 max-w-[26rem] text-[1.05rem] text-white/85">{features[i].blurb}</p>
              <button type="button" onClick={onStart} className="s-btn s-btn-light s-focus mt-8">Build my app <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div aria-hidden />
            <dl key={`f-${i}`} className="s-load-2 relative z-[1] flex flex-col justify-center gap-9 pl-6">
              {features[i].facts.map(([big, small]) => (
                <div key={big} className="border-l-2 border-[#9BD0FF] pl-6">
                  <dt className="text-[1.6rem] font-extrabold leading-none text-white">{big}</dt>
                  <dd className="mt-2 max-w-[22rem] text-[15px] leading-snug text-white/85">{small}</dd>
                </div>
              ))}
            </dl>
          </div>
          {/* Phone: anchored to the band, lifted up over the tab row */}
          <div className="absolute left-1/2 top-0 z-[2] -translate-x-1/2 -translate-y-[150px]">
            <PhoneShell tilt={false}>
              {features.map((f, k) => <div key={f.id} className={cn("s-screen", k === i && "s-on")} aria-hidden={k !== i}>{f.screen}</div>)}
            </PhoneShell>
          </div>
        </div>
      </div>

      {/* ── Phones and tablets: Dermis mobile geometry (headline, rail left, phone right). ── */}
      {/* Dermis geometry: headline over everything; below it a narrow rail on the left and the phone on the right,
          on every screen size. On phones the rail is icon-over-label and the phone hangs off the right edge. */}
      <div className="s-wrap relative grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-6 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-x-8 lg:hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
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
                  <f.Icon on={on} className="h-10 w-10 shrink-0" />
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

/** CP-200: a real screenshot of a live practice app inside the phone frame (status bar cropped; the frame draws its own). */
export function AppShot({ src, alt }: { src: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full bg-white object-cover object-bottom" />;
}

/** Faint vertical column guides, like Dermis. Light variant on the ocean band. */
function Guides({ light = false }: { light?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-4 right-4 grid grid-cols-5 sm:left-8 sm:right-8">
      {[0, 1, 2, 3, 4].map((n) => <span key={n} className={cn("border-l", light ? "border-white/15" : "border-[var(--s-line)]/70", n === 4 && "border-r")} />)}
    </div>
  );
}

/** Dermis keeps the CTA pinned on phones. Hidden on desktop, hidden once the closing section is in view. */
function MobileBar({ onStart }: { onStart: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--s-line)] bg-white/85 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
      <button type="button" onClick={onStart} className="s-focus flex w-full items-center justify-center gap-3 text-[1.1rem] font-bold text-[var(--s-ink)]">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[var(--s-ocean)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-[15px] w-auto object-contain" /></span>Build my app in 60 seconds <ArrowRight className="h-5 w-5" />
      </button>
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
          <div data-gs="parallax" data-gs-y="30"><DeskListMock className="relative !w-full" /></div>
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
        <ol ref={v.ref} data-gs="pop" className={cn("relative mt-16 grid gap-10 md:grid-cols-4 md:gap-8", v.inView && "s-in")}>
          {/* CP-196: the line between the steps draws as the section scrolls by (across on desktop, down on phones) */}
          <span aria-hidden className="pointer-events-none absolute left-[18px] right-0 top-[17px] hidden h-[2px] bg-[var(--s-ice)] md:block"><span data-gs="draw" data-gs-axis="x" className="block h-full w-full bg-[var(--s-ocean)]" /></span>
          <span aria-hidden className="pointer-events-none absolute bottom-6 left-[17px] top-[18px] w-[2px] bg-[var(--s-ice)] md:hidden"><span data-gs="draw" data-gs-axis="y" className="block h-full w-full bg-[var(--s-ocean)]" /></span>
          {WEEK.map((s, i) => (
            <li key={s.t} className="s-reveal relative max-md:pl-14" style={{ transitionDelay: `${i * 0.12}s` }}>
              <div className="flex items-center gap-3"><span data-gs-pop className="relative z-10 grid h-9 w-9 place-items-center rounded-full bg-[var(--s-ocean)] text-[0.95rem] font-bold text-white ring-[6px] ring-white max-md:absolute max-md:left-0 max-md:top-0">{i + 1}</span><span className="relative z-10 text-[13px] font-semibold text-[var(--s-ocean)] max-md:leading-9 md:-ml-1.5 md:bg-white md:px-2">{s.when}</span></div>
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
          <dl data-gs="stagger" className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {MEDSPA_STACK.map((s) => <div key={s.t} data-gs-item><dt className="font-semibold">{s.t}</dt><dd className="s-small mt-1 leading-relaxed">{s.d}</dd></div>)}
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ───────────── compare ───────────── */
// CP-194: Atlas first and highlighted; every answer carries a mark (yes / partly / no).
type Mark = "yes" | "part" | "no";
const COMPARE: { q: string; atlas: string; others: [[Mark, string], [Mark, string]] }[] = [
  { q: "Whose name is on the app?", atlas: "Yours", others: [["no", "Theirs; you're a listing"], ["no", "Your POS vendor's"]] },
  { q: "Tells a patient when she's due?", atlas: "Yes, per treatment", others: [["no", "No"], ["no", "No"]] },
  { q: "Memberships billed to your Stripe?", atlas: "Yes, your account", others: [["no", "Rarely"], ["part", "Sometimes, with fees"]] },
  { q: "Front-desk list of who to call?", atlas: "Yes, every morning", others: [["no", "No"], ["part", "Reports, if you dig"]] },
  { q: "Who sets it up?", atlas: "We do, with you", others: [["no", "You, from a help center"], ["no", "You, from a help center"]] },
  { q: "Contract", atlas: "Month to month", others: [["part", "Varies"], ["no", "Often annual"]] },
];
function MarkDot({ m }: { m: Mark }) {
  if (m === "yes") return <span data-gs-pop className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[var(--s-ocean)]"><Check className="h-3.5 w-3.5" strokeWidth={3.2} /></span>;
  if (m === "part") return <span data-gs-pop className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#FFF3DC] text-[#B7791F]"><Minus className="h-3.5 w-3.5" strokeWidth={3} /></span>;
  return <span data-gs-pop className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#F1F3F6] text-[#9AA7B6]"><X className="h-3.5 w-3.5" strokeWidth={3} /></span>;
}
/** CP-201: also used on /medspa. */
export function Compare() {
  const rows = COMPARE.length;
  return (
    <section className="s-section" aria-labelledby="cmp-title">
      <div className="s-wrap">
        <h2 id="cmp-title" className="s-h2 max-w-[18ch]">Six questions to ask before you sign anything.</h2>
        {/* Phones: one card per question, Atlas answer first in blue */}
        <ol className="mt-10 space-y-3 md:hidden">
          {COMPARE.map((r) => (
            <li key={r.q} data-gs="pop" className="overflow-hidden rounded-[22px] border border-[var(--s-line)] bg-white">
              <div className="px-5 pb-3 pt-4 text-[16px] font-semibold text-[var(--s-ink)]">{r.q}</div>
              <div className="mx-2 flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold text-white" style={{ background: "linear-gradient(135deg, #2C93FF, #0B5FD6 60%, #06318F)" }}>
                <MarkDot m="yes" /><span className="flex-1">{r.atlas}</span><span className="text-[12px] font-medium text-white/75">Atlas</span>
              </div>
              <dl className="grid grid-cols-2 gap-px bg-[var(--s-line)] pt-px">
                {r.others.map(([m, t], j) => (
                  <div key={j} className="bg-white px-4 py-3">
                    <dt className="text-[12px] text-[var(--s-ink-3)]">{j === 0 ? "Marketplace apps" : "POS loyalty add-on"}</dt>
                    <dd className="mt-1.5 flex items-start gap-2 text-[14px] leading-snug text-[var(--s-ink-2)]"><MarkDot m={m} />{t}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
        <div className="mt-12 hidden pb-6 pt-4 md:block">
          <div role="table" data-gs="pop" aria-label="Atlas compared with marketplace apps and POS loyalty add-ons"
            className="relative grid grid-cols-[1.35fr_1.15fr_1fr_1fr] rounded-[28px] border border-[var(--s-line)] bg-white shadow-[0_30px_60px_-45px_rgba(6,49,143,.25)]"
            style={{ gridTemplateRows: `auto repeat(${rows}, minmax(0,auto))` }}>
            {/* The Atlas column: one raised blue card behind the second column, header to last row */}
            <div aria-hidden className="relative z-0 col-start-2 -my-4 overflow-hidden rounded-[24px] shadow-[0_26px_50px_-22px_rgba(11,95,214,.75)]"
              style={{ gridRow: `1 / span ${rows + 1}`, background: "linear-gradient(170deg, #2C93FF 0%, #0B5FD6 55%, #06318F 100%)" }}>
              <div className="absolute inset-0 bg-[url('/landing/blue-lines.jpg')] bg-cover bg-center opacity-40 mix-blend-screen" />
            </div>
            <div role="row" className="contents">
              <div role="columnheader" className="row-start-1 col-start-1 p-6" />
              <div role="columnheader" className="relative z-10 row-start-1 col-start-2 flex items-center gap-2.5 p-6 pt-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/landing/atlas-icon-white.png" alt="" className="h-6 w-auto" />
                <span className="text-[17px] font-bold text-white">Atlas</span>
              </div>
              <div role="columnheader" className="row-start-1 col-start-3 p-6 text-[14px] font-medium text-[var(--s-ink-3)]">Marketplace apps</div>
              <div role="columnheader" className="row-start-1 col-start-4 p-6 text-[14px] font-medium text-[var(--s-ink-3)]">POS loyalty add-on</div>
            </div>
            {COMPARE.map((r, k) => {
              const line = k < rows - 1 ? "border-b" : "";
              const row = { gridRow: k + 2 };
              return (
                <div role="row" key={r.q} className="contents">
                  <div role="rowheader" style={row} className={cn("col-start-1 flex items-center border-[var(--s-line)] px-6 py-5 text-[15.5px] font-semibold text-[var(--s-ink)]", line)}>{r.q}</div>
                  <div role="cell" style={row} className={cn("relative z-10 col-start-2 mx-3 flex items-center gap-3 border-white/20 px-3 py-5 text-[15.5px] font-semibold text-white", line)}><MarkDot m="yes" />{r.atlas}</div>
                  {r.others.map(([m, t], j) => (
                    <div role="cell" key={j} style={row} className={cn("flex items-center gap-3 border-[var(--s-line)] px-6 py-5 text-[15px] text-[var(--s-ink-2)]", j === 0 ? "col-start-3" : "col-start-4", line)}><MarkDot m={m} />{t}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <p className="s-small mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--s-ocean)] text-white"><Check className="h-3 w-3" strokeWidth={3.2} /></span>Yes</span>
          <span className="flex items-center gap-2"><MarkDot m="part" />Partly</span>
          <span className="flex items-center gap-2"><MarkDot m="no" />No</span>
        </p>
      </div>
    </section>
  );
}

/* ───────────── reviews band (Owner-style): ocean panel, badges, cards sliding across ───────────── */
/** CP-201: also used on /medspa. */
export function ReviewsBand() {
  // CP-191: all three Flippo's clips, playable in place (not inside the moving row).
  const videos = TESTIMONIALS.filter((t) => t.embed);
  const real = SITE_REVIEWS.filter((r) => r.quote);
  const cards = SHOW_REVIEW_SLOTS ? SITE_REVIEWS : real;
  if (videos.length === 0 && cards.length === 0) return null;
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
          </div>

          {/* Videos: real people at Flippo's, our first business. Static so they're easy to play. */}
          {videos.length > 0 && (
            <div className="relative mt-12 px-5 sm:px-10">
              <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
                {videos.map((v) => (
                  <figure key={v.id} className="w-[82%] shrink-0 snap-start overflow-hidden rounded-3xl bg-white/95 p-2.5 shadow-[0_30px_60px_-40px_rgba(6,24,58,.8)] sm:w-[60%] lg:w-auto">
                    <div className="relative overflow-hidden rounded-2xl bg-[var(--s-ocean-deep)]" style={{ aspectRatio: v.aspect ?? "16 / 9" }}>
                      <iframe src={v.embed!} title={`${v.name}, ${v.role}`} loading="lazy" allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen className="absolute inset-0 h-full w-full" />
                    </div>
                    <figcaption className="px-2 pb-1.5 pt-3">
                      <div className="text-[15px] font-bold text-[var(--s-ink)]">{v.name}</div>
                      <div className="text-[12px] text-[var(--s-ink-3)]">{v.role}</div>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="s-small mt-4 text-center text-white/80">Flippo&apos;s is an arcade and batting cage, the first business on Atlas. Med spa owners are next{real.length === 0 ? "; their words land below as they come in" : ""}.</p>
            </div>
          )}

          {/* Cards slide across; pause on hover. The whole set renders twice so the loop has no seam. */}
          <div className="s-marquee-wrap relative mt-12 overflow-hidden">
            <div className="s-marquee flex w-max gap-4 px-4">
              {[0, 1].map((pass) => (
                <div key={pass} className="flex gap-4" aria-hidden={pass === 1}>
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

/* ───────────── team: meet the founders (Oct 2026) ─────────────
 * Photo: public/landing/founders.jpg (all four, uncropped; team-sunset.jpg is no longer used). Names: add them to FOUNDER_NAMES (left to right in
 * the main photo) and a caption appears under it; while empty, no caption shows. */
const FOUNDER_NAMES: string[] = [];
function Team() {
  const v = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <section id="founders" className="s-section scroll-mt-16" aria-labelledby="team-title">
      <div ref={v.ref} className={cn("s-wrap grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16", v.inView && "s-in")}>
        <div>
          <p className="s-reveal text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]">The team behind Atlas</p>
          <h2 id="team-title" className="s-h2 s-reveal mt-3 max-w-[14ch]">Meet the founders.</h2>
          <p className="s-lead s-reveal s-d1 mt-6 max-w-[31rem]">We&apos;re a small team of engineers who grew up together on California&apos;s Central Coast. We build Atlas ourselves, and when you sign up you work with us directly: the people who wrote the software set up your practice and pick up when you call.</p>
          <ul className="s-reveal s-d2 mt-8 grid gap-6 sm:grid-cols-3">
            {[["Founders on every call", "No account managers or call centers. You talk to the people who built it."], ["Hands-on setup", "Your menu, providers and membership, loaded with you in person or on video."], ["Built in California", "Designed, built and supported from the Central Coast."]].map(([t, d]) => <li key={t}><div className="font-semibold">{t}</div><div className="s-small mt-1">{d}</div></li>)}
          </ul>
        </div>
        <figure className="s-reveal s-d1">
          <div className="overflow-hidden rounded-[32px] shadow-[0_40px_80px_-40px_rgba(6,49,143,.45)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/founders.jpg" alt="The four founders of Atlas Engine on a ballfield at sunset" width={1600} height={1066} loading="lazy" className="aspect-[3/2] h-full w-full object-cover" />
          </div>
          {FOUNDER_NAMES.length > 0 && <figcaption className="s-small mt-3">Left to right: {FOUNDER_NAMES.join(", ")}</figcaption>}
        </figure>
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
    <footer className="border-t border-[var(--s-line)] bg-white py-14 pb-28 text-[14px] text-[var(--s-ink-3)] lg:pb-14">
      <div className="s-wrap grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" className="h-8 w-auto" />
          <p className="mt-4 max-w-[28ch] leading-relaxed">The patient app for independent med spas. Built in California.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="s-focus mt-3 inline-block rounded font-medium text-[var(--s-ocean)] hover:underline">{CONTACT_EMAIL}</a>
        </div>
        <FooterCol title="Product" links={[["#product", "What it does"], ["#desk", "Front desk"], ["#pricing", "Pricing"]]} />
        <FooterCol title="Also from Atlas" links={[["/venues", "For entertainment venues"], ["/medspa", "Med spa recall estimate"], [IOS_APP_URL, "AE Rewards on the App Store"]]} />
        <FooterCol title="Company" links={[["/login", "Log in"], ["/support", "Support"], ["/legal/privacy", "Privacy"], ["/legal/terms", "Terms"]]} />
      </div>
      <div className="s-wrap mt-12 flex flex-col justify-between gap-3 border-t border-[var(--s-line)] pt-6 text-[13px] sm:flex-row"><span>© {new Date().getFullYear()} Atlas Engine. All rights reserved.</span><span>Bakersfield · Morro Bay, California</span></div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[12px] font-semibold tracking-wide text-[var(--s-ink)]">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([href, t]) => <li key={href}>{href.startsWith("http") ? <a href={href} target="_blank" rel="noopener" className="s-focus rounded hover:text-[var(--s-ink)]">{t}</a> : href.startsWith("#") ? <a href={href} className="s-focus rounded hover:text-[var(--s-ink)]">{t}</a> : <Link href={href} className="s-focus rounded hover:text-[var(--s-ink)]">{t}</Link>}</li>)}
      </ul>
    </div>
  );
}

