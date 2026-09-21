"use client";
import { useEffect, useState } from "react";
import { Bell, CalendarCheck, FileSignature } from "lucide-react";
import { APP_MOCKUPS } from "@/lib/landing/apps";
import { ANCHORS } from "@/lib/landing/config";
import { DemoCta, PreviewCta } from "./cta-button";

/**
 * Hero — CP-145.
 * Centered, type-led: one promise, one sentence, two buttons, one phone.
 * The phone is a slideshow of REAL apps built on Atlas, sitting on a navy
 * stage so the light page still gets one strong visual anchor.
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
    <section className="lp-hero-glow relative overflow-hidden pt-28 md:pt-36" aria-labelledby="hero-title" id={ANCHORS.product}>
      <div className="lp-container">
        <div className="mx-auto max-w-4xl text-center">
          <h1 id="hero-title" className="lp-h1">
            The app your guests keep.
            <br />
            <span className="lp-gradient-text">Built for fun centers.</span>
          </h1>
          <p className="lp-lead mx-auto mt-6 max-w-xl">
            Parties, memberships, waivers and rewards in one app with your name on it — set up with you in one visit.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DemoCta source="hero" event="hero_cta_clicked" size="xl" className="w-full sm:w-auto" />
            <PreviewCta source="hero" size="xl" className="w-full sm:w-auto" />
          </div>
          <p className="mt-5 text-sm text-slate-500">No new computer · Works with any POS · Live in one visit</p>
        </div>

        {/* Phone stage */}
        <div className="relative mx-auto mt-12 max-w-4xl md:mt-16">
          <div className="lp-phone-stage relative overflow-hidden rounded-[2rem] px-6 pt-10 sm:rounded-[2.5rem] sm:px-10 sm:pt-14">
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700"
              style={{ background: `${app.color}55` }}
              aria-hidden
            />
            <div className="relative mx-auto h-[440px] w-[240px] overflow-hidden sm:h-[520px] sm:w-[280px]">
              {APP_MOCKUPS.map((a, idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={a.upright}
                  alt={idx === i ? a.alt : ""}
                  width={660}
                  height={1300}
                  loading={idx === 0 ? "eager" : "lazy"}
                  className="absolute inset-x-0 top-0 w-full object-contain object-top drop-shadow-[0_30px_60px_rgba(0,0,0,0.45)] transition-opacity duration-700"
                  style={{ opacity: idx === i ? 1 : 0 }}
                  aria-hidden={idx !== i}
                />
              ))}
            </div>

            <Chip className="left-4 top-8 hidden sm:flex lg:left-12 lg:top-14" icon={<Bell className="h-4 w-4 text-[#1f5f8b]" />}>
              <b>Slow Tuesday</b> <span className="text-slate-500">happy-hour push sent</span>
            </Chip>
            <Chip className="right-4 top-[38%] hidden sm:flex lg:right-12" icon={<CalendarCheck className="h-4 w-4 text-emerald-600" />}>
              <b>Party rebooked</b> <span className="text-slate-500">11 months later</span>
            </Chip>
            <Chip className="bottom-10 left-6 hidden sm:flex lg:left-16" icon={<FileSignature className="h-4 w-4 text-[#1f5f8b]" />}>
              <b>Waiver signed</b> <span className="text-slate-500">on their phone</span>
            </Chip>
          </div>

          {/* Brand dots */}
          <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Apps built on Atlas">
            {APP_MOCKUPS.map((a, idx) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={idx === i}
                aria-label={a.name}
                onClick={() => setI(idx)}
                className="lp-focus h-2 rounded-full transition-all"
                style={{ width: idx === i ? 24 : 8, background: idx === i ? a.color : "#d5dde6" }}
              />
            ))}
            <span className="ml-2 text-xs text-slate-500">{app.name}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({ children, className, icon }: { children: React.ReactNode; className?: string; icon: React.ReactNode }) {
  return (
    <div className={`lp-light lp-float-slow absolute z-10 items-center gap-2 rounded-xl bg-white px-3 py-2 text-[13px] text-[#14213d] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.45)] ${className ?? ""}`}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3f7fb]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

// CP-145: centered type-led hero on a white page; phone lives on a navy stage.
