"use client";
import { useEffect, useState } from "react";
import { Flame, Gift, ShieldCheck, Star, Zap } from "lucide-react";
import { APP_MOCKUPS } from "@/lib/landing/apps";
import { ANCHORS } from "@/lib/landing/config";
import { DemoCta, WatchCta } from "./cta-button";

/**
 * Hero — CP-104.
 * Left: outcome headline + single primary CTA + watch CTA + risk reducers.
 * Right: a slideshow of REAL apps built on Atlas (upright iPhone mockups,
 * crossfading every few seconds) — the "your OWN app" promise shown with
 * actual product, not an illustration. Dots are clickable and colored per
 * brand. Respects prefers-reduced-motion (no auto-advance).
 */
export function Hero() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % APP_MOCKUPS.length), 4200);
    return () => clearInterval(t);
  }, []);
  const app = APP_MOCKUPS[i];

  return (
    <section className="relative overflow-hidden pt-28 md:pt-36 lg:pt-40" aria-labelledby="hero-title">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#062a44]/40 via-transparent to-transparent" aria-hidden />

      <div className="lp-container relative grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="max-w-2xl">
          <p className="lp-eyebrow">
            <Zap className="h-3.5 w-3.5 text-[#38bdf8]" aria-hidden />
            Branded rewards app for local business
          </p>
          <h1 id="hero-title" className="mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.035em] text-[#14213d] sm:text-6xl lg:text-[4.4rem]">
            The big chains have an app.
            <br />
            <span className="lp-gradient-text">Now you do too.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-700 sm:text-xl">
            Atlas Engine gives your business its own branded rewards app — points, streaks, a prize wheel, win-back
            offers and review requests — built for you, in your colors, and live in days. No developers, no app-store
            headaches.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DemoCta source="hero" event="hero_cta_clicked" size="xl" />
            <WatchCta source="hero" size="xl" />
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#1f5f8b]" aria-hidden /> We set it up with you
            </li>
            <li className="flex items-center gap-2">
              <Star className="h-4 w-4 text-[#1f5f8b]" aria-hidden /> Customers join in seconds
            </li>
            <li className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-[#1f5f8b]" aria-hidden /> Works at the counter, no POS change
            </li>
          </ul>
        </div>

        {/* Real-app slideshow */}
        <div className="relative mx-auto w-full max-w-[420px] lg:max-w-none" id={ANCHORS.product}>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-colors duration-700"
            style={{ background: `${app.color}33` }}
            aria-hidden
          />
          <div className="lp-float relative mx-auto h-[560px] w-[290px] sm:h-[600px] sm:w-[310px]">
            {APP_MOCKUPS.map((a, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={a.upright}
                alt={idx === i ? a.alt : ""}
                width={660}
                height={1300}
                loading={idx === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_30px_60px_rgba(6,42,68,0.5)] transition-opacity duration-700"
                style={{ opacity: idx === i ? 1 : 0 }}
                aria-hidden={idx !== i}
              />
            ))}
          </div>

          {/* Floating proof chips */}
          <FloatingChip className="left-0 top-[16%] lp-float-slow hidden sm:flex lg:-left-10 xl:-left-16" icon={<Gift className="h-4 w-4 text-emerald-600" />}>
            <b className="text-[#14213d]">+250 pts</b> <span className="text-slate-500">from today&apos;s spin</span>
          </FloatingChip>
          <FloatingChip className="right-0 top-[44%] lp-float-slower hidden sm:flex lg:-right-6 xl:-right-12" icon={<Flame className="h-4 w-4 text-[#0e7490]" />}>
            <b className="text-[#14213d]">Streak: 5 days</b> <span className="text-slate-500">reward unlocked</span>
          </FloatingChip>
          <FloatingChip className="left-[2%] bottom-[16%] lp-float hidden sm:flex lg:-left-8 xl:-left-14" icon={<Star className="h-4 w-4 text-amber-500" />}>
            <b className="text-[#14213d]">New 5-star review</b> <span className="text-slate-500">via the app</span>
          </FloatingChip>

          {/* Brand dots */}
          <div className="mt-5 flex items-center justify-center gap-2" role="tablist" aria-label="Apps built on Atlas">
            {APP_MOCKUPS.map((a, idx) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={idx === i}
                aria-label={a.name}
                onClick={() => setI(idx)}
                className="lp-focus h-2 rounded-full transition-all"
                style={{ width: idx === i ? 24 : 8, background: idx === i ? a.color : "rgba(255,255,255,0.35)" }}
              />
            ))}
            <span className="ml-2 text-xs text-slate-500">{app.name}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingChip({ children, className, icon }: { children: React.ReactNode; className?: string; icon: React.ReactNode }) {
  return (
    <div className={`lp-light absolute z-10 items-center gap-2 rounded-xl border border-[#e8dfd1] bg-white/95 px-3 py-2 text-[13px] shadow-[0_12px_30px_-10px_rgba(20,33,61,0.25)] backdrop-blur ${className ?? ""}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3ede2]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

// CP-102: ocean palette pass — tokens + light-surface remaps live in app/globals.css.
// CP-104: hero phone is now a slideshow of REAL app mockups (lib/landing/apps.ts);
// the CSS-built AppScreen mock moved out of the hero entirely.
