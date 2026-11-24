"use client";
/**
 * components/landing/results-showcase.tsx — CP-268 · client results on /medspa/app, above "Why we built Atlas".
 *
 *   left   the results in big bold numbers (a blue rule beside each), then what the clinic uses
 *   right  the owner's photo (or video) in a 16:9 card: clinic name top-left, the headline bottom-left
 *   below  a tab per clinic; the active one fills a blue progress line and the next one takes over (7 s)
 *
 * Data: CP-275 · Admin → Reviews & Results → Results (site_case_studies, via /api/site-results). The
 * RESULTS.cases list in lib/landing/medspa-funnel.ts is the fallback when there are none in the admin yet.
 * Real case studies only (dashboard numbers, the owner's OK).
 * While there are fewer than RESULTS.slots and showSlots is on, placeholder cards fill the rest: no names,
 * no numbers, a "coming soon" photo. Reduced motion: no auto-advance (tabs still work).
 */
import { useEffect, useState } from "react";
import { BellRing, CalendarClock, Camera, Crown, Gift, ShoppingBag } from "lucide-react";
import { RESULTS, type ResultUse } from "@/lib/landing/medspa-funnel";
import type { CaseStudy } from "@/lib/landing/case-studies";
import { YouTubeLite } from "@/components/landing/youtube-lite";

/** One card, whichever source it came from: photo/logo are ready-to-use URLs. */
type Case = {
  id: string; clinic: string; headline: string; stats: Array<{ value: string; label: string }>; uses: ResultUse[];
  photoSrc: string | null; logoSrc: string | null; youtube: string | null; placeholder?: boolean;
};
const fromConfig = (c: (typeof RESULTS.cases)[number]): Case => ({
  id: c.id, clinic: c.clinic, headline: c.headline, stats: c.stats, uses: c.uses, youtube: c.youtube,
  photoSrc: c.photo ? `/landing/results/${c.photo}` : null, logoSrc: c.logo ? `/landing/results/${c.logo}` : null,
});
const fromAdmin = (c: CaseStudy): Case => ({
  id: c.id, clinic: c.clinic, headline: c.headline, stats: (c.stats ?? []).slice(0, 2), uses: c.uses ?? [],
  youtube: c.youtube, photoSrc: c.photo_url, logoSrc: c.logo_url,
});

const USES: Record<ResultUse, { label: string; Icon: typeof Crown }> = {
  memberships: { label: "Memberships", Icon: Crown },
  rewards: { label: "Rewards", Icon: Gift },
  recall: { label: "Due-date reminders", Icon: CalendarClock },
  shop: { label: "In-app shop", Icon: ShoppingBag },
  push: { label: "Push offers", Icon: BellRing },
};

const PLACEHOLDER = (n: number): Case => ({
  id: `slot-${n}`, clinic: `Case study ${n}`, logoSrc: null, photoSrc: null, youtube: null, placeholder: true,
  headline: "Real results, in the owner's own words. Coming soon.",
  stats: [{ value: "+—%", label: "Average patient spend" }, { value: "+$—", label: "Monthly membership revenue" }],
  uses: ["memberships", "rewards"],
});

const STEP_MS = 7000;

export function ResultsShowcase() {
  // The admin's case studies (fetched after load; the placeholders show meanwhile), else the config list.
  const [remote, setRemote] = useState<Case[] | null>(null);
  useEffect(() => {
    fetch("/api/site-results").then((r) => (r.ok ? r.json() : null))
      .then((d: { results?: CaseStudy[] } | null) => setRemote((d?.results ?? []).map(fromAdmin)))
      .catch(() => setRemote([]));
  }, []);
  const real: Case[] = (remote && remote.length ? remote : RESULTS.cases.map(fromConfig)).slice(0, RESULTS.slots);
  const list: Case[] = RESULTS.showSlots
    ? [...real, ...Array.from({ length: Math.max(0, RESULTS.slots - real.length) }, (_, i) => PLACEHOLDER(real.length + i + 1))]
    : real;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => { setStill(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);
  useEffect(() => {
    if (still || paused || list.length < 2) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % list.length), STEP_MS);
    return () => window.clearTimeout(t);
  }, [idx, paused, still, list.length]);

  if (!list.length) return null;
  const c = list[Math.min(idx, list.length - 1)];
  const muted = c.placeholder;

  return (
    <section aria-labelledby="results-h" className="border-t border-[#0B1B2B]/8 bg-white py-14 sm:py-20"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="s-wrap">
        <p className="text-center text-[13px] font-semibold uppercase tracking-[0.12em] text-[#0B5FD6]">Results</p>
        <h2 id="results-h" className="mx-auto mt-2 max-w-[18ch] text-center text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] font-bold leading-[1.04] tracking-[-0.035em] text-[#0B1B2B]">Results, not promises.</h2>

        <div className="mx-auto mt-10 grid max-w-[1180px] gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center lg:gap-12">
          {/* The numbers (under the photo on a phone) */}
          <div className="order-2 lg:order-1" aria-live="polite">
            {/* CP-276: the same entrance as the main site's showcase (site.css .s-load-*), replayed per case */}
            <div key={`n-${idx}`}>
            <dl className="s-load-1 grid grid-cols-2 gap-6 lg:grid-cols-1 lg:gap-9">
              {c.stats.map((s) => (
                <div key={s.label} className="border-l-[3px] border-[#0B5FD6] pl-4 sm:pl-5">
                  <dt className="sr-only">{s.label}</dt>
                  <dd className={`text-[34px] font-bold leading-none tracking-[-0.03em] sm:text-[44px] ${muted ? "text-[#C3CEDB]" : "text-[#0B1B2B]"}`}>{s.value}</dd>
                  <dd className="mt-2 text-[15px] leading-snug text-[#5B6B7E] sm:text-[16px]">{s.label}</dd>
                </div>
              ))}
            </dl>
            <p className="s-load-2 mt-8 text-[15px] font-semibold text-[#0B1B2B]">What they use</p>
            <ul className="s-load-2 mt-3 space-y-2.5">
              {c.uses.map((u) => {
                const { label, Icon } = USES[u];
                return (
                  <li key={u} className="flex items-center gap-3 text-[15.5px] text-[#3A4A5C]">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EAF2FF] text-[#0B5FD6]"><Icon className="h-4 w-4" aria-hidden /></span>{label}
                  </li>
                );
              })}
            </ul>
            </div>
          </div>

          {/* The owner */}
          <figure className="order-1 lg:order-2">
            <div className="relative aspect-square overflow-hidden rounded-[24px] bg-[#0B1B2B] shadow-[0_30px_60px_-30px_rgba(2,20,70,.55)] sm:aspect-video">
              {list.map((x, k) => {
                const on = k === idx;
                return (
                  <div key={x.id} className={`s-case${on ? " s-on" : ""}`} aria-hidden={!on}>
                    {x.youtube ? (
                      <YouTubeLite id={x.youtube} title={`${x.clinic}: owner interview`} className="absolute inset-0 h-full" />
                    ) : x.photoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.photoSrc} alt={on ? `${x.clinic}, the owner` : ""} className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div className="absolute inset-0">
                        <div aria-hidden className="h-full w-full bg-[linear-gradient(135deg,#39A0FF_0%,#0B5FD6_45%,#06318F_100%)]" />
                        <div aria-hidden className="s-gridbg-dark" />
                        <div className="absolute inset-0 grid place-items-center pb-12 sm:pb-16">
                          <span className="flex flex-col items-center gap-3 text-white/80">
                            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/12 ring-1 ring-white/30"><Camera className="h-7 w-7" aria-hidden /></span>
                            <span className="text-[13px] font-semibold uppercase tracking-[0.14em]">Owner photo coming soon</span>
                          </span>
                        </div>
                      </div>
                    )}
                    {!x.youtube && (
                      <>
                        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06142B]/80 via-[#06142B]/10 to-[#06142B]/35" />
                        {/* keyed on the active case, so the rise replays each time this card comes round */}
                        <div key={on ? `t-${idx}` : "t"} className={`absolute left-5 top-5 sm:left-8 sm:top-7${on ? " s-load-1" : ""}`}>
                          {x.logoSrc
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={x.logoSrc} alt={x.clinic} className="h-8 w-auto brightness-0 invert sm:h-10" />
                            : <span className="text-[18px] font-semibold uppercase tracking-[0.12em] text-white sm:text-[24px]">{x.clinic}</span>}
                        </div>
                        <figcaption key={on ? `c-${idx}` : "c"} className={`absolute inset-x-5 bottom-5 max-w-[30ch] text-[18px] font-semibold leading-snug tracking-[-0.01em] text-white sm:inset-x-8 sm:bottom-7 sm:text-[26px]${on ? " s-load-2" : ""}`}>
                          {x.headline}
                        </figcaption>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </figure>
        </div>

        {/* The clinics */}
        {list.length > 1 && (
          <div role="tablist" aria-label="Clinics" className="mx-auto mt-8 grid max-w-[1180px] grid-cols-2 sm:grid-cols-4">
            {list.map((x, i) => {
              const on = i === idx;
              return (
                <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => setIdx(i)}
                  className="s-focus group relative flex h-20 items-center justify-center px-3 text-center">
                  <span aria-hidden className="absolute inset-x-2 top-0 h-[3px] overflow-hidden rounded-full bg-[#E3E8EF]">
                    {on && <span key={`${idx}-${paused}-${still}`} className={`block h-full rounded-full bg-[#0B5FD6] ${still || paused ? "w-full" : "s-results-bar"}`} />}
                  </span>
                  {x.logoSrc
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={x.logoSrc} alt={x.clinic} className={`h-8 w-auto max-w-full object-contain transition-opacity ${on ? "opacity-100" : "opacity-50 group-hover:opacity-80"}`} />
                    : <span className={`text-[14px] font-semibold uppercase tracking-[0.12em] transition-colors ${x.placeholder ? (on ? "text-[#8A99AB]" : "text-[#C3CEDB]") : on ? "text-[#0B1B2B]" : "text-[#8A99AB] group-hover:text-[#3A4A5C]"}`}>{x.clinic}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
