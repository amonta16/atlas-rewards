import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";
import { DemoCta } from "./cta-button";

/** How it works — CP-145. Three steps, one line each. */
const STEPS = [
  { n: "1", t: "Book a 15-minute demo", d: "We look at your venue and mock up the app with your logo on the call." },
  { n: "2", t: "We build it for you", d: "Logo, colors, party reminders, memberships, waiver and rewards — configured with you, not by you." },
  { n: "3", t: "Launch at the front desk", d: "A QR at the desk and on the waiver. Guests scan, sign, and the app is on their phone before they hit the floor." },
];

export function HowItWorks() {
  return (
    <section id={ANCHORS.howItWorks} className="lp-section lp-tint scroll-mt-24" aria-labelledby="hiw-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">How it works</p>
          <h2 id="hiw-title" className="lp-h2 mt-4">Live in one visit.</h2>
        </Reveal>

        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="lp-card p-6 sm:p-7">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#14213d] text-sm font-semibold text-white">{s.n}</span>
              <h3 className="mt-4 text-lg font-semibold text-[#14213d]">{s.t}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{s.d}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-10 flex flex-col items-center gap-3 text-center">
          <DemoCta source="how_it_works" />
          <p className="text-sm text-slate-500">Works alongside any POS or card system. No second computer at the desk.</p>
        </Reveal>
      </div>
    </section>
  );
}
