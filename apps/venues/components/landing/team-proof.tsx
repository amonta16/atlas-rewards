/**
 * components/landing/team-proof.tsx — CP-251 · "Top 10 at Cal Poly's AI Hackathon", the team photo
 * with the text beside it (stacked on a phone). Near the bottom of /medspa/app, before the reviews.
 * Server-safe (no hooks); the photo is lazy so it never competes with the search and the phones.
 */
import { TEAM_PROOF } from "@/lib/landing/medspa-funnel";

export function TeamProof() {
  return (
    <section aria-labelledby="team-proof-h" className="border-t border-[#0B1B2B]/8 bg-white py-14 sm:py-20">
      <div className="s-wrap grid items-center gap-8 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:gap-14">
        <figure className="mx-auto w-full max-w-[460px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/hackathon-team.webp" alt={TEAM_PROOF.alt} width={670} height={565} loading="lazy" decoding="async"
            className="block h-auto w-full rounded-[24px] bg-[#F6F9FD] object-cover shadow-[0_30px_60px_-36px_rgba(11,27,43,.55)] ring-1 ring-[#0B1B2B]/8" />
        </figure>
        <div className="max-w-[34rem]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#0B5FD6]">{TEAM_PROOF.eyebrow}</p>
          <h2 id="team-proof-h" className="mt-3 text-[clamp(1.7rem,1.2rem+1.8vw,2.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-[#0B1B2B]">{TEAM_PROOF.title}</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-[#3A4A5C]">{TEAM_PROOF.body}</p>
          <p className="mt-4 text-[13.5px] font-semibold text-[#6B7A8C]">{TEAM_PROOF.meta}</p>
        </div>
      </div>
    </section>
  );
}
