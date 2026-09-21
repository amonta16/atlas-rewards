import { Reveal } from "./reveal";
import { DemoCta, WatchCta } from "./cta-button";

/** Final CTA — CP-145. Navy block, one line, two buttons. */
export function FinalCTA() {
  return (
    <section className="lp-section" aria-labelledby="final-title">
      <div className="lp-container">
        <Reveal className="lp-phone-stage relative overflow-hidden rounded-[2rem] px-6 py-14 text-center sm:rounded-[2.5rem] sm:px-10 sm:py-20">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#38bdf8]/25 blur-3xl" aria-hidden />
          <h2 id="final-title" className="relative mx-auto max-w-2xl text-3xl font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl">
            Give last year's parties a reason to book again.
          </h2>
          <p className="relative mx-auto mt-5 max-w-md text-base text-white/75 sm:text-lg">
            Fifteen minutes. We&apos;ll show you the app with your logo on it.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DemoCta source="final" event="final_cta_clicked" size="xl" className="w-full bg-white text-[#14213d] hover:bg-[#e6f1f8] sm:w-auto" />
            <WatchCta source="final" size="xl" tone="dark" className="w-full sm:w-auto">
              Watch the demo
            </WatchCta>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
