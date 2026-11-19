/**
 * components/landing/team-proof.tsx — CP-251 · the hackathon, as a crisp social-post card (avatar, name,
 * date, the text, then the team photo inside the card). Near the bottom of /medspa/app, before the reviews.
 * Styled like a post but deliberately NOT a fake one: no X/LinkedIn mark, no like or view counts. If Andrew
 * publishes a real post about it, link the card to that post and the platform mark can go back in.
 * Server-safe (no hooks); the photo is lazy so it never competes with the search and the phones.
 */
import { TEAM_PROOF } from "@/lib/landing/medspa-funnel";

export function TeamProof() {
  return (
    <section aria-labelledby="team-proof-h" className="border-t border-[#0B1B2B]/8 bg-white py-14 sm:py-20">
      <div className="s-wrap">
        <p className="text-center text-[13px] font-semibold uppercase tracking-[0.12em] text-[#0B5FD6]">{TEAM_PROOF.eyebrow}</p>
        <article className="mx-auto mt-5 max-w-[560px] rounded-2xl border border-[#E3E6EA] bg-white p-5 sm:p-6">
          <header className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/atlas-icon-512.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full ring-1 ring-[#E3E6EA]" />
            <span className="min-w-0">
              <span className="block text-[16px] font-bold leading-tight text-[#0F1419]">Atlas Engine</span>
              <span className="block text-[14px] leading-tight text-[#536471]">{TEAM_PROOF.meta}</span>
            </span>
          </header>
          <h2 id="team-proof-h" className="mt-4 text-[17px] font-semibold leading-snug text-[#0F1419]">{TEAM_PROOF.title}</h2>
          <p className="mt-2 text-[17px] leading-[1.5] text-[#0F1419]">{TEAM_PROOF.body}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/hackathon-team.webp" alt={TEAM_PROOF.alt} width={670} height={565} loading="lazy" decoding="async"
            className="mt-4 block h-auto w-full rounded-xl border border-[#E3E6EA] object-cover" />
        </article>
      </div>
    </section>
  );
}
