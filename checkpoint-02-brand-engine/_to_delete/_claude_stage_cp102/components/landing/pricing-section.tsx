"use client";
import { useEffect } from "react";
import { Check, Sparkles } from "lucide-react";
import { ANCHORS } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { Reveal, useInView } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * Pricing — CP-100. Single plan card + Founding Business Program. Price is a
 * placeholder; fires `pricing_viewed` once when scrolled into view.
 */
const INCLUDED = [
  "Your own branded customer app (iOS + web)",
  "Points, rewards, streaks, prize wheel, raffles",
  "Automated offers, birthdays, win-back campaigns",
  "Referral program + review requests",
  "Front-desk app with QR scan + staff PINs",
  "Push notifications to your customers",
  "Atlas Impact dashboard",
  "Setup and onboarding done with you",
];

export function PricingSection() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 });
  useEffect(() => {
    if (inView) track("pricing_viewed");
  }, [inView]);

  return (
    <section id={ANCHORS.pricing} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="pricing-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Pricing</p>
          <h2 id="pricing-title" className="lp-h2 mt-4">One flat plan. Less than one lost regular a month.</h2>
          <p className="mt-4 text-lg text-slate-600">No per-customer fees, no app-store submission fees, no developers.</p>
        </Reveal>

        <div ref={ref} className="mx-auto mt-12 grid max-w-4xl gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Reveal className="lp-card p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[#14213d]">Atlas Engine</h3>
                <p className="mt-1 text-sm text-slate-600">Everything, for one business location.</p>
              </div>
              <div className="text-right">
                <div className="lp-placeholder inline-block rounded-md px-2 py-1 font-mono text-[10px] text-slate-600">[ FINAL PRICING ]</div>
                <div className="mt-1 text-3xl font-semibold text-[#14213d]">
                  $XXX<span className="text-base font-medium text-slate-500">/mo</span>
                </div>
                <div className="whitespace-nowrap text-xs text-slate-500">+ $X,XXX setup [ CONFIRM ]</div>
              </div>
            </div>
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {INCLUDED.map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1f5f8b]" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <DemoCta source="pricing" className="w-full sm:w-auto">
                Book a demo to get pricing
              </DemoCta>
            </div>
          </Reveal>

          <Reveal delay={100} className="lp-light relative overflow-hidden rounded-2xl border border-[#7dd3fc] bg-gradient-to-b from-[#e6f6fc] to-white p-6 sm:p-8">
            <div className="flex items-center gap-2 text-[#0e7490]">
              <Sparkles className="h-4 w-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wider">Founding Business Program</span>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-[#14213d]">Launch early, lock in founding pricing.</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              We&apos;re onboarding a limited group of businesses at a founding rate in exchange for feedback and a case study.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#0e7490]" aria-hidden /> <span>Founding rate, locked for the life of the account <span className="lp-placeholder whitespace-nowrap rounded px-1 font-mono text-[10px]">[ CONFIRM ]</span></span></li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#0e7490]" aria-hidden /> Hands-on setup with the Atlas team</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-[#0e7490]" aria-hidden /> Input on what we build next</li>
            </ul>
            <p className="mt-5 text-xs text-slate-500">Spots: <span className="font-mono">[ X of XX remaining ]</span></p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
