"use client";
/**
 * CP-239 · real client reviews, light theme.
 *   <ReviewStrip />          a smooth, endless horizontal carousel (bottom of /medspa/app).
 *                            Pauses on hover or keyboard focus; with reduced motion it
 *                            becomes a plain swipeable row.
 *   <ReviewQuote topic=… />  one review that backs up the section it sits next to.
 * Both render nothing until there's a real review (lib/landing/site-reviews.ts).
 */
import { Star } from "lucide-react";
import { partnerLine, realReviews, reviewFor, type ReviewTopic, type SiteReview } from "@/lib/landing/site-reviews";

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className="flex gap-0.5 text-[#F5A524]" aria-label={`${n} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={`h-4 w-4 ${i < n ? "fill-current" : "opacity-30"}`} strokeWidth={0} />)}
    </span>
  );
}

function Who({ r }: { r: SiteReview }) {
  return (
    <figcaption className="mt-5 flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0B5FD6]/10 text-[13px] font-bold text-[#0B5FD6]">{initials(r.name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[14.5px] font-bold text-[#0B1B2B]">{r.name}</span>
        <span className="block truncate text-[12.5px] text-[#6B7A8C]">{[r.role, r.business, r.city].filter(Boolean).join(" · ")}</span>
      </span>
    </figcaption>
  );
}

export function ReviewStrip({ title = "What practice owners say" }: { title?: string }) {
  const reviews = realReviews();
  if (reviews.length === 0) return null;
  const partner = reviews.some((r) => r.via === "partner") ? partnerLine() : null;
  // Short lists repeat inside each pass so the loop never shows a gap on wide screens.
  const pass = reviews.length >= 5 ? reviews : Array.from({ length: Math.ceil(5 / reviews.length) }, () => reviews).flat();
  return (
    <section aria-labelledby="pv-reviews" className="border-t border-[#0B1B2B]/8 bg-[#F6F9FD] py-14 sm:py-20">
      <div className="s-wrap text-center">
        <h2 id="pv-reviews" className="text-[clamp(1.7rem,1.2rem+1.8vw,2.6rem)] font-bold tracking-[-0.03em] text-[#0B1B2B]">{title}</h2>
        {partner && <p className="mx-auto mt-3 max-w-[38rem] text-[15px] leading-relaxed text-[#3A4A5C]">{partner}</p>}
      </div>
      <div className="s-marquee-wrap relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]" tabIndex={0} aria-label="Client reviews, scrolling. Hover or focus to pause.">
        <div className="s-marquee s-marquee-slow flex w-max gap-4 px-2">
          {[0, 1].map((p) => (
            <div key={p} className="flex gap-4" aria-hidden={p === 1}>
              {pass.map((r, i) => (
                <figure key={`${r.id}-${i}`} className="flex w-[320px] shrink-0 flex-col justify-between rounded-3xl bg-white p-6 text-left shadow-[0_18px_40px_-30px_rgba(11,27,43,.45)] ring-1 ring-[#0B1B2B]/6 sm:w-[360px]">
                  <div>
                    <Stars n={r.rating} />
                    {r.title && <p className="mt-3 text-[16px] font-bold leading-snug text-[#0B1B2B]">{r.title}</p>}
                    <blockquote className="mt-2 text-[15px] leading-relaxed text-[#3A4A5C]">&ldquo;{r.quote}&rdquo;</blockquote>
                  </div>
                  <Who r={r} />
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ReviewQuote({ topic, skip, className = "", dark = false }: { topic: ReviewTopic; skip?: string[]; className?: string; dark?: boolean }) {
  const r = reviewFor(topic, skip);
  if (!r) return null;
  return (
    <figure className={`mx-auto max-w-[44rem] rounded-3xl p-6 text-left sm:p-8 ${dark ? "bg-white/10 ring-1 ring-white/20 backdrop-blur" : "bg-white shadow-[0_18px_40px_-30px_rgba(11,27,43,.45)] ring-1 ring-[#0B1B2B]/6"} ${className}`}>
      <Stars n={r.rating} />
      <blockquote className={`mt-3 text-[clamp(1.1rem,1rem+.5vw,1.35rem)] font-semibold leading-snug ${dark ? "text-white" : "text-[#0B1B2B]"}`}>&ldquo;{r.quote}&rdquo;</blockquote>
      <figcaption className={`mt-4 text-[13.5px] ${dark ? "text-white/75" : "text-[#6B7A8C]"}`}>
        <b className={dark ? "text-white" : "text-[#0B1B2B]"}>{r.name}</b> · {[r.role, r.business, r.city].filter(Boolean).join(", ")}
        {r.via === "partner" && partnerLine() && <span className="mt-1 block text-[12px] opacity-80">{partnerLine()}</span>}
      </figcaption>
    </figure>
  );
}
