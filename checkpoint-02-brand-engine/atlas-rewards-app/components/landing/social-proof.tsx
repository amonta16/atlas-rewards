import { Quote } from "lucide-react";
import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";

/**
 * Results + testimonials — CP-100.
 * EVERYTHING here is a labeled placeholder. Replace with real numbers and
 * real quotes only. Never ship invented stats as fact.
 */
const STATS = [
  { v: "+XX%", l: "repeat visits", note: "[ CUSTOMER RESULT ]" },
  { v: "XXX", l: "customers reactivated", note: "[ CUSTOMER RESULT ]" },
  { v: "$XX,XXX", l: "revenue attributed", note: "[ CUSTOMER RESULT ]" },
  { v: "X.Xx", l: "return on the program", note: "[ CUSTOMER RESULT ]" },
];

const TESTIMONIALS = [
  { q: "“Testimonial goes here — what changed for the business in their own words.”", n: "Name", c: "Business · City", slot: "#1" },
  { q: "“Testimonial goes here — ideally a specific number or a specific moment.”", n: "Name", c: "Business · City", slot: "#2" },
  { q: "“Testimonial goes here — something about the front desk or the customers' reaction.”", n: "Name", c: "Business · City", slot: "#3" },
];

export function SocialProof() {
  return (
    <section id={ANCHORS.results} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="results-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Results</p>
          <h2 id="results-title" className="lp-h2 mt-4">What businesses see after launch.</h2>
          <p className="mt-3 text-sm text-zinc-500">
            <span className="lp-placeholder rounded px-1.5 py-0.5 font-mono text-[11px]">PLACEHOLDER STATISTICS — replace with real, verified results</span>
          </p>
        </Reveal>

        <dl className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.l} delay={i * 70} className="lp-card p-5 text-center sm:p-6">
              <dd className="lp-gradient-text text-4xl font-semibold tabular-nums sm:text-5xl">{s.v}</dd>
              <dt className="mt-2 text-sm text-zinc-300">{s.l}</dt>
              <div className="mt-2 font-mono text-[10px] text-zinc-600">{s.note}</div>
            </Reveal>
          ))}
        </dl>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.slot} delay={i * 90} as="article" className="lp-card flex flex-col p-6 sm:p-7">
              <Quote className="h-6 w-6 text-cyan-300/70" aria-hidden />
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-zinc-200">{t.q}</blockquote>
              <footer className="mt-6 flex items-center gap-3">
                <div className="lp-placeholder grid h-11 w-11 shrink-0 place-items-center rounded-full text-[8px] text-zinc-500">[ HEADSHOT ]</div>
                <div>
                  <div className="text-sm font-semibold text-white">{t.n}</div>
                  <div className="text-xs text-zinc-500">{t.c}</div>
                </div>
                <span className="ml-auto font-mono text-[10px] text-zinc-600">[ TESTIMONIAL {t.slot} ]</span>
              </footer>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
