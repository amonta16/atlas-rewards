"use client";
/**
 * OceanBackground — the animated brand background (fanning lines + the three
 * nested arches of the Atlas "A"). Drop-in replacement for the static
 * `.s-ocean-img` layer (blue-lines.jpg): same cover/center cropping and the
 * same tint, so the text on top reads exactly as before.
 *
 *   • The container paints the poster as a CSS background, so there is never
 *     a blank frame while the video loads (and reduced-motion visitors only
 *     ever see the poster; the video is hidden by CSS).
 *   • `eager` (above-the-fold heroes): sources are in the server HTML and the
 *     video autoplays. Everything else waits until it is about to scroll into
 *     view (IntersectionObserver) before loading, and pauses off-screen.
 *
 * Styles live in app/site.css (.s-ocean-vid).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const POSTER = "/landing/atlas-bg-loop-poster.jpg";

export function OceanBackground({ className, style, eager = false, tint = true }: {
  className?: string;
  style?: CSSProperties;
  /** Above the fold: load and autoplay immediately. */
  eager?: boolean;
  /** The light navy tint the static layer had on top of the artwork. */
  tint?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(eager);

  useEffect(() => {
    const el = box.current, v = vid.current;
    if (!el || !v) return;
    v.muted = true; // React doesn't put `muted` in the server HTML; iOS needs it to autoplay
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) { v.pause(); return; }
    if (typeof IntersectionObserver === "undefined") { setLoad(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setLoad(true); v.play().catch(() => { /* poster stays */ }); }
      else v.pause();
    }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => { if (load) vid.current?.play().catch(() => { /* poster stays */ }); }, [load]);

  return (
    <div ref={box} aria-hidden className={cn("s-ocean-vid", tint && "s-ocean-vid-tint", className)} style={style}>
      <video ref={vid} autoPlay muted loop playsInline preload="metadata" poster={POSTER} aria-hidden="true" tabIndex={-1}>
        {load && <>
          <source src="/landing/atlas-bg-loop-720.mp4" type="video/mp4" media="(max-width: 800px)" />
          <source src="/landing/atlas-bg-loop-1080.webm" type="video/webm" />
          <source src="/landing/atlas-bg-loop-1080.mp4" type="video/mp4" />
        </>}
      </video>
    </div>
  );
}
