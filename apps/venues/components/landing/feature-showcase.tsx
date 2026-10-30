"use client";
import { ArrowDown, Cake, Gift, KeyRound, MessageSquareHeart, QrCode, Send, Star, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal, useInView } from "./reveal";

/**
 * Feature storytelling — CP-100. Varied modules, each a small product
 * vignette that answers "why does a business owner care?"
 */
export function FeatureShowcase() {
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="features-title">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">What it does for you</p>
          <h2 id="features-title" className="lp-h2 mt-4">The growth jobs you never get to — running on their own.</h2>
          <p className="mt-4 text-lg text-slate-600">
            Reviews, referrals, win-backs and birthdays are the highest-return things a local business can do. They also
            never get done. The app does them.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-6">
          {/* Win-back: wide */}
          <Reveal className="lp-card p-6 sm:p-8 md:col-span-4">
            <Head icon={MessageSquareHeart} title="Win back customers who drifted" why="Lapsed customers are the cheapest revenue you'll ever get — they already know you." />
            <Reactivation />
          </Reveal>

          {/* Reviews */}
          <Reveal delay={80} className="lp-card p-6 sm:p-8 md:col-span-2">
            <Head icon={Star} title="Reviews, asked at the right moment" why="A request right after a good visit converts. A sign by the register doesn't." />
            <div className="mt-6 space-y-2.5">
              <Bubble side="biz">Thanks for coming in today, Maria! Mind leaving us a quick Google review? It helps a ton — and it&apos;s worth 50 points.</Bubble>
              <div className="flex justify-end">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f5f8b] px-3 py-2 text-xs font-semibold text-white">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden /> Leave a review
                </span>
              </div>
              <Bubble side="biz" muted>
                Review posted · <b className="text-emerald-700">+50 pts</b> added
              </Bubble>
            </div>
          </Reveal>

          {/* Referrals */}
          <Reveal className="lp-card p-6 sm:p-8 md:col-span-2">
            <Head icon={Users} title="Referrals that reward both people" why="Word of mouth, with a reason to actually say the words." />
            <div className="mt-6 flex items-center justify-between gap-2">
              <Node label="Maria" sub="shares link" icon={UserPlus} />
              <Connector />
              <Node label="Friend" sub="joins + visits" icon={Users} />
              <Connector />
              <Node label="Both" sub="get a reward" icon={Gift} accent />
            </div>
            <p className="mt-5 text-xs text-slate-500">Rewards release only after the friend&apos;s qualifying visit — no freebies for fake signups.</p>
          </Reveal>

          {/* Birthdays */}
          <Reveal delay={80} className="lp-card p-6 sm:p-8 md:col-span-2">
            <Head icon={Cake} title="Birthday rewards, automatically" why="The one message every customer opens — sent without you remembering." />
            <div className="mt-6 rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50 to-violet-50 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-pink-100 text-pink-600">
                  <Cake className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-semibold text-[#14213d]">Happy birthday, Jordan 🎂</div>
                  <div className="text-xs text-slate-600">A free dessert is waiting in your app this week.</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                <Send className="h-3 w-3" aria-hidden /> Push sent 9:00 AM · expires in 7 days
              </div>
            </div>
          </Reveal>

          {/* Front desk */}
          <Reveal delay={120} className="lp-card p-6 sm:p-8 md:col-span-2">
            <Head icon={QrCode} title="Works at the counter in seconds" why="No POS integration. Staff scan a QR or type a 4-digit PIN. Done." />
            <div className="mt-6 grid grid-cols-[auto_1fr] items-center gap-4">
              <div className="lp-light grid h-20 w-20 place-items-center rounded-xl border border-[#e8dfd1] bg-white p-2">
                <QrCode className="h-full w-full text-[#14213d]" aria-hidden />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <KeyRound className="h-4 w-4 text-[#1f5f8b]" aria-hidden /> Staff PIN login
                </div>
                <div className="grid grid-cols-3 gap-1" aria-hidden>
                  {["1", "2", "3", "4", "5", "6"].map((k) => (
                    <span key={k} className="grid h-7 place-items-center rounded-md border border-[#e8dfd1] bg-[#fbf8f2] text-xs text-slate-700">
                      {k}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-slate-500">Award points · redeem · undo in 30s</div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Head({ icon: I, title, why }: { icon: React.ComponentType<{ className?: string }>; title: string; why: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="lp-light grid h-9 w-9 place-items-center rounded-lg border border-[#e8dfd1] bg-white text-[#1f5f8b]">
          <I className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-lg font-semibold text-[#14213d]">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-slate-600">{why}</p>
    </div>
  );
}

function Bubble({ children, side, muted }: { children: React.ReactNode; side: "biz"; muted?: boolean }) {
  return (
    <div className={cn("max-w-[92%] rounded-xl rounded-tl-sm px-3.5 py-2.5 text-[13px] leading-snug", muted ? "bg-[#f7f2ea] text-slate-500" : "bg-[#eef4f8] text-slate-800")} data-side={side}>
      {children}
    </div>
  );
}

function Node({ label, sub, icon: I, accent }: { label: string; sub: string; icon: React.ComponentType<{ className?: string }>; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className={cn("grid h-11 w-11 place-items-center rounded-xl border", accent ? "border-[#1f5f8b]/40 bg-[#e0eef7] text-[#1f5f8b]" : "border-[#e8dfd1] bg-white text-slate-800")}>
        <I className="h-5 w-5" aria-hidden />
      </span>
      <div className="mt-2 text-xs font-semibold text-[#14213d]">{label}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}
function Connector() {
  return <span className="mb-7 h-px flex-1 bg-gradient-to-r from-[#e8dfd1] via-[#1f5f8b]/60 to-[#e8dfd1]" aria-hidden />;
}

/* ─── Reactivation flow animation ───────────────────────────────── */
function Reactivation() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 });
  const steps = [
    { n: "342", l: "customers haven't visited in 60+ days", icon: Users },
    { n: "1 tap", l: "\"We miss you\" offer sent — in your voice, with a reward attached", icon: Send },
    { n: "47", l: "came back within two weeks", icon: MessageSquareHeart },
    { n: "$X,XXX", l: "recovered revenue [ DEMO — replace with real data ]", icon: Gift },
  ];
  return (
    <div ref={ref} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-stretch">
      {steps.map((s, i) => (
        <div key={s.l} className="contents">
          <div
            className={cn("rounded-xl border border-[#e8dfd1] bg-white p-4 transition-all duration-500", inView ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}
            style={{ transitionDelay: `${i * 220}ms` }}
          >
            <s.icon className="h-4 w-4 text-[#1f5f8b]" aria-hidden />
            <div className="mt-2 text-2xl font-semibold tabular-nums text-[#14213d]">{s.n}</div>
            <div className="mt-1 text-xs leading-snug text-slate-600">{s.l}</div>
          </div>
          {i < steps.length - 1 && (
            <div className="grid place-items-center text-slate-400 transition-opacity duration-500" style={{ transitionDelay: `${i * 220 + 110}ms`, opacity: inView ? 1 : 0 }} aria-hidden>
              <ArrowDown className="h-4 w-4 sm:-rotate-90" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
