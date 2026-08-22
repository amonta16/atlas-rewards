import { Reveal } from "./reveal";
import { DemoCta, WatchCta } from "./cta-button";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 md:py-36" aria-labelledby="final-title">
      <div className="lp-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.18),transparent)] blur-2xl" aria-hidden />
      <Reveal className="lp-container relative mx-auto max-w-3xl text-center">
        <h2 id="final-title" className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
          You already pay to get customers in the door.
          <br />
          <span className="lp-gradient-text">Give them a reason to come back.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
          Twenty minutes. We&apos;ll show you the app in your brand and what a launch looks like for a business like yours.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <DemoCta source="final" event="final_cta_clicked" size="xl" />
          <WatchCta source="final" size="xl">
            Watch the demo first
          </WatchCta>
        </div>
        <p className="mt-5 text-sm text-zinc-500">No pressure, no contract to book a call.</p>
      </Reveal>
    </section>
  );
}
