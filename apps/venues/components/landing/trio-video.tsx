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
 * or the video has loaded but sits paused, it swaps to the animated WebP, which browsers animate
 * everywhere, like a GIF. Most visitors never load it.
 *
 * CP-251 · load speed (most ad traffic is a phone on cellular):
 *   · phones get 720 px files (trio-720.webm 220 KB / .mp4 200 KB, poster 22 KB) instead of 1280 px
 *     (667 / 502 / 53 KB); computers keep the 1280 px video. Chosen by <source media>.
 *   · the video doesn't start downloading until the page has loaded (preload="none", play() after the
 *     load event), so the search box, fonts and code get the bandwidth first. The poster shows meanwhile.
 *   · the fallback no longer fires just because a slow connection hasn't finished the video: it needs
 *     a refusal, or a video that has data and still isn't playing. On a phone it's the 640 px
 *     version (1.3 MB, was 2.9 MB).
 */
import { useEffect, useRef, useState } from "react";

const DIR = "/landing/medspa-trio";
const PHONE = "(max-width: 767px)";

export function TrioVideo({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [fallback, setFallback] = useState<null | "phone" | "wide">(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return; // the poster stays
    let done = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const swap = () => { if (!done) { done = true; setFallback(window.matchMedia?.(PHONE).matches ? "phone" : "wide"); } };
    const playing = () => !v.paused && v.currentTime > 0;
    const ok = () => { done = true; if (t) clearTimeout(t); };
    // Has data but isn't playing 2 s later: refused without saying so (some webviews). Swap.
    const check = () => { if (t) clearTimeout(t); t = setTimeout(() => { if (!done && v.readyState >= 2 && !playing()) swap(); }, 2000); };
    const start = () => {
      v.play().catch((e: unknown) => { if ((e as { name?: string })?.name === "NotAllowedError") swap(); else check(); });
      check();
    };
    v.addEventListener("playing", ok);
    v.addEventListener("canplay", check);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("load", start);
      v.removeEventListener("playing", ok);
      v.removeEventListener("canplay", check);
    };
  }, []);

  const cls = `block h-auto w-full mix-blend-multiply ${className}`;
  const label = "Three med spa apps on phones: a rewards card, a membership page and a treatment menu";
  if (fallback) {
    const phone = fallback === "phone";
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`${DIR}/${phone ? "trio-anim-640.webp" : "trio-anim.webp"}`} alt={label} width={phone ? 640 : 960} height={phone ? 394 : 591} className={cls} />;
  }
  return (
    <video ref={ref} muted loop playsInline preload="none" poster={`${DIR}/trio-poster-720.webp`} width={1280} height={788} aria-label={label} className={cls}>
      <source src={`${DIR}/trio-720.webm`} type="video/webm" media={PHONE} />
      <source src={`${DIR}/trio-720.mp4`} type="video/mp4" media={PHONE} />
      <source src={`${DIR}/trio.webm`} type="video/webm" />
      <source src={`${DIR}/trio.mp4`} type="video/mp4" />
    </video>
  );
}
