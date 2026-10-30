"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/landing/quiz-model";
import { REBOOK, SCENARIOS, estimateMedspa } from "@/lib/landing/medspa-quiz-model";
import { track } from "@/lib/landing/analytics";

/**
 * RecallCalculator — CP-183. The Owner.com "grader" idea, for med spas: three
 * inputs, a live estimate, then the full quiz. Same model as the quiz
 * (lib/landing/medspa-quiz-model.ts). Planning estimate, labeled as such.
 */
const CHOICES = REBOOK.filter((r) => r.id !== "unknown");

/** CP-184: the big number glides to its new value instead of jumping. */
function useTween(target: number, ms = 650) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (target - a) * e;
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return Math.round(shown / 10) * 10;
}

export function RecallCalculator({ onContinue }: { onContinue: () => void }) {
  const [visits, setVisits] = useState(200);
  const [value, setValue] = useState(400);
  const [rebook, setRebook] = useState(CHOICES[1].id);
  const [touched, setTouched] = useState(false);
  const lapse = CHOICES.find((c) => c.id === rebook)?.lapse ?? 0.5;
  const est = useMemo(() => estimateMedspa(visits, value, lapse, 1), [visits, value, lapse]);
  const likelyShown = useTween(est.likely);
  const touch = () => { if (!touched) { setTouched(true); track("interactive_demo_used", { demo: "medspa_calculator" }); } };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
      <div className="space-y-9">
        <Slider label="Patient visits in a typical month" value={visits} min={50} max={1000} step={25} display={visits.toLocaleString()}
          onChange={(v) => { touch(); setVisits(v); }} />
        <Slider label="What a typical visit is worth" value={value} min={100} max={1200} step={25} display={fmtMoney(value)}
          onChange={(v) => { touch(); setValue(v); }} />
        <fieldset>
          <legend className="text-[15px] text-[#d5e2e2]">Of patients due for their next treatment, how many book on time?</legend>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup">
            {CHOICES.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={c.id === rebook}
                onClick={() => { touch(); setRebook(c.id); }}
                className={cn("ms-focus rounded-xl px-3 py-3 text-left text-[14px] leading-tight transition-colors",
                  c.id === rebook ? "bg-white text-[var(--ms-ink)]" : "bg-white/[0.06] text-[#d5e2e2] hover:bg-white/[0.12]")}>
                {c.label.replace(" (80%+)", "")}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col justify-between rounded-[28px] bg-white/[0.06] p-7 ring-1 ring-white/10 sm:p-9">
        <div>
          <p className="text-[15px] text-[#b9cbcc]">Revenue recall could win back in a year</p>
          <p className="ms-num mt-2 text-[clamp(3.2rem,2rem+4vw,5rem)] leading-none text-white" aria-live="polite" aria-atomic="true"><span className="sr-only">{fmtMoney(est.likely)}</span><span aria-hidden>{fmtMoney(likelyShown)}</span></p>
          <p className="mt-3 text-[15px] text-[#b9cbcc]">
            About {fmtMoney(est.perMonth)} a month, from roughly {est.recovered.toLocaleString()} of the {est.lapsedVisits.toLocaleString()} due visits that slip each year. Range {fmtMoney(est.low)} to {fmtMoney(est.high)}.
          </p>
        </div>
        <div className="mt-8">
          <button type="button" onClick={() => { track("hero_cta_clicked", { source: "medspa_calculator", est_likely: est.likely }); onContinue(); }}
            className="ms-btn ms-btn-light ms-focus w-full sm:w-auto">
            See my practice&apos;s app and full estimate
          </button>
          <p className="mt-4 text-[13px] leading-relaxed text-[#8fa6aa]">
            A planning estimate, not a promise: it assumes recall wins back {Math.round(SCENARIOS.likely * 100)}% of missed visits ({Math.round(SCENARIOS.low * 100)}% to {Math.round(SCENARIOS.high * 100)}% for the range). We check it against your real numbers on the call.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-[15px] text-[#d5e2e2]">{label}</label>
        <span className="ms-num text-[1.6rem] text-white">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="ms-range ms-focus mt-3"
        style={{ background: `linear-gradient(90deg, var(--ms-quartz) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,.16) 0)` }} />
    </div>
  );
}
