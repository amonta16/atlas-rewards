import { Check, X } from "lucide-react";
import { Reveal } from "./reveal";

const WITHOUT = [
  "A punch card that lives in a wallet (or the trash)",
  "No way to reach customers after they leave",
  "Reviews only when someone's upset",
  "Lapsed customers quietly disappear",
  "Every dollar of growth comes from new acquisition",
  "No idea which customers are worth the most",
];
const WITH = [
  "Your own app on their phone, in your brand",
  "Push offers and win-back messages, in your voice",
  "Review requests after good visits, rewarded with points",
  "Dormant customers detected and re-engaged automatically",
  "Streaks, spins and referrals pull the same customers back",
  "An Impact dashboard that shows what it's all worth",
];

export function BeforeAfter() {
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="ba-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Before / after</p>
          <h2 id="ba-title" className="lp-h2 mt-4">Same customers. Different relationship.</h2>
        </Reveal>
        <div className="relative mt-12 grid gap-4 lg:grid-cols-2">
          <Reveal className="rounded-2xl border border-[#e8dfd1] bg-white p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Without Atlas</h3>
            <ul className="mt-5 space-y-3.5">
              {WITHOUT.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] text-slate-600">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#f3ede2] text-slate-500">
                    <X className="h-3 w-3" aria-hidden />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="relative overflow-hidden rounded-2xl border border-[#1f5f8b]/40 bg-gradient-to-b from-[#e6f1f8] to-white p-6 sm:p-8 shadow-[0_20px_60px_-30px_rgba(31,95,139,0.35)]">
            <div className="lp-grid absolute inset-0 opacity-20" aria-hidden />
            <h3 className="relative text-sm font-semibold uppercase tracking-wider text-[#1f5f8b]">With Atlas</h3>
            <ul className="relative mt-5 space-y-3.5">
              {WITH.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] text-slate-800">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#d6e8f3] text-[#1f5f8b]">
                    <Check className="h-3 w-3" aria-hidden />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// CP-101: light "Central Coast" palette pass — colors live in app/globals.css (.lp-root tokens).
