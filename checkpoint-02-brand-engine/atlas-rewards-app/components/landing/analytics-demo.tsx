"use client";
import { ArrowUpRight, Users, Repeat, Share2, DollarSign, Star } from "lucide-react";
import { Reveal, useInView } from "./reveal";
import { AnimatedCounter } from "./animated-counter";
import { DemoCta } from "./cta-button";

/**
 * Atlas Impact dashboard demonstration — CP-100.
 * Metrics count up as the section scrolls into view. ALL NUMBERS ARE DEMO
 * DATA — labeled on-screen — replace once real aggregate results exist.
 */
export function AnalyticsDemo() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="analytics-title">
      <div className="lp-container grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <Reveal>
          <p className="lp-eyebrow">Atlas Impact dashboard</p>
          <h2 id="analytics-title" className="lp-h2 mt-4">Know what the app is worth — not just that people like it.</h2>
          <p className="mt-4 text-lg text-zinc-400">
            Every check-in, redemption, referral and review is tracked against your own baseline, so you can see revenue
            the program drove, customers it brought back, and reviews it generated — in one screen you and your team check
            from the front desk.
          </p>
          <ul className="mt-6 space-y-2 text-[15px] text-zinc-300">
            <li className="flex gap-2"><ArrowUpRight className="mt-1 h-4 w-4 text-cyan-300" aria-hidden /> Revenue driven vs. your pre-Atlas baseline</li>
            <li className="flex gap-2"><ArrowUpRight className="mt-1 h-4 w-4 text-cyan-300" aria-hidden /> Inactive customers detected and won back</li>
            <li className="flex gap-2"><ArrowUpRight className="mt-1 h-4 w-4 text-cyan-300" aria-hidden /> Google review funnel — requested, clicked, posted</li>
          </ul>
          <div className="mt-8">
            <DemoCta source="analytics">See the dashboard live</DemoCta>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div ref={ref} className="lp-card relative overflow-hidden p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Casa Verde · Impact</div>
                <div className="text-xs text-zinc-500">Last 30 days</div>
              </div>
              <span className="lp-placeholder rounded-md px-2 py-1 font-mono text-[10px] text-zinc-400">[ DEMO METRICS — REPLACE WITH REAL DATA ]</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={Users} label="Members" value={<AnimatedCounter from={1284} to={1337} start={inView} />} delta="+53" />
              <Stat icon={Repeat} label="Repeat visits" value={<AnimatedCounter from={0} to={18.4} decimals={1} prefix="+" suffix="%" start={inView} />} delta="vs baseline" />
              <Stat icon={Share2} label="Referrals" value={<AnimatedCounter from={64} to={71} start={inView} />} delta="+7" />
              <Stat icon={Star} label="Reviews" value={<AnimatedCounter from={0} to={42} start={inView} />} delta="4.9 avg" />
            </div>

            {/* Revenue chart */}
            <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <DollarSign className="h-4 w-4 text-emerald-300" aria-hidden /> Revenue driven by Atlas
                </div>
                <div className="text-lg font-semibold text-white">
                  $<AnimatedCounter from={0} to={12480} start={inView} duration={1800} />
                </div>
              </div>
              <Bars active={inView} />
            </div>

            {/* Win-back strip */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {[
                ["342", "dormant detected"],
                ["47", "came back"],
                ["$1,880", "recovered"],
              ].map(([n, l]) => (
                <div key={l} className="rounded-lg border border-white/[0.07] bg-white/[0.02] py-2.5">
                  <div className="text-base font-semibold text-white">{n}</div>
                  <div className="text-zinc-500">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ icon: I, label, value, delta }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; delta: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
        <I className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-xs text-emerald-300">{delta}</div>
    </div>
  );
}

function Bars({ active }: { active: boolean }) {
  const data = [22, 30, 26, 38, 44, 41, 52, 58, 55, 66, 72, 80];
  return (
    <div className="mt-4 flex h-24 items-end gap-1.5" aria-hidden>
      {data.map((h, i) => (
        <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500/40 to-cyan-300/90" style={{ height: active ? `${h}%` : "4%", transition: `height 900ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms` }} />
      ))}
    </div>
  );
}
