/**
 * components/landing/owner-videos.tsx — CP-258 · "Hear it from med spa owners", under the sliding review
 * screenshots on /medspa/app. Real videos come from OWNER_VIDEOS.videos (lib/landing/medspa-funnel.ts) and
 * play in place; until there are enough, quiet placeholder cards hold the spots (OWNER_VIDEOS.showSlots).
 * Nothing renders when there are no videos and the placeholders are switched off.
 */
import { OWNER_VIDEOS } from "@/lib/landing/medspa-funnel";
import { YouTubeLite } from "@/components/landing/youtube-lite";

export function OwnerVideos() {
  const { videos, slots, showSlots } = OWNER_VIDEOS;
  const empty = showSlots ? Math.max(0, slots - videos.length) : 0;
  if (videos.length === 0 && empty === 0) return null;
  return (
    <section aria-labelledby="owner-videos-h" className="bg-white py-14 sm:py-20">
      <div className="s-wrap">
        <h2 id="owner-videos-h" className="text-center text-[clamp(1.7rem,1.2rem+1.8vw,2.6rem)] font-bold tracking-[-0.03em] text-[#0B1B2B]">Don&apos;t take our word for it. Hear it from owners.</h2>
        <div className="mx-auto mt-8 grid max-w-[1180px] gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <figure key={v.youtube} className="rounded-2xl border border-[#E3E6EA] bg-white p-4">
              <YouTubeLite id={v.youtube} title={`${v.name}, ${v.practice}`} />
              <blockquote className="mt-3 text-[16px] leading-snug text-[#0F1419]">&ldquo;{v.quote}&rdquo;</blockquote>
              <figcaption className="mt-2 text-[14px] text-[#536471]"><b className="text-[#0F1419]">{v.name}</b> · {v.practice}, {v.city}</figcaption>
            </figure>
          ))}
          {Array.from({ length: empty }).map((_, i) => (
            <div key={`slot-${i}`} aria-hidden className="rounded-2xl border border-dashed border-[#0B5FD6]/25 bg-[#F6F9FD] p-4">
              <div className="grid aspect-video place-items-center rounded-xl bg-gradient-to-br from-[#E6F1FF] to-[#F6F9FD]">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-[#0B5FD6]/60 shadow-[0_8px_20px_-12px_rgba(11,95,214,.5)]">
                  <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
                </span>
              </div>
              <p className="mt-3 text-[15px] font-semibold text-[#3A4A5C]">Owner video coming soon</p>
              <p className="mt-1 text-[13.5px] text-[#6B7A8C]">A med spa owner on what changed after launch day.</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
