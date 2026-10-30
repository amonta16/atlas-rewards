"use client";
import { useEffect } from "react";
import { Check } from "lucide-react";
import { ANCHORS } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { Reveal, useInView } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * Pricing — CP-145. One plan, one card, no number on the page (pricing
 * moves; the demo is where it's quoted). Fires `pricing_viewed` once.
 */
const INCLUDED = [
  "Your branded guest app — iOS + web",
  "Party reminders, memberships, waivers",
  "Rewards, events, slow-night pushes",
  "Google reviews, referrals, prize wheel",
  "Front-desk scanner app for staff",
  "Setup and launch done with you, in person",
];

export function PricingSection() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 });
  useEffect(() => {
    if (inView) track("pricing_viewed");
  }, [inView]);

  return (
    <section id={ANCHORS.pricing} className="lp-section scroll-mt-24" aria-labelledby="pricing-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Pricing</p>
          <h2 id="pricing-title" className="lp-h2 mt-4">One flat monthly plan.</h2>
          <p className="lp-lead mt-4">Less than one birthday party a month. No per-guest fees, no contract to book a call.</p>
        </Reveal>

        <Reveal className="mx-auto mt-10 max-w-2xl">
          <div ref={ref} className="lp-card p-6 sm:p-8">
            <ul className="grid gap-3 sm:grid-cols-2">
              {INCLUDED.map((t) => (
                <li key={t} className="flex gap-2.5 text-[15px] text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1f5f8b]" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <DemoCta source="pricing" className="w-full sm:w-auto">
                Get pricing on a demo
              </DemoCta>
              <p className="text-sm text-slate-500">Founding venues lock in founding pricing. Your own App Store listing available as an add-on.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
