import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";
import { VideoPlayer } from "./video-player";
import { DemoCta } from "./cta-button";

export function VSLSection() {
  return (
    <section id={ANCHORS.vsl} className="relative scroll-mt-24 py-16 md:py-24" aria-labelledby="vsl-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Watch it work</p>
          <h2 id="vsl-title" className="lp-h2 mt-4">
            See a customer earn, spin, and come back — in under three minutes.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            The app your customers download, the screen your front desk uses, and the dashboard that shows what it&apos;s worth.
          </p>
        </Reveal>
        <Reveal delay={120} className="mx-auto mt-10 max-w-4xl">
          <VideoPlayer />
        </Reveal>
        <Reveal delay={200} className="mt-8 flex flex-col items-center gap-3">
          <DemoCta source="vsl" />
          <p className="text-sm text-slate-500">Prefer to talk it through? That&apos;s what the demo is for.</p>
        </Reveal>
      </div>
    </section>
  );
}
