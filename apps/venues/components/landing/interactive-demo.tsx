"use client";
import { useState } from "react";
import { Dumbbell, Gamepad2, Sparkles, Store, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_MOCKUPS, type AppMockup } from "@/lib/landing/apps";
import { ANCHORS } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  area51: Store,
  reveal: Sparkles,
  flippos: Gamepad2,
  spa: Waves,
  gym: Dumbbell,
};

/**
 * "See what your app could look like" — CP-104.
 * No more CSS mock: the visitor flips between REAL apps built on Atlas
 * (3/4-angle iPhone mockups from lib/landing/apps.ts). Same engine, four
 * completely different brands — white-label shown, not explained.
 */
export function InteractiveDemo() {
  const [app, setApp] = useState<AppMockup>(APP_MOCKUPS[0]);
  const [used, setUsed] = useState(false);

  const pick = (a: AppMockup) => {
    setApp(a);
    if (!used) {
      setUsed(true);
      track("interactive_demo_used", { demo: "app_picker", app: a.id });
    }
  };

  return (
    <section id={ANCHORS.demo} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="demo-title">
      <div className="lp-container grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-20">
        <Reveal>
          <p className="lp-eyebrow">Your brand, not ours</p>
          <h2 id="demo-title" className="lp-h2 mt-4">See what your app could look like.</h2>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            These are real apps built on Atlas — a smoke shop, a med spa, an arcade and a day spa. Flip between them:
            the logo, colors, offers and rewards change, the engine underneath doesn&apos;t. That&apos;s how we launch fast.
          </p>

          <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Choose an app built on Atlas">
            {APP_MOCKUPS.map((a) => {
              const I = ICONS[a.id] ?? Store;
              const active = a.id === app.id;
              return (
                <button
                  key={a.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(a)}
                  className={cn(
                    "lp-focus inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all",
                    active
                      ? "lp-light border-white/60 bg-white text-[#14213d] shadow-[0_8px_24px_-10px_rgba(6,42,68,0.7)]"
                      : "border-white/25 bg-white/10 text-white backdrop-blur-sm hover:border-white/50 hover:bg-white/20",
                  )}
                >
                  <I className="h-4 w-4" style={active ? { color: a.color } : undefined} aria-hidden />
                  {a.label}
                </button>
              );
            })}
          </div>

          {/* What changed */}
          <dl className="mt-8 grid gap-3 sm:grid-cols-2">
            <Spec k="Brand" v={app.name} swatch={app.color} />
            <Spec k="Featured offer" v={app.offer} />
            <Spec k="Loyalty" v={app.points} />
            <Spec k="Live on" v="iOS app + web — same account" />
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DemoCta source="interactive_demo">See it in my brand</DemoCta>
            <p className="text-sm text-slate-500">Bring a logo to the demo and we&apos;ll mock yours up live.</p>
          </div>
        </Reveal>

        <Reveal delay={100} className="relative">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-colors duration-700"
            style={{ background: `${app.color}2e` }}
            aria-hidden
          />
          <div className="relative mx-auto h-[520px] w-[320px] sm:h-[600px] sm:w-[370px]">
            {APP_MOCKUPS.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={a.tilt}
                alt={a.id === app.id ? a.alt : ""}
                width={840}
                height={1400}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_36px_70px_rgba(6,42,68,0.55)] transition-opacity duration-500"
                style={{ opacity: a.id === app.id ? 1 : 0 }}
                aria-hidden={a.id !== app.id}
              />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Spec({ k, v, swatch }: { k: string; v: string; swatch?: string }) {
  return (
    <div className="lp-light rounded-xl border border-white/40 bg-white/90 px-4 py-3 backdrop-blur-sm">
      <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
      <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-[#14213d]">
        {swatch && <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white transition-colors duration-500" style={{ background: swatch }} aria-hidden />}
        <span className="transition-opacity duration-300">{v}</span>
      </dd>
    </div>
  );
}

// CP-102: ocean palette pass — tokens + light-surface remaps live in app/globals.css.
// CP-104: replaced the CSS-built AppScreen with real 3/4-angle app mockups.
