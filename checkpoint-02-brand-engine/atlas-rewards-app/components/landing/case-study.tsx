import { MapPin } from "lucide-react";
import { APP_MOCKUPS } from "@/lib/landing/apps";
import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * Featured venue — CP-146: Flippo's Arcade & Batting Cage (Morro Bay).
 * Shows the real app mockup until launch photos exist. FACTS are what the
 * app does at Flippo's; add result numbers here only when the dashboard
 * has them — never placeholders on a live page.
 */
const FACTS = [
  "Happy Hour Tuesday pushed to every member's phone",
  "Points on every visit, banked toward free play",
  "Set up in one visit with the owner — no new computer at the desk",
];

export function CaseStudy() {
  const app = APP_MOCKUPS.find((a) => a.id === "flippos") ?? APP_MOCKUPS[0];
  return (
    <section id={ANCHORS.results} className="lp-section lp-tint scroll-mt-24" aria-labelledby="case-title">
      <div className="lp-container">
        <Reveal className="lp-card overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <div className="relative flex min-h-[320px] items-end justify-center overflow-hidden px-6 pt-8" style={{ background: `linear-gradient(180deg, ${app.color}22, ${app.color}55)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={app.tilt}
                alt={app.alt}
                width={840}
                height={1400}
                loading="lazy"
                className="w-[260px] object-contain object-bottom drop-shadow-[0_30px_60px_rgba(20,33,61,0.35)] sm:w-[300px]"
              />
            </div>
            <div className="p-6 sm:p-8 lg:p-10">
              <p className="lp-eyebrow">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Featured venue
              </p>
              <h2 id="case-title" className="mt-3 text-2xl font-semibold tracking-tight text-[#14213d] sm:text-3xl">Flippo&apos;s Arcade &amp; Batting Cage, Morro Bay</h2>
              <ul className="mt-5 space-y-2.5 text-[15px] text-slate-600">
                {FACTS.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f5f8b]" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <DemoCta source="case_study" size="md">
                  Get set up like this
                </DemoCta>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
