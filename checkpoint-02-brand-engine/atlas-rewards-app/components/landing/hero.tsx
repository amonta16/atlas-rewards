"use client";
import { useEffect, useState } from "react";
import { Flame, Gift, ShieldCheck, Star, Zap } from "lucide-react";
import { INDUSTRIES } from "@/lib/landing/industries";
import { ANCHORS } from "@/lib/landing/config";
import { AppScreen, Phone } from "./app-preview";
import { DemoCta, WatchCta } from "./cta-button";

/**
 * Hero — CP-100.
 * Left: outcome headline + single primary CTA + watch CTA + risk reducers.
 * Right: the phone re-brands itself every few seconds — the product's whole
 * promise ("your OWN app") demonstrated without a paragraph.
 */
export function Hero() {
  const [i, setI] = useState(4); // start on the med-spa brand (closest to Atlas's real demo business)
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % INDUSTRIES.length), 3800);
    return () => clearInterval(t);
  }, []);
  const brand = INDUSTRIES[i];

  return (
    <section className="relative overflow-hidden pt-28 md:pt-36 lg:pt-40" aria-labelledby="hero-title">
      {/* Atmosphere */}
      <div className="lp-grid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.16),transparent)] blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07090f]" aria-hidden />

      <div className="lp-container relative grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="max-w-2xl">
          <p className="lp-eyebrow">
            <Zap className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
            Branded rewards app for local business
          </p>
          <h1 id="hero-title" className="mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl lg:text-[4.4rem]">
            The big chains have an app.
            <br />
            <span className="lp-gradient-text">Now you do too.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
            Atlas Engine gives your business its own branded rewards app — points, streaks, a prize wheel, win-back
            offers and review requests — built for you, in your colors, and live in days. No developers, no app-store
            headaches.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DemoCta source="hero" event="hero_cta_clicked" size="xl" />
            <WatchCta source="hero" size="xl" />
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-300" aria-hidden /> We set it up with you
            </li>
            <li className="flex items-center gap-2">
              <Star className="h-4 w-4 text-cyan-300" aria-hidden /> Customers join in seconds
            </li>
            <li className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-cyan-300" aria-hidden /> Works at the counter, no POS change
            </li>
          </ul>
        </div>

        {/* Product visual */}
        <div className="relative mx-auto w-full max-w-[420px] lg:max-w-none" id={ANCHORS.product}>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(96,165,250,0.22),transparent)] blur-xl" aria-hidden />
          <div className="lp-float relative">
            <Phone width={290} className="sm:!w-[310px]">
              <AppScreen brand={brand} />
            </Phone>
          </div>

          {/* Floating proof chips */}
          <FloatingChip className="left-0 top-[16%] lp-float-slow hidden sm:flex lg:-left-10 xl:-left-16" icon={<Gift className="h-4 w-4 text-emerald-300" />}>
            <b className="text-white">+250 pts</b> <span className="text-zinc-400">from today&apos;s spin</span>
          </FloatingChip>
          <FloatingChip className="right-0 top-[44%] lp-float-slower hidden sm:flex lg:-right-6 xl:-right-12" icon={<Flame className="h-4 w-4 text-orange-300" />}>
            <b className="text-white">Streak: 5 days</b> <span className="text-zinc-400">reward unlocked</span>
          </FloatingChip>
          <FloatingChip className="left-[2%] bottom-[16%] lp-float hidden sm:flex lg:-left-8 xl:-left-14" icon={<Star className="h-4 w-4 text-amber-300" />}>
            <b className="text-white">New 5-star review</b> <span className="text-zinc-400">via the app</span>
          </FloatingChip>

          {/* Brand dots */}
          <div className="mt-6 flex items-center justify-center gap-2" role="tablist" aria-label="Example brands">
            {INDUSTRIES.map((b, idx) => (
              <button
                key={b.id}
                role="tab"
                aria-selected={idx === i}
                aria-label={b.label}
                onClick={() => setI(idx)}
                className="lp-focus h-2 rounded-full transition-all"
                style={{ width: idx === i ? 24 : 8, background: idx === i ? b.secondary : "rgba(255,255,255,0.25)" }}
              />
            ))}
            <span className="ml-2 text-xs text-zinc-500">{brand.label}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingChip({ children, className, icon }: { children: React.ReactNode; className?: string; icon: React.ReactNode }) {
  return (
    <div className={`absolute z-10 items-center gap-2 rounded-xl border border-white/10 bg-[#0d121b]/90 px-3 py-2 text-[13px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur ${className ?? ""}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
