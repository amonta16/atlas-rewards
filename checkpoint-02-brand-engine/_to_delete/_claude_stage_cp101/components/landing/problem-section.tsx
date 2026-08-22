import { Megaphone, Repeat, Smartphone, TrendingDown } from "lucide-react";
import { Reveal } from "./reveal";

/**
 * The "enemy" — CP-100. Mirrors the intro film's hook: chains have apps that
 * pull customers back every week; independents are stuck buying attention.
 */
export function ProblemSection() {
  return (
    <section className="relative py-20 md:py-28" aria-labelledby="problem-title">
      <div className="lp-container grid gap-12 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <p className="lp-eyebrow">Why it matters</p>
          <h2 id="problem-title" className="lp-h2 mt-4">
            You pay to get a customer in the door. Then you hope they come back.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Starbucks, Chipotle and every big gym chain have an app on their customers&apos; phones nudging them back with
            points, streaks and offers. Independents get a punch card and a prayer. Atlas closes that gap — with your
            name on it, not ours.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Megaphone, t: "Acquisition is getting more expensive", d: "Ads, SEO and agencies all cost more every year — and none of them bring a customer back a second time." },
              { icon: TrendingDown, t: "Most first-time customers never return", d: "Without a reason to come back, the visit you paid for is a one-time event." },
              { icon: Smartphone, t: "The chains already solved this", d: "Their app is the retention engine. You can have one too — without building it." },
            ].map(({ icon: I, t, d }) => (
              <li key={t} className="flex gap-4">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e8dfd1] bg-white text-[#1f5f8b]">
                  <I className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <div className="font-semibold text-[#14213d]">{t}</div>
                  <div className="mt-1 text-[15px] text-slate-600">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* Visual: the loop */}
        <Reveal delay={120} className="relative">
          <div className="lp-card relative overflow-hidden p-6 sm:p-8">
            <div className="lp-grid absolute inset-0 opacity-30" aria-hidden />
            <div className="relative">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-500">
                <span>One customer&apos;s year</span>
                <span className="rounded-md bg-[#f3ede2] px-2 py-1 font-mono text-[10px] text-slate-600">illustrative</span>
              </div>

              <div className="mt-6 grid gap-5">
                <LoopRow label="Without a rewards app" visits={[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} tone="dim" note="1 visit · then silence" />
                <LoopRow label="With their own app" visits={[1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1]} tone="on" note="points → streak → spin → offer → back again" />
              </div>

              <div className="mt-7 flex items-center gap-3 rounded-xl border border-[#1f5f8b]/40 bg-[#e6f1f8] p-4">
                <Repeat className="h-5 w-5 shrink-0 text-[#1f5f8b]" aria-hidden />
                <p className="text-sm text-slate-700">
                  Atlas turns the visit you already paid for into the <span className="font-semibold text-[#14213d]">first of many</span> — every mechanic in the app exists to earn the next one.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function LoopRow({ label, visits, tone, note }: { label: string; visits: number[]; tone: "dim" | "on"; note: string }) {
  return (
    <div>
      <div className="mb-2 flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className={tone === "on" ? "font-semibold text-[#14213d]" : "text-slate-600"}>{label}</span>
        <span className="text-xs text-slate-500">{note}</span>
      </div>
      <div className="grid grid-cols-12 gap-1.5" aria-hidden>
        {visits.map((v, i) => (
          <span
            key={i}
            className={`h-9 rounded-md border transition-colors ${
              v ? (tone === "on" ? "lp-visit border-[#1f5f8b]/40 bg-[#1f5f8b]/70" : "border-[#d9cfbf] bg-[#e8dfd1]") : "border-[#efe8dc] bg-white"
            }`}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-12 gap-1.5 text-center font-mono text-[9px] text-slate-400" aria-hidden>
        {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
          <span key={i}>{m}</span>
        ))}
      </div>
    </div>
  );
}
