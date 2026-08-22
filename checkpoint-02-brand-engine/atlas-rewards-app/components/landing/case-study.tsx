import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * Case study — CP-100. Full layout, all placeholder content.
 */
export function CaseStudy() {
  return (
    <section className="relative py-10 md:py-16" aria-labelledby="case-title">
      <div className="lp-container">
        <Reveal className="lp-card overflow-hidden">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            {/* Image */}
            <div className="lp-placeholder relative min-h-[240px] border-b border-white/[0.07] lg:border-b-0 lg:border-r">
              <div className="absolute inset-0 grid place-items-center font-mono text-xs text-zinc-500">[ CLIENT / STOREFRONT IMAGE — 1200×900 ]</div>
              <span className="absolute left-4 top-4 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-zinc-200">Case study</span>
            </div>

            <div className="p-6 sm:p-8 lg:p-10">
              <h2 id="case-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                [ Business name ] — [ industry ], [ city ]
              </h2>
              <p className="mt-2 text-sm text-zinc-400">[ One-line summary of the result ]</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Block k="Before" v="[ The situation — punch cards, no data, slow Tuesdays, etc. ]" />
                <Block k="With Atlas" v="[ What was launched — streak rule, prize wheel prizes, win-back offer, review flow ]" accent />
                <Block k="After" v="[ The outcome — repeat visits, reviews, revenue over N weeks ]" />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  ["+XX%", "repeat visits"],
                  ["XXX", "reviews"],
                  ["$X,XXX", "attributed revenue"],
                ].map(([n, l]) => (
                  <div key={l} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center">
                    <div className="text-xl font-semibold text-white">{n}</div>
                    <div className="text-[11px] text-zinc-500">{l}</div>
                  </div>
                ))}
              </div>

              <blockquote className="mt-6 border-l-2 border-cyan-300/50 pl-4 text-[15px] italic text-zinc-300">
                “[ Short owner quote about the moment it clicked. ]”
                <footer className="mt-1 text-xs not-italic text-zinc-500">— [ Owner name ], [ Business ]</footer>
              </blockquote>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <DemoCta source="case_study" size="md">
                  Get results like this
                </DemoCta>
                <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
                  Full write-up <ArrowRight className="h-3.5 w-3.5" aria-hidden /> <span className="font-mono text-[10px]">[ CASE STUDY LINK ]</span>
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
    <div className={`rounded-xl border p-3.5 ${accent ? "border-cyan-300/30 bg-cyan-400/[0.07]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${accent ? "text-cyan-200" : "text-zinc-500"}`}>{k}</div>
      <div className="mt-1.5 text-xs leading-relaxed text-zinc-400">{v}</div>
    </div>
  );
}
