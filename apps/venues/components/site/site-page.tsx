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
import { MedspaAppsBand } from "@/components/landing/medspa-apps-band"; // CP-237
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Menu, Minus, Play, Plus, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { useInView } from "@/components/landing/reveal";
import { LandingProviders } from "@/components/landing/landing-providers";
import { interClass } from "@/lib/landing/font";
import { CONTACT_EMAIL, IOS_APP_URL } from "@/lib/landing/config";
import { MEDSPA_OFFER_COPY, MEDSPA_STACK } from "@/lib/landing/medspa-offer";
import { TESTIMONIALS } from "@/lib/landing/testimonials";
import { MedspaQuiz } from "@/components/medspa/medspa-quiz";
import { DeskListMock } from "./site-mocks";
import { SHOW_REVIEW_SLOTS, SITE_BADGES, SITE_REVIEWS, partnerLine, realReviews, reviewFor } from "@/lib/landing/site-reviews";
import { ReviewQuote } from "@/components/landing/review-strip"; // CP-239
import { TeamProof } from "@/components/landing/team-proof"; // CP-251
import { AsSeenAtSection } from "@/components/landing/as-seen-at"; // CP-277
import { ReviewImageMarquee, useReviewImages } from "@/components/landing/review-images"; // CP-240
// CP-194: Dermis-style client results band under the hero.
import { ClientResults } from "./client-results";
import { Showcase } from "./showcase"; // CP-258
export { AppShot } from "./showcase";
// CP-196: GSAP scroll motion, wired from data-gs attributes (components/site/motion.ts).
import { useSiteMotion } from "./motion";
import { OceanBackground } from "@/components/site/ocean-background";


export function SitePage() {
  return (
    <LandingProviders fontClassName={interClass} renderQuiz={(src, ref) => <MedspaQuiz source={src} firstFieldRef={ref} />}>
      <Page />
    </LandingProviders>
  );
}

function Page() {
  // CP-255: every "see / build your app" CTA goes to the app preview builder (/medspa/app). The quiz-first
  // popup it used to open is retired. utm_content says which button, for Admin -> App previews.
  const router = useRouter();
  const start = (where: string) => { track("hero_cta_clicked", { source: `site_${where}` }); router.push(`/medspa/app?utm_source=med-spas&utm_content=${where}`); };
  const rootRef = useRef<HTMLDivElement>(null);
  useSiteMotion(rootRef);
  return (
    <div ref={rootRef} className="site overflow-x-clip">
      <Nav onStart={() => start("nav")} />
      <main id="main">
        <Showcase onStart={() => start("hero")} />
        <MedspaAppsBand where="site" />
        <ClientResults />
        <Desk />
        <Week />
        <QuoteRow topic="recall" />
        <Pricing onStart={() => start("pricing")} />
        <QuoteRow topic="pricing" skip={[reviewFor("recall")?.id ?? ""]} />
        <Compare />
        {/* CP-277: "As seen at" the Cal Poly AI Hackathon (photo, event numbers, recap link) */}
        <AsSeenAtSection />
        {/* CP-255: "Reviews" in the nav lands here: the proof cards (owner video, Flippo's, hackathon), then the reviews */}
        <div id="reviews" className="scroll-mt-16">
          <TeamProof />
          <ReviewsBand />
        </div>
        <Team />
        <Closing onStart={() => start("closing")} />
      </main>
      <Footer />
      <MobileBar onStart={() => start("sticky_bar")} />
    </div>
  );
}

/** CP-239: one real review beside the section it backs up (renders nothing until there is one). */
function QuoteRow({ topic, skip }: { topic: "recall" | "pricing" | "setup"; skip?: string[] }) {
  return <div className="s-wrap empty:hidden"><ReviewQuote topic={topic} skip={skip} className="my-4" /></div>;
}

/* ───────────── nav ───────────── */
/* CP-255: med spa only. Product (a menu of the features, each opening its tab in the showcase), Reviews, Help.
   No venues link, no Pricing link; the button opens the app preview builder. */
const PRODUCT_LINKS: { id: string; t: string }[] = [
  { id: "recall", t: "Recall reminders" }, { id: "members", t: "Memberships" }, { id: "rewards", t: "Rewards" },
  { id: "financing", t: "Patient financing" }, { id: "desk", t: "Front desk" },
];
const LINKS = [{ href: "#reviews", t: "Reviews" }, { href: "/support", t: "Help" }];

/** Opens a feature: the showcase listens for this, selects that tab and scrolls to it. Front desk has its own band. */
function openFeature(id: string) {
  track("demo_clicked", { source: "site_nav", kind: id });
  if (id === "desk") { document.getElementById("desk")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  window.dispatchEvent(new CustomEvent("atlas:feature", { detail: id }));
  document.getElementById("product")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Nav({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 10); on(); window.addEventListener("scroll", on, { passive: true }); return () => window.removeEventListener("scroll", on); }, []);
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const link = "s-focus rounded-md px-3 py-2 text-[14.5px] font-medium text-[var(--s-ink-2)] hover:text-[var(--s-ink)]";
  return (
    <header className={cn("sticky top-0 z-40 transition-[background,box-shadow] duration-300", scrolled || open ? "bg-[var(--s-pearl)]/85 shadow-[0_1px_0_var(--s-line)] backdrop-blur-xl" : "bg-transparent")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <div className="s-wrap flex h-[68px] items-center justify-between gap-6">
        <Link href="/med-spas" className="s-focus flex items-center rounded-md" aria-label="Atlas Engine for med spas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="true" className={cn(link, "inline-flex items-center gap-1")}>
              Product <ChevronDown className={cn("h-4 w-4 transition-transform", menu && "rotate-180")} aria-hidden />
            </button>
            {menu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--s-line)] bg-white p-1.5 shadow-[0_24px_50px_-24px_rgba(11,27,43,.45)]">
                {PRODUCT_LINKS.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setMenu(false); openFeature(p.id); }}
                    className="s-focus flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[14.5px] font-medium text-[var(--s-ink)] hover:bg-[var(--s-paper)]">{p.t}</button>
                ))}
              </div>
            )}
          </div>
          {LINKS.map((l) => <a key={l.href} href={l.href} className={link}>{l.t}</a>)}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className={link}>Log in</Link>
          <button type="button" onClick={onStart} className={cn("s-btn s-focus !h-11 !px-5 text-[15px]", scrolled ? "s-btn-primary" : "s-btn-quiet")}>See your app free</button>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="s-focus grid h-10 w-10 place-items-center rounded-full lg:hidden" aria-expanded={open} aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && (
        <div className="s-wrap flex flex-col gap-1 pb-5 lg:hidden">
          <p className="px-3 pt-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--s-ink-3)]">Product</p>
          {PRODUCT_LINKS.map((p) => <button key={p.id} type="button" onClick={() => { setOpen(false); openFeature(p.id); }} className="s-focus rounded-lg px-3 py-2.5 text-left text-base font-medium">{p.t}</button>)}
          <div className="my-1 h-px bg-[var(--s-line)]" />
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium">{l.t}</a>)}
          <Link href="/login" onClick={() => setOpen(false)} className="s-focus rounded-lg px-3 py-3 text-base font-medium">Log in</Link>
          <button type="button" onClick={() => { setOpen(false); onStart(); }} className="s-btn s-btn-primary s-focus mt-2">See your practice&apos;s app free</button>
        </div>
      )}
    </header>
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
      <OceanBackground className="opacity-70" />
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
              <OceanBackground tint={false} className="opacity-40 mix-blend-screen" />
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
/** CP-201: also used on /medspa. CP-206: and on the all-business home page (audience "general"). */
export function ReviewsBand({ audience = "medspa" }: { audience?: "medspa" | "general" } = {}) {
  // CP-191: all three Flippo's clips, playable in place (not inside the moving row).
  const videos = TESTIMONIALS.filter((t) => t.embed);
  // CP-239: real = a quote (and partner reviews only once the partner is named). Slots fill in only while there are none.
  const real = realReviews();
  // CP-240: review screenshots from Admin → Reviews take the slots' place (slots only show once we know there are none).
  const shots = useReviewImages(audience);
  const cards = real.length ? real : SHOW_REVIEW_SLOTS && shots.ready && shots.images.length === 0 ? SITE_REVIEWS.filter((r) => !r.quote) : [];
  const partner = real.some((r) => r.via === "partner") ? partnerLine() : null;
  if (videos.length === 0 && cards.length === 0 && shots.images.length === 0) return null;
  return (
    <section className="s-section !pt-0" aria-labelledby="reviews-title">
      <div className="s-wrap">
        <div className="s-ocean relative overflow-hidden rounded-[36px] pb-10 pt-16 sm:pt-24">
          <OceanBackground />
          <div className="relative px-5 text-center">
            <h2 id="reviews-title" className="s-h2 mx-auto max-w-[16ch] text-[clamp(2.2rem,1.4rem+3.2vw,4.2rem)]">{partner ? "See what practice owners say." : "See what owners say about Atlas."}</h2>
            {partner && <p className="mx-auto mt-4 max-w-[36rem] text-[15px] leading-relaxed text-white/80">{partner}</p>}
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
              <p className="s-small mt-4 text-center text-white/80">Flippo&apos;s is an arcade and batting cage, the first business on Atlas. {audience === "general" ? "More owners are next" : "Med spa owners are next"}{real.length === 0 && shots.images.length === 0 ? "; their words land below as they come in" : ""}.</p>
            </div>
          )}

          {/* CP-240: review screenshots, sliding left → right. */}
          <ReviewImageMarquee images={shots.images} tone="dark" className="relative mt-12" />

          {/* Cards slide across; pause on hover. The whole set renders twice so the loop has no seam. */}
          {cards.length > 0 && <div className="s-marquee-wrap relative mt-12 overflow-hidden">
            <div className="s-marquee flex w-max gap-4 px-4">
              {[0, 1].map((pass) => (
                <div key={pass} className="flex gap-4" aria-hidden={pass === 1}>
                  {cards.map((r) => (
                    <figure key={r.id} className={cn("flex w-[340px] shrink-0 flex-col justify-between rounded-3xl p-6", r.quote ? "bg-[var(--s-ice)]" : "border border-dashed border-white/40 bg-white/10 text-white backdrop-blur")}>
                      <div>
                        <div className={cn("flex gap-0.5", r.quote ? "text-[var(--s-ink)]" : "text-white/50")}>{[0, 1, 2, 3, 4].map((n) => <Star key={n} className={cn("h-4 w-4", r.quote && r.rating && n < r.rating ? "fill-current" : "")} />)}</div>
                        {r.quote && r.title && <p className="mt-4 text-[15px] font-bold text-[var(--s-ink)]">{r.title}</p>}
                        <blockquote className={cn("mt-4 text-[17px] font-semibold leading-snug", r.quote ? "text-[var(--s-ink)]" : "text-white/85", r.quote && r.title && "mt-2 text-[15.5px] font-medium")}>{r.quote ? `“${r.quote}”` : `Review slot: this fills with a real owner's words when the first ${audience === "general" ? "businesses" : "practices"} go live.`}</blockquote>
                      </div>
                      <figcaption className="mt-6 flex items-center gap-3">
                        <span className={cn("grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold", r.quote ? "bg-[var(--s-ocean)] text-white" : "bg-white/20 text-white")}>{!r.quote && audience === "general" ? "L" : r.name[0]}</span>
                        <span><span className={cn("block text-[14px] font-bold", r.quote ? "text-[var(--s-ink)]" : "text-white")}>{!r.quote && audience === "general" ? "Local business owner" : r.name}</span><span className={cn("block text-[12px]", r.quote ? "text-[var(--s-ink-3)]" : "text-white/70")}>{!r.quote && audience === "general" ? "Owner · Your business · California" : `${r.role} · ${r.business} · ${r.city}`}</span></span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
          </div>}
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
      <OceanBackground />
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
        <FooterCol title="Product" links={[["#product", "What it does"], ["#desk", "Front desk"], ["#reviews", "Reviews"], ["/support", "Help"]]} />
        <FooterCol title="Also from Atlas" links={[["/venues", "For entertainment venues"], ["/medspa/app", "See your app free"], [IOS_APP_URL, "AE Rewards on the App Store"]]} />
        <FooterCol title="Company" links={[["/login", "Log in"], ["/support", "Support"], ["/legal/privacy", "Privacy"], ["/legal/terms", "Terms"], ["/legal/privacy#choices", "Your privacy choices"], ["/legal/california", "California notice"], ["/legal/health-data", "Consumer health data"]]} />
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

