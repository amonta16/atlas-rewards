"use client";
import { useState } from "react";
import { Coffee, Dumbbell, Scissors, Sparkles, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { INDUSTRIES, type Industry } from "@/lib/landing/industries";
import { ANCHORS } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { AppScreen, Phone } from "./app-preview";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  coffee: Coffee,
  gym: Dumbbell,
  salon: Scissors,
  restaurant: UtensilsCrossed,
  medspa: Sparkles,
};

/**
 * "See what your app could look like" — CP-100.
 * Visitor picks an industry; the phone, colors, rewards, offer and referral
 * all re-theme instantly. Communicates white-label without reading.
 */
export function InteractiveDemo() {
  const [brand, setBrand] = useState<Industry>(INDUSTRIES[0]);
  const [used, setUsed] = useState(false);

  const pick = (b: Industry) => {
    setBrand(b);
    if (!used) {
      setUsed(true);
      track("interactive_demo_used", { demo: "industry_picker", industry: b.id });
    }
  };

  return (
    <section id={ANCHORS.demo} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="demo-title">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[600px] -translate-y-1/2 bg-[radial-gradient(50%_50%_at_70%_50%,rgba(42,143,181,0.10),transparent)]" aria-hidden />
      <div className="lp-container grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-20">
        <Reveal>
          <p className="lp-eyebrow">Your brand, not ours</p>
          <h2 id="demo-title" className="lp-h2 mt-4">See what your app could look like.</h2>
          <p className="mt-4 max-w-xl text-lg text-slate-600">
            Pick a business. Your logo, colors, rewards, offers and referral deal change — the engine underneath stays the
            same. That&apos;s how we launch fast.
          </p>

          <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Choose an example business">
            {INDUSTRIES.map((b) => {
              const I = ICONS[b.id] ?? Sparkles;
              const active = b.id === brand.id;
              return (
                <button
                  key={b.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => pick(b)}
                  className={cn(
                    "lp-focus inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all",
                    active
                      ? "border-[#e8dfd1] bg-[#14213d] text-white shadow-[0_8px_24px_-10px_rgba(20,33,61,0.5)]"
                      : "border-[#e8dfd1] bg-white text-slate-700 hover:border-[#e8dfd1] hover:bg-[#f3ede2]",
                  )}
                >
                  <I className="h-4 w-4" aria-hidden />
                  {b.label}
                </button>
              );
            })}
          </div>

          {/* What changed */}
          <dl className="mt-8 grid gap-3 sm:grid-cols-2">
            <Spec k="Brand" v={brand.name} swatch={[brand.primary, brand.secondary]} />
            <Spec k="Top reward" v={brand.reward} />
            <Spec k="Live offer" v={brand.offer} />
            <Spec k="Referral deal" v={brand.referral} />
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DemoCta source="interactive_demo">See it in my brand</DemoCta>
            <p className="text-sm text-slate-500">Bring a logo to the demo and we&apos;ll mock yours up live.</p>
          </div>
        </Reveal>

        <Reveal delay={100} className="relative">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl transition-colors duration-700" style={{ background: `${brand.secondary}22` }} aria-hidden />
          <Phone width={300} className="relative">
            <AppScreen brand={brand} />
          </Phone>
        </Reveal>
      </div>
    </section>
  );
}

function Spec({ k, v, swatch }: { k: string; v: string; swatch?: string[] }) {
  return (
    <div className="lp-light rounded-xl border border-[#e8dfd1] bg-white px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wider text-slate-500">{k}</dt>
      <dd className="mt-1 flex items-center gap-2 text-sm font-medium text-[#14213d]">
        {swatch && (
          <span className="flex -space-x-1" aria-hidden>
            {swatch.map((c) => (
              <span key={c} className="h-4 w-4 rounded-full ring-2 ring-white transition-colors duration-500" style={{ background: c }} />
            ))}
          </span>
        )}
        <span className="transition-opacity duration-300">{v}</span>
      </dd>
    </div>
  );
}

// CP-101: light "Central Coast" palette pass — colors live in app/globals.css (.lp-root tokens).
