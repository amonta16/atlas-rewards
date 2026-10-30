"use client";
import { useCallback, useRef, useState } from "react";
import { CalendarDays, Check, Gift, ScanLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { ANCHORS } from "@/lib/landing/config";
import { LIB } from "@/lib/landing/live-app-data";
import { track } from "@/lib/landing/analytics";
import { LiveApp, type LiveEvent } from "./live-app/live-app";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

/**
 * "Try the real app" — CP-176 (replaces the static AppPicker).
 * The phone is a working copy of Flippo's app. Four tasks on the left tick
 * off as the visitor actually does them inside the phone — the whole guest
 * loop (visit → earn → play → book → redeem) in about a minute.
 */
const TASKS: Array<{ id: Exclude<LiveEvent, "tab">; t: string; d: string; icon: typeof ScanLine }> = [
  { id: "checkin", t: "Check in at the desk", d: "Check in tab → the desk scans you. Points land on the spot.", icon: ScanLine },
  { id: "spin", t: "Take the Daily Spin", d: "One free spin a day — the reason guests open the app on off days.", icon: Sparkles },
  { id: "book", t: "Book a cage", d: "Real cages, real hours. Parties pick a package.", icon: CalendarDays },
  { id: "redeem", t: "Redeem a reward", d: "Rewards → Redeem. The desk gets a one-time code.", icon: Gift },
];

export function LiveDemoSection() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const first = useRef(false);
  const onEvent = useCallback((e: LiveEvent) => {
    if (!first.current) {
      first.current = true;
      track("interactive_demo_used", { demo: "live_app" });
    }
    if (e === "tab") return;
    setDone((d) => {
      if (d[e]) return d;
      track("interactive_demo_used", { demo: "live_app", step: e });
      return { ...d, [e]: true };
    });
  }, []);
  const count = TASKS.filter((t) => done[t.id]).length;

  return (
    <section id={ANCHORS.demo} className="lp-section relative scroll-mt-24 overflow-hidden" aria-labelledby="demo-title">
      <div className="lp-container grid items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div>
          <Reveal>
            <p className="lp-eyebrow">Try the real app</p>
            <h2 id="demo-title" className="lp-h2 mt-4 max-w-xl">Don&apos;t watch a demo. Use one.</h2>
            <p className="lp-lead mt-4 max-w-lg">
              This is Flippo&apos;s app in Morro Bay — their cages, their rewards, their hours. Tap around like a guest would.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <ol className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {TASKS.map(({ id, t, d, icon: I }) => {
                const ok = !!done[id];
                return (
                  <li key={id} className={cn("flex gap-3 rounded-2xl border p-4 transition-all duration-500", ok ? "border-emerald-200 bg-emerald-50/70" : "border-[#e3e9f0] bg-white")}>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-500", ok ? "bg-emerald-500 text-white" : "bg-[#f3f7fb] text-[#1f5f8b]")}>
                      {ok ? <Check className="lp-pop h-4 w-4" aria-hidden /> : <I className="h-4 w-4" aria-hidden />}
                    </span>
                    <span>
                      <span className={cn("block text-[15px] font-semibold", ok ? "text-emerald-900" : "text-[#14213d]")}>{t}</span>
                      <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-600">{d}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Reveal>

          <Reveal delay={160} className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <DemoCta source="live_app">{count === TASKS.length ? "Get this with my logo" : "See it in my brand"}</DemoCta>
            <p className="text-sm text-slate-500" aria-live="polite">
              {count === 0 ? "Nothing here touches Flippo's real data." : count === TASKS.length ? "That's the whole guest loop." : `${count} of ${TASKS.length} done`}
            </p>
          </Reveal>
        </div>

        {/* Phone on a photo stage */}
        <Reveal delay={120} className="relative mx-auto w-full max-w-[420px]">
          <div className="relative overflow-hidden rounded-[2.25rem] px-6 py-10 sm:px-12">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={optimizedUrl(LIB.arcadeNeon, 900)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2px]" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0b1a2e]/70 via-[#0b1a2e]/50 to-[#0b1a2e]/85" />
            <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0284c7]/40 blur-3xl" aria-hidden />
            <LiveApp push onEvent={onEvent} className="relative" />
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">Live copy of a real Atlas app · taps are simulated</p>
        </Reveal>
      </div>
    </section>
  );
}
