import { MapPin } from "lucide-react";
import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * Featured venue — CP-176: install day at Flippo's Arcade & Batting Cage
 * (Morro Bay). Real photo of the Atlas team with the owner and the rewards
 * banner. FACTS are what the app does there; add result numbers only when
 * the dashboard has them — never placeholders on a live page.
 */
const FACTS = [
  "Scan-to-join banner and table tents at the counter",
  "Happy Hour Tuesday pushed to every member's phone",
  "Points on every visit, banked toward cages, arcade credits and food",
  "Set up in one visit with the owner — no new computer at the desk",
];

export function CaseStudy() {
  return (
    <section id={ANCHORS.results} className="lp-section lp-tint scroll-mt-24" aria-labelledby="case-title">
      <div className="lp-container">
        <Reveal className="lp-card overflow-hidden">
          <div>
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-200 sm:aspect-[21/9]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/flippos-install-owner.webp"
                alt="The Atlas Engine team with the owner of Flippo's Arcade & Batting Cage, next to the in-store rewards banner"
                width={1800}
                height={1200}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-[50%_40%]"
              />
              <span className="lp-light absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#14213d] shadow backdrop-blur">
                Install day · Morro Bay
              </span>
            </div>
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:p-10">
              <div>
              <p className="lp-eyebrow">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> Featured venue
              </p>
              <h2 id="case-title" className="mt-3 text-2xl font-semibold tracking-tight text-[#14213d] sm:text-3xl">
                Flippo&apos;s Arcade &amp; Batting Cage
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                We set it up at the counter with the owner: the banner, the table tents, and an app in Flippo&apos;s own colors.
              </p>
              </div>
              <div>
              <ul className="space-y-2.5 text-[15px] text-slate-600">
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
          </div>
        </Reveal>
      </div>
    </section>
  );
}
