"use client";
/**
 * ClientResults — CP-194 · the Dermis-style results band under the hero.
 *
 * Left: two headline numbers and the products used. Right: a large photo card
 * with the story's headline. Below: a row of client wordmarks; the active one
 * carries a progress line and the band advances on its own (pauses on hover,
 * still under reduced motion). Data lives in lib/landing/client-results.ts and
 * is PLACEHOLDER until real results are in; the band says so while it is.
 */
import { useEffect, useState } from "react";
import { Crown, Gift, MonitorSmartphone, ShoppingBag, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { hanken } from "@/lib/fonts/hanken";
import { CLIENT_RESULTS, type ClientResult } from "@/lib/landing/client-results";

const DWELL = 6500;
const PRODUCT_ICON: Record<ClientResult["products"][number], React.ReactNode> = {
  Memberships: <Crown className="h-[18px] w-[18px]" />,
  Rewards: <Gift className="h-[18px] w-[18px]" />,
  "Branded app": <Smartphone className="h-[18px] w-[18px]" />,
  Shop: <ShoppingBag className="h-[18px] w-[18px]" />,
  "Front desk": <MonitorSmartphone className="h-[18px] w-[18px]" />,
};

function Wordmark({ r, on }: { r: ClientResult; on: boolean }) {
  const tone = on ? "text-[var(--s-ink)]" : "text-[#9aa5b1]";
  if (r.mark === "caps") return <span className={cn("whitespace-nowrap text-[16px] font-extrabold uppercase tracking-[0.1em] sm:text-[22px] sm:tracking-[0.12em]", tone)}>{r.client}</span>;
  if (r.mark === "serif") return <span className={cn("whitespace-nowrap font-[family-name:var(--font-site-display)] text-[18px] sm:text-[25px] sm:tracking-[0.02em]", tone)}>{r.client}</span>;
  if (r.mark === "script") return <span className={cn("whitespace-nowrap font-[family-name:var(--font-site-display)] text-[18px] italic sm:text-[25px]", tone)}>{r.client}</span>;
  return <span className={cn("whitespace-nowrap text-[13px] font-light uppercase tracking-[0.18em] sm:text-[19px] sm:tracking-[0.28em]", tone)}>{r.client}</span>;
}

export function ClientResults() {
  const items = CLIENT_RESULTS;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((k) => (k + 1) % items.length), DWELL);
    return () => clearTimeout(t);
  }, [i, paused, items.length]);
  const r = items[i];
  const sample = items.some((x) => x.placeholder);

  return (
    <section className={cn(hanken.variable, "relative py-16 sm:py-24")} style={{ fontFamily: "var(--font-hanken), system-ui, sans-serif" }} aria-labelledby="results-title"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <h2 id="results-title" className="sr-only">Client results</h2>
      <div className="s-wrap relative">
        {/* column guides, aligned to the grid below */}
        <div aria-hidden className="pointer-events-none absolute inset-y-[-4rem] left-4 right-4 hidden grid-cols-4 sm:left-8 sm:right-8 lg:grid">
          {[0, 1, 2, 3].map((n) => <span key={n} className={cn("border-l border-dashed border-[var(--s-line)]", n === 3 && "border-r")} />)}
        </div>

        <div className="relative grid gap-8 lg:grid-cols-4 lg:gap-0">
          {/* Stats */}
          <div key={`s-${r.id}`} className="s-load-1 order-2 grid grid-cols-2 gap-6 lg:order-1 lg:col-span-1 lg:block lg:pr-8 lg:pt-1">
            {r.stats.map((s) => (
              <div key={s.label} className="relative pl-6 lg:mb-14 lg:pl-9">
                <span aria-hidden className="absolute left-0 top-0 h-[38px] w-[3px] rounded-full bg-[var(--s-ocean)] lg:-left-px" />
                <div className="text-[26px] font-bold leading-none tracking-[-0.01em] text-[var(--s-ink)]">{s.value}</div>
                <div className="mt-3 text-[17px] leading-snug text-[var(--s-ink-2)]">{s.label}</div>
              </div>
            ))}
            <div className="col-span-2 pl-6 lg:pl-9">
              <div className="text-[17px] font-bold text-[var(--s-ink)]">Products used</div>
              <ul className="mt-5 space-y-4">
                {r.products.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-[17px] text-[var(--s-ink-2)]"><span className="text-[var(--s-ocean)]">{PRODUCT_ICON[p]}</span>{p}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Story card */}
          <div className="order-1 lg:order-2 lg:col-span-3">
            <div key={`c-${r.id}`} className="s-load-1 relative aspect-[4/3] overflow-hidden rounded-[18px] bg-[var(--s-ocean-deep)] shadow-[0_30px_60px_-36px_rgba(6,49,143,.55)] sm:aspect-[16/9] lg:aspect-[930/510]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: r.focus ?? "center" }} />
              {r.placeholder && r.image.includes("blue-lines") && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src="/landing/apps/spa-upright.webp" alt="" className="absolute right-[8%] top-[10%] h-[120%] w-auto rotate-[6deg] drop-shadow-[0_30px_40px_rgba(6,20,60,.45)]" />
              )}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
              <span className="absolute left-5 top-5 rounded-lg bg-white/15 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-white ring-1 ring-white/40 backdrop-blur-md sm:left-8 sm:top-7">{r.client}</span>
              <p className="absolute inset-x-5 bottom-5 max-w-[34ch] text-[22px] font-semibold leading-[1.25] text-white sm:inset-x-8 sm:bottom-8 sm:text-[30px] lg:max-w-[40ch] lg:text-[32px]">{r.headline}</p>
            </div>
          </div>
        </div>

        {/* Wordmark row */}
        <div className="relative mt-10 grid grid-cols-2 lg:mt-14 lg:grid-cols-4" role="tablist" aria-label="Client stories">
          {items.map((x, k) => {
            const on = k === i;
            return (
              <button key={x.id} type="button" role="tab" aria-selected={on} onClick={() => setI(k)}
                className="s-focus relative flex h-24 items-center justify-center px-3 text-center transition-colors lg:h-28">
                <span aria-hidden className="absolute inset-x-3 top-0 h-[2px] overflow-hidden rounded-full bg-[var(--s-ice)] lg:inset-x-0">
                  <span className={cn("s-prog block h-full w-full bg-[var(--s-ocean)]", on && "s-on")} style={{ ["--s-dwell" as string]: `${DWELL}ms`, ...(on && paused ? { animationPlayState: "paused" } : {}) }} key={on ? `on-${i}` : "off"} />
                </span>
                <Wordmark r={x} on={on} />
              </button>
            );
          })}
        </div>
        {sample && <p className="relative mt-4 text-center text-[13px] text-[var(--s-ink-3)]">Sample figures and clients shown for layout. Real client results are on the way.</p>}
      </div>
    </section>
  );
}
