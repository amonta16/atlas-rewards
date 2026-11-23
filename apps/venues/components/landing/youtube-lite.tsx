"use client";
/**
 * components/landing/youtube-lite.tsx — CP-252 · a YouTube video that costs nothing until it's played.
 * Shows YouTube's own thumbnail and a play button; a tap swaps in the youtube-nocookie player (autoplay,
 * no related videos from other channels). The full YouTube player (~1 MB of script) never loads for
 * people who don't press play. KEEP IN SYNC with apps/medspa/components/youtube-lite.tsx.
 */
import { useState } from "react";

export function YouTubeLite({ id, title, className = "" }: { id: string; title: string; className?: string }) {
  const [on, setOn] = useState(false);
  const box = `relative block aspect-video w-full overflow-hidden rounded-xl border border-[#E3E6EA] bg-[#0F1419] ${className}`;
  if (on) {
    return (
      <div className={box}>
        <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`}
          title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
          className="absolute inset-0 h-full w-full border-0" />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOn(true)} className={`${box} group s-focus`} aria-label={`Play video: ${title}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`} alt="" loading="lazy" decoding="async"
        className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
      <span aria-hidden className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition-transform group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
      </span>
    </button>
  );
}
