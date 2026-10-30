"use client";
/**
 * components/medspa/intro-video.tsx — CP-205 · the placeholder video, done properly.
 *
 * Until Andrew records the real videos (LANDING_VSL.embed / PRECALL_VIDEO.embed), the
 * 3.5-second Atlas logo animation plays in their place: muted, inline, once, when the
 * frame scrolls into view. When it ends, the frame holds on the logo and an end card
 * rises in with the next step, so the placeholder still moves people forward.
 *
 * Mobile shows a taller 4:5 crop (the logo sits in the middle third), desktop 16:9.
 * Reduced motion: no autoplay; the end card shows over the still frame.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";

export const INTRO_VIDEO = { src: "/landing/atlas-intro.mp4", webm: "/landing/atlas-intro.webm", posterEnd: "/landing/atlas-intro-end.jpg", posterStart: "/landing/atlas-intro-start.jpg" };

/** When the end card rises, the logo lifts to make room for it (the gap below is covered by the card's navy fade). */
const LIFT = "-translate-y-[24%] sm:-translate-y-[18%] [mask-image:linear-gradient(to_bottom,#000_55%,transparent_88%)]";

export function IntroVideo({ eyebrow = "Coming soon", title, body, children, where, className, rounded = "rounded-[26px]", tall = true }: {
  eyebrow?: string; title: string; body?: string; children?: ReactNode; where: string; className?: string; rounded?: string;
  /** true: 4:5 on phones, 16:9 from sm up. false: 4:3 on phones, 16:9 from sm up (small frames). */
  tall?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"waiting" | "playing" | "ended">("waiting");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const v = vid.current, el = box.current;
    if (!v || !el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setState("ended"); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.5) {
        io.disconnect();
        v.play().then(() => setState("playing")).catch(() => setState("ended")); // autoplay blocked → end card
      }
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function replay() {
    const v = vid.current; if (!v) return;
    v.currentTime = 0; setPct(0);
    v.play().then(() => setState("playing")).catch(() => {});
    track("intro_video", { where, action: "replay" });
  }

  const ended = state === "ended";
  return (
    <div ref={box} className={cn("relative w-full overflow-hidden bg-[#031645] ring-1 ring-white/20", tall ? "aspect-[4/5] shadow-[0_40px_90px_-30px_rgba(2,20,70,.8)] sm:aspect-video" : "aspect-[4/3] sm:aspect-video", rounded, className)}>
      <video ref={vid} poster={INTRO_VIDEO.posterStart} muted playsInline preload="metadata" aria-hidden tabIndex={-1}
        onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setPct(v.currentTime / v.duration); }}
        onEnded={() => { setState("ended"); track("intro_video", { where, action: "ended" }); }}
        className={cn("absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]", ended && LIFT)}>
        <source src={INTRO_VIDEO.src} type="video/mp4" />
        <source src={INTRO_VIDEO.webm} type="video/webm" />
      </video>
      {/* Still end frame for reduced motion / blocked autoplay, so the logo always shows */}
      {ended && pct === 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={INTRO_VIDEO.posterEnd} alt="" aria-hidden className={cn("absolute inset-0 h-full w-full object-cover", LIFT)} />
      )}

      {/* playing: a hairline progress bar */}
      <div aria-hidden className={cn("absolute inset-x-0 bottom-0 h-[3px] bg-white/10 transition-opacity", state === "playing" ? "opacity-100" : "opacity-0")}>
        <div className="h-full bg-white/80" style={{ width: `${pct * 100}%` }} />
      </div>

      {/* ended: the end card rises in over the glow */}
      <div aria-hidden={!ended} className={cn("absolute inset-0 flex flex-col justify-end transition-opacity duration-700", ended ? "opacity-100" : "pointer-events-none opacity-0")}>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#031645] via-[#031645]/55 to-transparent sm:via-[#031645]/25" />
        <div className={cn("relative text-left transition-transform duration-700 ease-out", tall ? "p-5 sm:p-8" : "p-4 sm:p-6", ended ? "translate-y-0" : "translate-y-6")} role={ended ? "status" : undefined}>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-white ring-1 ring-white/25 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7FD3FF] opacity-75 motion-reduce:hidden" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#7FD3FF]" /></span>
            {eyebrow}
          </span>
          <div className={cn("max-w-[30rem] font-bold leading-tight tracking-[-0.02em] text-white", tall ? "mt-3 text-[1.25rem] sm:text-[1.6rem]" : "mt-2 text-[1.05rem] sm:text-[1.3rem]")}>{title}</div>
          {body && <p className={cn("mt-2 max-w-[32rem] text-[14px] leading-relaxed text-white/80 sm:text-[15px]", !tall && "hidden sm:block")}>{body}</p>}
          {children && <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div>}
        </div>
      </div>

      {ended && (
        <button type="button" onClick={replay} className="s-focus absolute right-3 top-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/12 px-3 text-[12.5px] font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20 sm:right-4 sm:top-4">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />Replay
        </button>
      )}
    </div>
  );
}
