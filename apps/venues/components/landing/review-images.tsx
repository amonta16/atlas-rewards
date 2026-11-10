"use client";
/**
 * components/landing/review-images.tsx — CP-240 · review screenshots, sliding across.
 *
 *   useReviewImages("medspa")         the active images for a page (Admin → Reviews)
 *   <ReviewImageMarquee images=… />   an endless row that slides left → right (REVIEW_IMAGE_DIRECTION),
 *                                     pauses on hover/focus, tap a card to read it full size.
 *
 * Drop <ReviewImageMarquee> into any template: it renders nothing while there
 * are no images, so pages keep their old look until reviews are uploaded.
 */
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { REVIEW_IMAGE_DIRECTION, type ReviewImage, type ReviewPlacement } from "@/lib/landing/review-images";

type State = { images: ReviewImage[]; ready: boolean };
const cache = new Map<ReviewPlacement, Promise<ReviewImage[]>>();

function load(on: ReviewPlacement): Promise<ReviewImage[]> {
  let p = cache.get(on);
  if (!p) {
    p = fetch(`/api/site-reviews?on=${on}`)
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((j: { images?: ReviewImage[] }) => (Array.isArray(j.images) ? j.images : []))
      .catch(() => []);
    cache.set(on, p);
  }
  return p;
}

export function useReviewImages(on: ReviewPlacement): State {
  const [s, set] = useState<State>({ images: [], ready: false });
  useEffect(() => {
    let live = true;
    load(on).then((images) => live && set({ images, ready: true }));
    return () => { live = false; };
  }, [on]);
  return s;
}

const CARD_H = "h-[260px] sm:h-[320px]";

export function ReviewImageMarquee({ images, tone = "light", className = "" }: { images: ReviewImage[]; tone?: "light" | "dark"; className?: string }) {
  const [open, setOpen] = useState<ReviewImage | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, close]);
  if (images.length === 0) return null;

  // Each pass must be wider than the screen, or the loop shows a gap: repeat short lists.
  const pass = images.length >= 8 ? images : Array.from({ length: Math.ceil(8 / images.length) }, () => images).flat();
  // Speed scales with the row so every card moves at the same pace (~5.5 s per card).
  const seconds = Math.max(40, pass.length * 5.5);

  return (
    <>
      <div
        className={`s-marquee-wrap relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] ${className}`}
        tabIndex={0}
        aria-label="Client reviews, sliding. Hover or focus to pause; select one to read it full size."
      >
        <div className="s-marquee flex w-max gap-4 px-2 py-3" style={{ animationDuration: `${seconds}s`, animationDirection: REVIEW_IMAGE_DIRECTION === "right" ? "reverse" : "normal", willChange: "transform" }}>
          {[0, 1].map((p) => (
            <div key={p} className="flex gap-4" aria-hidden={p === 1 || undefined}>
              {pass.map((img, i) => (
                <button
                  key={`${img.id}-${i}`} type="button" tabIndex={p === 1 ? -1 : 0} onClick={() => setOpen(img)}
                  className={`group shrink-0 overflow-hidden rounded-3xl p-2 text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 ${tone === "dark" ? "bg-white/95 shadow-[0_30px_60px_-40px_rgba(6,24,58,.9)] focus-visible:ring-white/60" : "bg-white shadow-[0_18px_40px_-28px_rgba(11,27,43,.5)] ring-1 ring-[#0B1B2B]/6 focus-visible:ring-[#0B5FD6]/30"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url} alt={img.alt || "A client review"} loading="lazy" decoding="async" draggable={false}
                    width={img.width ?? undefined} height={img.height ?? undefined}
                    className={`${CARD_H} w-auto max-w-[78vw] rounded-[18px] object-contain sm:max-w-[520px]`}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.alt || "Client review"} onClick={close} className="fixed inset-0 z-[80] grid place-items-center bg-[#06183A]/75 p-4 backdrop-blur-sm">
          <button type="button" onClick={close} aria-label="Close" className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white text-[#0B1B2B] shadow-lg"><X className="h-5 w-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt={open.alt || "A client review"} onClick={(e) => e.stopPropagation()} className="max-h-[88vh] max-w-[min(94vw,900px)] rounded-2xl bg-white object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}
