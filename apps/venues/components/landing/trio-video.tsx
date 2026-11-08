"use client";
/**
 * TrioVideo — CP-237 · three real med spa previews on 3D phones (Rewards / Memberships / Treatments),
 * a seamless 6 s loop rendered in Blender (Claude Resolve Editor/projects/medspa-trio-3d).
 * WebM + MP4 + poster in public/landing/medspa-trio. White background, so it's drawn with
 * mix-blend-mode: multiply and its edge disappears into any white or near-white section.
 * The three practices OK'd for public use by Andrew, 2026-11-08. Reduced motion → the still poster.
 */
import { useEffect, useRef } from "react";

export function TrioVideo({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { v.pause(); v.removeAttribute("autoplay"); return; }
    v.play().catch(() => { /* autoplay blocked: the poster stays */ });
  }, []);
  return (
    <video
      ref={ref} autoPlay muted loop playsInline preload="auto" poster="/landing/medspa-trio/trio-poster.webp" width={1280} height={788}
      aria-label="Three med spa apps on phones: a rewards card, a membership page and a treatment menu"
      className={`block h-auto w-full mix-blend-multiply ${className}`}
    >
      <source src="/landing/medspa-trio/trio.webm" type="video/webm" />
      <source src="/landing/medspa-trio/trio.mp4" type="video/mp4" />
    </video>
  );
}
