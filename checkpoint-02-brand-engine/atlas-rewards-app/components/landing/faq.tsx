"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANCHORS } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { Reveal } from "./reveal";
import { FAQS } from "@/lib/landing/faqs";

/**
 * FAQ — CP-100. Accessible accordion (button + aria-expanded + region).
 * Questions/answers live in lib/landing/faqs.ts (shared with JSON-LD).
 */


export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <section id={ANCHORS.faq} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="faq-title">
      <div className="lp-container grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="lp-eyebrow">FAQ</p>
          <h2 id="faq-title" className="lp-h2 mt-4">Questions owners ask before they say yes.</h2>
          <p className="mt-4 text-zinc-400">Anything else — ask on the demo, or email us any time.</p>
        </Reveal>
        <Reveal delay={80}>
          <div className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              const id = `${base}-${i}`;
              return (
                <div key={f.q}>
                  <h3>
                    <button
                      type="button"
                      id={`${id}-btn`}
                      aria-expanded={isOpen}
                      aria-controls={`${id}-panel`}
                      onClick={() => {
                        setOpen(isOpen ? null : i);
                        if (!isOpen) track("faq_opened", { question: f.q });
                      }}
                      className="lp-focus flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-white transition-colors hover:bg-white/[0.03] sm:px-6 sm:text-base"
                    >
                      {f.q}
                      <ChevronDown className={cn("h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-300", isOpen && "rotate-180 text-cyan-300")} aria-hidden />
                    </button>
                  </h3>
                  <div
                    id={`${id}-panel`}
                    role="region"
                    aria-labelledby={`${id}-btn`}
                    className={cn("grid transition-[grid-template-rows] duration-300 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-[15px] leading-relaxed text-zinc-400 sm:px-6">{f.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
