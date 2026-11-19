/**
 * components/landing/team-proof.tsx — CP-251 · team proof as crisp social-post cards (avatar, name, place
 * and date, the text, then the photo inside the card): an owner video, Flippo's and the hackathon, up to three
 * across on a computer, stacked on a phone. On /medspa/app and /med-spas, right before the reviews.
 * Styled like posts but deliberately NOT fake ones: no X/LinkedIn mark, no like or view counts. If Andrew
 * publishes a real post, link that card to it and the platform mark can go in.
 * Server-safe (no hooks); photos are lazy so they never compete with the top of the page.
 */
import { TEAM_PROOF } from "@/lib/landing/medspa-funnel";
import { YouTubeLite } from "@/components/landing/youtube-lite"; // CP-252

export function TeamProof() {
  return (
    <section aria-label={TEAM_PROOF.eyebrow} className="border-t border-[#0B1B2B]/8 bg-white py-14 sm:py-20">
      <div className="s-wrap">
        <p className="text-center text-[13px] font-semibold uppercase tracking-[0.12em] text-[#0B5FD6]">{TEAM_PROOF.eyebrow}</p>
        <div className="mx-auto mt-6 grid max-w-[1180px] items-start gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {TEAM_PROOF.posts.map((p) => (
            <article key={p.id} aria-labelledby={`proof-${p.id}`} className="rounded-2xl border border-[#E3E6EA] bg-white p-5 sm:p-6">
              <header className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/atlas-icon-512.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full ring-1 ring-[#E3E6EA]" />
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold leading-tight text-[#0F1419]">Atlas Engine</span>
                  <span className="block truncate text-[14px] leading-tight text-[#536471]">{p.meta}</span>
                </span>
              </header>
              <h2 id={`proof-${p.id}`} className="mt-4 text-[17px] font-semibold leading-snug text-[#0F1419]">{p.title}</h2>
              <p className="mt-2 text-[17px] leading-[1.5] text-[#0F1419]">{p.body}</p>
              {p.youtube ? <YouTubeLite id={p.youtube} title={p.alt} className="mt-4" /> : p.file && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/landing/${p.file}`} alt={p.alt} width={p.w} height={p.h} loading="lazy" decoding="async"
                  className="mt-4 block h-auto w-full rounded-xl border border-[#E3E6EA] object-cover" />
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
