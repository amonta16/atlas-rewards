import { ANCHORS } from "@/lib/landing/config";
import { Reveal } from "./reveal";
import { VideoPlayer } from "./video-player";

/** Video — CP-145. Headline + player. That's it. */
export function VSLSection() {
  return (
    <section id={ANCHORS.vsl} className="lp-section scroll-mt-24" aria-labelledby="vsl-title">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="lp-eyebrow justify-center">Watch it work</p>
          <h2 id="vsl-title" className="lp-h2 mt-4">See a guest scan, earn and come back.</h2>
          <p className="lp-lead mt-4">The guest app, the front desk, and the dashboard — in under three minutes.</p>
        </Reveal>
        <Reveal delay={120} className="mx-auto mt-10 max-w-4xl">
          <VideoPlayer />
        </Reveal>
      </div>
    </section>
  );
}
