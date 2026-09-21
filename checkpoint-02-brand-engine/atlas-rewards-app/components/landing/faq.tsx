"use client";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANCHORS, CONTACT_EMAIL } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { Reveal } from "./reveal";
import { FAQS } from "@/lib/landing/faqs";

/** FAQ — CP-145. Centered accordion; content lives in lib/landing/faqs.ts. */
export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <section id={ANCHORS.faq} className="lp-section lp-tint scroll-mt-24" aria-labelledby="faq-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">FAQ</p>
          <h2 id="faq-title" className="lp-h2 mt-4">Questions owners ask first.</h2>
        </Reveal>
        <Reveal delay={80} className="mx-auto mt-10 max-w-2xl">
          <div className="divide-y divide-[#e3e9f0] rounded-2xl border border-[#e3e9f0] bg-white">
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
                      className="lp-focus flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-[#14213d] transition-colors hover:bg-[#f3f7fb] sm:px-6 sm:text-base"
                    >
                      {f.q}
                      <ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300", isOpen && "rotate-180 text-[#1f5f8b]")} aria-hidden />
                    </button>
                  </h3>
                  <div
                    id={`${id}-panel`}
                    role="region"
                    aria-labelledby={`${id}-btn`}
                    className={cn("grid transition-[grid-template-rows] duration-300 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-[15px] leading-relaxed text-slate-600 sm:px-6">{f.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-center text-sm text-slate-500">
            Something else?{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="lp-focus rounded font-medium text-[#1f5f8b] underline-offset-2 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
