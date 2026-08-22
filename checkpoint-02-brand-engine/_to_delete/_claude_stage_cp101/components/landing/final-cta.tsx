import { Reveal } from "./reveal";
import { DemoCta, WatchCta } from "./cta-button";

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 md:py-36" aria-labelledby="final-title">
      {/* Blurred team photo as atmosphere — readable overlay on top */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/landing/team-field-blur.jpg')] bg-cover bg-center opacity-90" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#fbf8f2] via-[#fbf8f2]/60 to-[#fbf8f2]" aria-hidden />
      <Reveal className="lp-container relative mx-auto max-w-3xl text-center">
        <h2 id="final-title" className="text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-[#14213d] sm:text-5xl lg:text-6xl">
          You already pay to get customers in the door.
          <br />
          <span className="lp-gradient-text">Give them a reason to come back.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600">
          Twenty minutes. We&apos;ll show you the app in your brand and what a launch looks like for a business like yours.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <DemoCta source="final" event="final_cta_clicked" size="xl" />
          <WatchCta source="final" size="xl">
            Watch the demo first
          </WatchCta>
        </div>
        <p className="mt-5 text-sm text-slate-500">No pressure, no contract to book a call.</p>
      </Reveal>
    </section>
  );
}
