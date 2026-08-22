"use client";
import { useEffect, useState } from "react";
import { Check, Flame, Lock, PartyPopper, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { Reveal, useInView } from "./reveal";
import { RewardWheel } from "./reward-wheel";
import { AnimatedCounter } from "./animated-counter";

/**
 * "Built to be opened every week" — CP-100.
 * Three live mechanics visitors can feel: prize wheel (click), streak
 * (4 → 5 with celebration), and reward progress (740 → 1,000 unlock).
 */
export function RewardsDemo() {
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="rewards-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Engagement mechanics</p>
          <h2 id="rewards-title" className="lp-h2 mt-4">Built to be opened every week, not downloaded and forgotten.</h2>
          <p className="mt-4 text-lg text-slate-600">
            A punch card sits in a wallet. A rewards app gives customers a reason to check in, spin, keep a streak alive, and
            unlock the next thing. Try them — these are the real mechanics from the app.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <Reveal className="lp-card flex flex-col items-center p-6 sm:p-8 lg:row-span-1">
            <CardHead title="Daily prize wheel" sub="One spin per check-in. Prizes are whatever you decide." />
            <RewardWheel className="mt-6" />
          </Reveal>

          <div className="grid gap-5">
            <Reveal delay={80} className="lp-card p-6 sm:p-8">
              <CardHead title="Visit streaks" sub="Miss a week, lose the streak. Customers hate losing streaks." />
              <StreakDemo />
            </Reveal>
            <Reveal delay={160} className="lp-card p-6 sm:p-8">
              <CardHead title="Reward progress" sub="Visible progress toward a real reward keeps the next visit top of mind." />
              <ProgressDemo />
            </Reveal>
          </div>

          <Reveal delay={240} className="lp-card flex flex-col p-6 sm:p-8">
            <CardHead title="And the rest" sub="Every one of these ships in the app — configured per business." />
            <ul className="mt-6 grid gap-2.5 text-[15px]">
              {[
                "Points on every visit or dollar spent",
                "Limited-time & automated offers",
                "Raffle giveaways (enter with points)",
                "Birthday rewards, automatically",
                "Referral rewards for both people",
                "Review requests after a visit",
                "VIP membership tier",
                "Push notifications, in your voice",
                "Win-back offers for lapsed customers",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-slate-700">
                  <span className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#e0eef7] text-[#1f5f8b]">
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

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold text-[#14213d]">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{sub}</p>
    </div>
  );
}

/* ─── Streak: 4 → 5 with celebration ─────────────────────────────── */
function StreakDemo() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.5 });
  const [days, setDays] = useState(4);
  const [celebrate, setCelebrate] = useState(false);
  const [fired, setFired] = useState(false);

  const bump = () => {
    if (days >= 5) {
      setDays(4);
      setCelebrate(false);
      return;
    }
    setDays(5);
    setCelebrate(true);
    track("interactive_demo_used", { demo: "streak" });
  };

  useEffect(() => {
    if (!inView || fired) return;
    setFired(true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => {
      setDays(5);
      setCelebrate(true);
    }, reduce ? 0 : 900);
    return () => clearTimeout(t);
  }, [inView, fired]);

  return (
    <div ref={ref} className="mt-5">
      <div className="flex items-center gap-4">
        <div className={cn("relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 text-[#14213d] shadow-[0_10px_30px_-10px_rgba(251,146,60,0.8)]", celebrate && "lp-pulse-once")}>
          <Flame className="h-8 w-8" aria-hidden />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span key={days} className="lp-pop text-4xl font-bold tabular-nums text-[#14213d]">
              {days}
            </span>
            <span className="text-slate-600">day streak</span>
          </div>
          <div className={cn("mt-1 flex items-center gap-1.5 text-sm transition-colors", celebrate ? "text-emerald-700" : "text-slate-500")} role="status">
            {celebrate ? (
              <>
                <PartyPopper className="h-4 w-4" aria-hidden /> Milestone hit — free drink unlocked
              </>
            ) : (
              "1 more visit to your reward"
            )}
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1.5" aria-hidden>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
          const done = i < days;
          const milestone = i === 4;
          return (
            <div
              key={i}
              className={cn(
                "grid h-11 place-items-center rounded-lg border text-xs font-semibold transition-all duration-300",
                done ? "border-orange-300 bg-orange-100 text-orange-600" : "border-[#e8dfd1] bg-white text-slate-400",
                milestone && done && "lp-pop border-amber-300/60 bg-amber-100 text-amber-700",
              )}
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              {done ? <Check className="h-4 w-4" /> : milestone ? <Trophy className="h-4 w-4" /> : d}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={bump} className="lp-focus mt-4 text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
        {days >= 5 ? "Reset demo" : "Check in →"}
      </button>
    </div>
  );
}

/* ─── Progress: 740 → 1,000 unlock ──────────────────────────────── */
function ProgressDemo() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.5 });
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (inView) {
      const t = setTimeout(() => setGo(true), 600);
      return () => clearTimeout(t);
    }
  }, [inView]);
  const pct = go ? 100 : 74;
  return (
    <div ref={ref} className="mt-5">
      <div className="text-3xl font-bold tabular-nums text-[#14213d]">
        <AnimatedCounter from={740} to={go ? 1000 : 740} duration={1600} start={go} /> <span className="whitespace-nowrap text-base font-medium text-slate-500">/ 1,000 pts</span>
      </div>
      <div className={cn("mt-2 flex items-center gap-1.5 text-sm transition-colors", go ? "text-emerald-700" : "text-slate-500")} role="status" aria-live="polite">
        {go ? (
          <>
            <Trophy className="h-4 w-4" aria-hidden /> Free reward unlocked
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" aria-hidden /> 260 to go
          </>
        )}
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r from-[#2a8fb5] to-[#1f5f8b]", go && "lp-shimmer")}
          style={{ width: `${pct}%`, transition: "width 1.6s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>Member since March</span>
        <span>Next: free entrée</span>
      </div>
    </div>
  );
}
