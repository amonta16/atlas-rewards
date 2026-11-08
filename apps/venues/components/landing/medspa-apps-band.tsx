"use client";
/**
 * MedspaAppsBand — CP-237 · the 3D phones on the website (/medspa and /med-spas), with the
 * way into the instant preview funnel (/medspa/app). UTMs / fbclid ride along via withQuery.
 */
import { ArrowRight, Check } from "lucide-react";
import { track } from "@/lib/landing/analytics";
import { withQuery } from "@/lib/landing/ab";
import { TrioVideo } from "./trio-video";

export function MedspaAppsBand({ where }: { where: string }) {
  const go = () => {
    track("hero_cta_clicked", { source: `${where}_apps_band`, variant: "preview" });
    window.location.assign(withQuery("/medspa/app", { from: where }));
  };
  return (
    <section className="s-section overflow-x-clip bg-white" aria-labelledby={`${where}-apps-title`}>
      <div className="s-wrap grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--s-ocean)]">Real med spa apps</p>
          <h2 id={`${where}-apps-title`} className="s-h2 mt-3 max-w-[15ch]">Your app, built from your own website.</h2>
          <p className="s-body mt-5 max-w-[34rem] text-[1.05rem]">
            Rewards, memberships and your treatment menu, in your name and colors. These three were built for real practices
            from their websites. Type your practice&apos;s name and see yours in about 2 minutes.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-[var(--s-ink-2)]">
            {["Free", "No card needed", "Saved for 14 days"].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-[var(--s-ocean)]" aria-hidden />{t}</li>
            ))}
          </ul>
          <button type="button" onClick={go} className="s-btn s-btn-primary s-focus mt-8">See my app <ArrowRight className="h-4 w-4" aria-hidden /></button>
        </div>
        <figure className="mx-auto w-full max-w-[640px] lg:max-w-none">
          <TrioVideo />
        </figure>
      </div>
    </section>
  );
}
