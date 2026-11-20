"use client";
/**
 * components/site/showcase.tsx — the Dermis-style product showcase: "Sell more treatments & memberships",
 * a rail of features (Recall reminders, Memberships, Rewards, Patient financing, Front desk) and a phone
 * whose screen changes with the tab; it rotates every 4.5 s, a tap holds a tab.
 * CP-258: moved out of site-page.tsx so the /medspa/app funnel can show it too (`embedded`), under the team
 * section. /med-spas uses it as its top. The nav's Product menu picks a tab with the "atlas:feature" event.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { MEDSPA_OFFER_COPY } from "@/lib/landing/medspa-offer";
import { Gulls } from "@/components/landing/gulls";
import { OceanBackground } from "@/components/site/ocean-background";
import { DeskListMock, PhoneShell } from "./site-mocks";
import { IconDesk, IconFinancing, IconMembership, IconRecall, IconRewards } from "./feature-icons";

/* ───────────── showcase (Dermis-style top): headline, "See how", a rail of features, the phone changes ───────────── */
type Feature = { id: string; label: string; Icon: (p: { on?: boolean; className?: string }) => React.ReactElement; blurb: string; title: string; facts: [string, string][]; status?: string; screen: React.ReactNode };
const DWELL = 4500;

export function Showcase({ onStart, embedded = false }: { onStart: () => void; embedded?: boolean }) {
  // CP-258: `embedded` = inside another page (the /medspa/app funnel): an h2, no nav offset, its own anchor.
  const H = (embedded ? "h2" : "h1") as "h1";
  const features: Feature[] = [
    { id: "recall", label: "Recall reminders", Icon: IconRecall, title: "She comes back on time, not when she remembers.", blurb: "Every treatment carries how long results last. Her app shows the countdown; she hears from you before she forgets you.", facts: [["Per treatment", "Each treatment on your menu carries its own recall window."], ["One tap", "The desk logs today's treatment; her app updates on the spot."]], screen: <AppShot src="/landing/app-screens/shop.jpg" alt="A practice's app with a treatment package to rebook" /> },
    { id: "members", label: "Memberships", Icon: IconMembership, title: "Revenue on the first of the month.", blurb: "Sold in the app, billed through your own Stripe, banking a monthly credit toward treatments.", facts: [["Your Stripe", "Dues settle in the practice's own account, never ours."], ["Banked credit", "A monthly credit toward treatments, shown on her card."]], screen: <AppShot src="/landing/app-screens/membership.jpg" alt="The membership tab in a practice's app" /> },
    { id: "rewards", label: "Rewards", Icon: IconRewards, title: "Points for the things that grow a practice.", blurb: "Points for visits, reviews and referrals, redeemed on add-ons and treatments you choose.", facts: [["Reviews + referrals", "The two actions worth paying for, rewarded automatically."], ["Your catalog", "Redeemed on add-ons and treatments you pick and price."]], screen: <AppShot src="/landing/app-screens/rewards.jpg" alt="The rewards tab in a practice's app" /> },
    { id: "financing", label: "Patient financing", Icon: IconFinancing, title: "A $720 treatment becomes a yes today.", blurb: "Clients pay over time with Klarna, right in your app's shop, so a $720 treatment is a yes today.", facts: [["Klarna built in", "Clients split a treatment or package into payments at checkout in your app."], ["Your Stripe", "Runs on the practice's own Stripe account. Affirm can be switched on too."]], screen: <AppShot src="/landing/app-screens/shop.jpg" alt="The shop tab with packages and member pricing" /> },
    { id: "desk", label: "Front desk", Icon: IconDesk, title: "A list, not a dashboard.", blurb: "Who is due, who is overdue, who already booked. Open her, log the treatment, or text the reminder you wrote.", facts: [["Who's due", "Overdue, due within two weeks, coming up: one screen."], ["Text or open", "Send the reminder you wrote, or log the treatment, from the list."]], screen: <div className="relative flex h-full items-center justify-center p-3"><DeskListMock className="!w-full scale-[.92]" /></div> },
  ];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // CP-255: the nav's Product menu picks a tab here (and holds it, so the rotation doesn't move off it).
  useEffect(() => {
    const pick = (e: Event) => { const k = features.findIndex((f) => f.id === (e as CustomEvent<string>).detail); if (k >= 0) { setI(k); setPaused(true); } };
    window.addEventListener("atlas:feature", pick);
    return () => window.removeEventListener("atlas:feature", pick);
  }, [features]);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    const n = desktop ? features.length - 1 : features.length; // desktop tab row has no Front desk tab
    const t = setTimeout(() => setI((k) => (k + 1) % n), DWELL);
    return () => clearTimeout(t);
  }, [i, paused, features.length]);
  return (
    <section id={embedded ? "how-it-works" : "product"} className={cn("relative overflow-hidden", embedded ? "border-t border-[var(--s-line)] pt-16 sm:pt-20" : "-mt-[68px] pt-[100px] sm:pt-[124px]")} aria-labelledby={embedded ? "how-title" : "hero-title"}>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Gulls className="h-[560px]" />{/* CP-252 */}
        <div className="s-blob absolute -right-[12%] -top-[25%] h-[820px] w-[820px] rounded-full bg-[radial-gradient(closest-side,rgba(57,160,255,.22),transparent)]" />
        <div className="absolute -left-[18%] top-[35%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(11,95,214,.10),transparent)]" />
      </div>
      {/* ── Desktop (lg+): Dermis desktop geometry. Centered headline, "See how", the phone centered over a row of
          feature tabs, running down into an ocean band that explains the active feature. ── */}
      <div className="hidden lg:block" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="s-wrap relative">
          <Guides />
          <div className="relative z-[1] pt-6 text-center">
            <H id={embedded ? "how-title-lg" : "hero-title-lg"} className="s-display s-load-1 mx-auto !text-[clamp(3rem,2rem+2.6vw,4.3rem)]">Sell more treatments &amp; <span className="s-chrome">memberships</span>.</H>
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
          <OceanBackground className="opacity-80" />
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
          <H id={embedded ? "how-title" : "hero-title"} className="s-display s-load-1 max-w-[12ch]">Sell more treatments and <span className="s-chrome">memberships</span>.</H>
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
            {/* Dermis-style floating pins near the phone */}
            <HeroPin className="s-float-in absolute -left-6 top-[22%] hidden rotate-[-6deg] sm:block" aria-hidden>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--s-ice)] text-[var(--s-ocean-deep)]">
                <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
              </span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--s-ink-3)]">Due in</span>
                <span className="block text-[14px] font-bold tabular-nums">2 weeks</span>
              </span>
            </HeroPin>
            <HeroPin className="s-float-in-2 absolute -right-4 top-[48%] hidden rotate-[4deg] sm:block" aria-hidden>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#2C93FF,#0B5FD6)" }}>
                <Star className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
              </span>
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--s-ink-3)]">Member</span>
                <span className="block text-[14px] font-bold">Saves 15%</span>
              </span>
            </HeroPin>
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

/** Small Dermis-style floating card near the hero phone (stat / member chip). */
function HeroPin({ children, className, ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("flex items-center gap-2.5 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_18px_40px_-18px_rgba(6,49,143,.35)] ring-1 ring-black/[.04] backdrop-blur", className)}>
      {children}
    </div>
  );
}

