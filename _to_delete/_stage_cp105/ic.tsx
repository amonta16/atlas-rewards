"use client";
/**
 * ImageCarousel — CP-99 (roadmap item #2).
 *
 * Horizontal swipe gallery for reward photos: native scroll-snap (real
 * touch physics, zero dependencies), pagination dots, and an image
 * counter. CRITICAL COMPAT RULE: with a single image it renders a plain
 * <img> with the exact className the caller passes — pixel-identical to
 * the pre-carousel markup — so every existing single-image reward is
 * untouched visually.
 */

import { useState } from "react";

export function ImageCarousel({
  images,
  alt,
  imgClassName,
  className = "",
}: {
  /** Ordered urls — cover first. Empty array renders nothing. */
  images: string[];
  alt: string;
  /** Classes applied to EVERY slide img (and the single-image fallback). */
  imgClassName: string;
  /** Optional wrapper classes (rounding/overflow live here). */
  className?: string;
}) {
  const [idx, setIdx] = useState(0);

  if (images.length === 0) return null;
  if (images.length === 1) {
    // Single image: identical markup to the legacy render.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={images[0]} alt={alt} className={imgClassName} />;
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${src}-${i}`}
            src={src}
            alt={i === 0 ? alt : ""}
            className={`${imgClassName} w-full shrink-0 snap-center`}
            draggable={false}
          />
        ))}
      </div>

      {/* image counter */}
      <div className="absolute top-2 right-2 text-[10px] font-bold text-white bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5 pointer-events-none">
        {Math.min(idx + 1, images.length)}/{images.length}
      </div>

      {/* pagination dots */}
      <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
        {images.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              i === Math.min(idx, images.length - 1) ? "w-4 bg-white" : "w-1.5 bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** Cover + extra photos → ordered gallery. Shared by every reward surface. */
export function rewardGallery(
  image_url: string | null | undefined,
  images: string[] | null | undefined,
): string[] {
  return [image_url, ...(images ?? [])].filter((u): u is string => !!u);
}
