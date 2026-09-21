import { BadgeCheck, CalendarCheck, FileSignature, Gift, type LucideIcon } from "lucide-react";
import { Reveal } from "./reveal";

/**
 * Features — CP-145. Four cards, one sentence each. Everything else is a
 * single line underneath. (Replaces FeatureShowcase + RewardsDemo +
 * AnalyticsDemo + ProblemSection + BeforeAfter.)
 */
const FEATURES: Array<{ icon: LucideIcon; t: string; d: string }> = [
  { icon: CalendarCheck, t: "Birthday parties that rebook", d: "Every party family gets the app at the desk. Eleven months later, the reminder to book again sends itself." },
  { icon: BadgeCheck, t: "Memberships", d: "Sell and renew memberships in the app. Lapsing members get a nudge before they're gone." },
  { icon: FileSignature, t: "Digital waivers", d: "Guests sign on their own phone while they wait — and every signed waiver becomes a member you can reach." },
  { icon: Gift, t: "Rewards, events & slow nights", d: "Points on every visit, and one push to fill a dead Tuesday with a happy-hour deal." },
];

export function Features() {
  return (
    <section className="lp-section" aria-labelledby="features-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">What it does</p>
          <h2 id="features-title" className="lp-h2 mt-4">Built around how a venue actually makes money.</h2>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: I, t, d }, i) => (
            <Reveal as="li" key={t} delay={i * 70} className="lp-card p-6 sm:p-7">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#f3f7fb] text-[#1f5f8b]">
                <I className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-[#14213d]">{t}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{d}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={300} className="mt-6 text-center text-sm text-slate-500">
          Also included: Google review requests, referrals, a prize wheel, a front-desk scanner app and a results dashboard.
        </Reveal>
      </div>
    </section>
  );
}
