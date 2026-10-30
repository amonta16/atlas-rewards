"use client";
import { useState } from "react";
import { Gamepad2, Sparkles, Store, Waves } from "lucide-react";
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
};

/**
 * "Preview your app" — CP-145 (was InteractiveDemo).
 * Flip between real apps built on Atlas. Same engine, different brand.
 * Copy cut to a headline, one line, and the picker.
 */
export function AppPicker() {
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
    <section id={ANCHORS.demo} className="lp-section lp-tint relative scroll-mt-24 overflow-hidden" aria-labelledby="demo-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Preview your app</p>
          <h2 id="demo-title" className="lp-h2 mt-4">Your venue. Your logo. Your app.</h2>
          <p className="lp-lead mt-4">Real apps running on Atlas today — an arcade first. Tap one.</p>
        </Reveal>

        <Reveal delay={80} className="mt-8">
          <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Choose an app built on Atlas">
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
                  "lp-focus inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all",
                  active ? "border-[#14213d] bg-[#14213d] text-white shadow-md" : "border-[#e3e9f0] bg-white text-[#14213d] hover:border-[#14213d]/40",
                )}
              >
                <I className="h-4 w-4" style={active ? { color: a.color } : undefined} aria-hidden />
                {a.label}
              </button>
            );
          })}
          </div>
        </Reveal>

        <Reveal delay={140} className="relative mx-auto mt-10 max-w-3xl">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700"
            style={{ background: `${app.color}33` }}
            aria-hidden
          />
          <div className="relative mx-auto h-[480px] w-[300px] sm:h-[600px] sm:w-[370px]">
            {APP_MOCKUPS.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={a.tilt}
                alt={a.id === app.id ? a.alt : ""}
                width={840}
                height={1400}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_36px_70px_rgba(20,33,61,0.35)] transition-opacity duration-500"
                style={{ opacity: a.id === app.id ? 1 : 0 }}
                aria-hidden={a.id !== app.id}
              />
            ))}
          </div>

          <dl className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
            <Spec k="Business" v={app.name} swatch={app.color} />
            <Spec k="Featured offer" v={app.offer} />
            <Spec k="Loyalty" v={app.points} />
          </dl>
        </Reveal>

        <Reveal delay={200} className="mt-10 flex flex-col items-center gap-3 text-center">
          <DemoCta source="app_picker">See it in my brand</DemoCta>
          <p className="text-sm text-slate-500">Bring your logo to the demo — we mock yours up live.</p>
        </Reveal>
      </div>
    </section>
  );
}

function Spec({ k, v, swatch }: { k: string; v: string; swatch?: string }) {
  return (
    <div className="rounded-xl border border-[#e3e9f0] bg-white px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
      <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-[#14213d]">
        {swatch && <span className="h-3.5 w-3.5 shrink-0 rounded-full transition-colors duration-500" style={{ background: swatch }} aria-hidden />}
        <span>{v}</span>
      </dd>
    </div>
  );
}
