import { ArrowRight, MapPin } from "lucide-react";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * Case study — CP-103: Exotic Smoke Shop (first live install, Aug 2026).
 * Photos are real (public/landing/exotic-*.jpg). The RESULT NUMBERS are
 * clearly-labeled illustrative placeholders until the first weeks of live
 * Impact-dashboard data replace them — swap them in STATS below.
 */
const STATS: Array<[string, string]> = [
  ["+XX%", "repeat visits"],
  ["XXX", "members joined"],
  ["$X,XXX", "attributed revenue"],
];

export function CaseStudy() {
  return (
    <section className="relative py-10 md:py-16" aria-labelledby="case-title">
      <div className="lp-container">
        <Reveal className="lp-card overflow-hidden">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            {/* Launch photos */}
            <div className="relative min-h-[280px] border-b border-[#e8dfd1] lg:border-b-0 lg:border-r">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/exotic-storefront.jpg"
                alt="The Atlas team with the owner of Exotic Smoke Shop next to the Earn Free Rewards banner at the shop entrance"
                width={1600}
                height={1200}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute left-4 top-4 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-[#14213d]">Launch day · live install</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/exotic-instore.jpg"
                alt="Inside Exotic Smoke Shop with the rewards banner set up by the register"
                width={1600}
                height={1200}
                loading="lazy"
                className="absolute -right-3 bottom-4 hidden w-44 rotate-2 rounded-lg border-4 border-white object-cover shadow-[0_16px_40px_-12px_rgba(6,42,68,0.6)] sm:block lg:w-52"
              />
            </div>

            <div className="p-6 sm:p-8 lg:p-10">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#1f5f8b]">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Case study · first launch
              </p>
              <h2 id="case-title" className="mt-2 text-2xl font-semibold tracking-tight text-[#14213d] sm:text-3xl">
                Exotic Smoke Shop — retail, San Luis Obispo
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Banner at the door, QR by the register, app live in the App Store — set up in one visit with the owner.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Block k="Before" v="Regulars with no reason to pick this shop over the next one, and no way to reach them after they left." />
                <Block k="With Atlas" v="$1 = 100 pts, free-product rewards, 800 pts for a Google review, and 5% off the first order for installing the app." accent />
                <Block k="After" v="Every walk-in gets asked to scan at checkout — points, reviews and win-backs now run on their own." />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {STATS.map(([n, l]) => (
                  <div key={l} className="rounded-xl border border-[#e8dfd1] bg-white p-3 text-center">
                    <div className="text-xl font-semibold text-[#14213d]">{n}</div>
                    <div className="text-[11px] text-slate-500">{l}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] text-slate-400">[ ILLUSTRATIVE PLACEHOLDERS — first weeks of live Impact data replace these ]</p>

              <blockquote className="mt-5 border-l-2 border-[#1f5f8b]/40 pl-4 text-[15px] italic text-slate-700">
                “[ Owner quote — ask on the next check-in visit. ]”
                <footer className="mt-1 text-xs not-italic text-slate-500">— Owner, Exotic Smoke Shop</footer>
              </blockquote>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <DemoCta source="case_study" size="md">
                  Get set up like this
                </DemoCta>
                <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                  Full write-up coming <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Block({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 ${accent ? "border-[#1f5f8b]/40 bg-[#e6f1f8]" : "border-[#e8dfd1] bg-white"}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${accent ? "text-[#1f5f8b]" : "text-slate-500"}`}>{k}</div>
      <div className="mt-1.5 text-xs leading-relaxed text-slate-600">{v}</div>
    </div>
  );
}

// CP-102: ocean palette pass — tokens + light-surface remaps live in app/globals.css.
// CP-103: real Exotic Smoke Shop launch photos + copy; numbers stay labeled placeholders.
