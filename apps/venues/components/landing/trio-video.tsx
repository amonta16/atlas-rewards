"use client";
/**
 * TrioVideo — CP-237 · three real med spa previews on 3D phones (Rewards / Memberships / Treatments),
 * a seamless 6 s loop rendered in Blender (Claude Resolve Editor/projects/medspa-trio-3d).
 * WebM + MP4 + poster in public/landing/medspa-trio. White background, so it's drawn with
 * mix-blend-mode: multiply and its edge disappears into any white or near-white section.
 * The three practices OK'd for public use by Andrew, 2026-11-08. Reduced motion → the still poster.
 *
 * Always moves: a muted <video> is refused autoplay in iPhone Low Power Mode, data-saver modes and
 * some in-app browsers (Instagram / Facebook), which leaves only the poster. When play() is refused,
 * or the video still hasn't started a few seconds in, it swaps to trio-anim.webp (animated WebP,
 * 960 px, 20 fps, 2.9 MB), which browsers animate everywhere, like a GIF. Most visitors never load it.
 */
import { useEffect, useRef, useState } from "react";

const DIR = "/landing/medspa-trio";

export function TrioVideo({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { v.pause(); v.removeAttribute("autoplay"); return; }
    let done = false;
    const swap = () => { if (!done) { done = true; setFallback(true); } };
    const playing = () => !v.paused && v.currentTime > 0;
    v.play().catch(swap); // refused (Low Power Mode, data saver, some webviews)
    // Some browsers neither play nor refuse. Give a loaded video 2.5 s and a slow one 7 s.
    const t1 = setTimeout(() => { if (v.readyState >= 2 && !playing()) swap(); }, 2500);
    const t2 = setTimeout(() => { if (!playing()) swap(); }, 7000);
    const ok = () => { done = true; clearTimeout(t1); clearTimeout(t2); };
    v.addEventListener("playing", ok);
    return () => { clearTimeout(t1); clearTimeout(t2); v.removeEventListener("playing", ok); };
  }, []);

  const cls = `block h-auto w-full mix-blend-multiply ${className}`;
  const label = "Three med spa apps on phones: a rewards card, a membership page and a treatment menu";
  if (fallback) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`${DIR}/trio-anim.webp`} alt={label} width={960} height={591} className={cls} />;
  }
  return (
    <video ref={ref} autoPlay muted loop playsInline preload="auto" poster={`${DIR}/trio-poster.webp`} width={1280} height={788} aria-label={label} className={cls}>
      <source src={`${DIR}/trio.webm`} type="video/webm" />
      <source src={`${DIR}/trio.mp4`} type="video/mp4" />
    </video>
  );
}
