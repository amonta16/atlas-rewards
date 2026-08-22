import { Palette, Rocket, Repeat, UserPlus } from "lucide-react";
import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

const STEPS = [
  {
    n: "01",
    icon: UserPlus,
    t: "Book a demo",
    d: "We walk through your business, your best customers, and what you'd want to reward.",
    ui: (
      <div className="space-y-2">
        <Row label="Business" value="Casa Verde" />
        <Row label="Locations" value="2" />
        <Row label="Avg. ticket" value="$34" />
      </div>
    ),
  },
  {
    n: "02",
    icon: Palette,
    t: "We build it in your brand",
    d: "Logo, colors, rewards, offers, streak rules, the prize wheel — configured with you, not by you.",
    ui: (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {["#14532d", "#facc15", "#f3faf4"].map((c) => (
            <span key={c} className="h-6 w-6 rounded-full ring-2 ring-white/10" style={{ background: c }} aria-hidden />
          ))}
          <span className="ml-auto text-xs text-slate-500">Brand colors</span>
        </div>
        <Row label="Top reward" value="Free entrée · 1,000 pts" />
        <Row label="Streak milestone" value="4 visits → dessert" />
      </div>
    ),
  },
  {
    n: "03",
    icon: Rocket,
    t: "Launch at the counter",
    d: "A QR card by the register and a link for your socials. Customers join in seconds — no account setup marathon.",
    ui: (
      <div className="space-y-2">
        <Row label="Join code" value="CASAVERDE" mono />
        <Row label="iOS app" value="Live" ok />
        <Row label="Web app" value="Live" ok />
      </div>
    ),
  },
  {
    n: "04",
    icon: Repeat,
    t: "Customers come back. You see it.",
    d: "Streaks, spins, win-backs and birthdays run on their own. The Impact dashboard shows what they're worth.",
    ui: (
      <div className="space-y-2">
        <Row label="Repeat visits" value="+18.4%" ok />
        <Row label="Reviews this month" value="42" ok />
        <Row label="Won back" value="47 customers" ok />
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id={ANCHORS.howItWorks} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="hiw-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e8dfd1] to-transparent" aria-hidden />
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">How it works</p>
          <h2 id="hiw-title" className="lp-h2 mt-4">From first call to live app, without touching code.</h2>
          <p className="mt-4 text-lg text-slate-600">You run the business. We run the software.</p>
        </Reveal>

        <ol className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="lp-card group relative flex flex-col p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-[#1f5f8b]">{s.n}</span>
                <span className="lp-light grid h-9 w-9 place-items-center rounded-lg border border-[#e8dfd1] bg-white text-slate-800 transition-colors group-hover:border-[#1f5f8b]/40 group-hover:text-[#1f5f8b]">
                  <s.icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[#14213d]">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.d}</p>
              <div className="mt-5 rounded-xl border border-[#e8dfd1] bg-[#fbf8f2] p-3.5 text-xs">{s.ui}</div>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-10 flex flex-col items-center gap-3 text-center">
          <DemoCta source="how_it_works" />
          <p className="text-sm text-slate-500">Typical launch: days, not months. <span className="lp-placeholder whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px]">[ CONFIRM TYPICAL LAUNCH TIME ]</span></p>
        </Reveal>
      </div>
    </section>
  );
}

function Row({ label, value, mono, ok }: { label: string; value: string; mono?: boolean; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${ok ? "text-emerald-700" : "text-slate-800"} font-medium`}>{value}</span>
    </div>
  );
}
