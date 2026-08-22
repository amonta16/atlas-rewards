"use client";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { VSL } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";

/**
 * VSL player — CP-100.
 *
 *  • Self-hosted MP4 (VSL.src): poster-first, `preload="metadata"`, native
 *    controls (accessible), progress events at 25/50/75/100 %.
 *  • External embed (VSL.embed): lazy iframe that only loads after the
 *    poster is clicked, so YouTube/Vimeo JS never slows first paint.
 *  • Neither set: branded "[ ATLAS VSL — REPLACE WITH FINAL VIDEO ]" poster.
 *
 *  Never autoplays audio.
 */
export function VideoPlayer({ autoStart = false }: { autoStart?: boolean }) {
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fired = useRef(new Set<number>());

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!v.duration) return;
      const pct = (v.currentTime / v.duration) * 100;
      for (const m of [25, 50, 75]) {
        if (pct >= m && !fired.current.has(m)) {
          fired.current.add(m);
          track(`vsl_${m}_percent` as "vsl_25_percent");
        }
      }
    };
    const onEnd = () => {
      if (!fired.current.has(100)) {
        fired.current.add(100);
        track("vsl_completed");
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnd);
    };
  }, [started]);

  useEffect(() => {
    if (autoStart && !started && (VSL.src || VSL.embed)) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const start = () => {
    track("vsl_played", { host: VSL.src ? "self" : VSL.embed ? "embed" : "placeholder" });
    setStarted(true);
    requestAnimationFrame(() => videoRef.current?.play().catch(() => {}));
  };

  const frame = "relative aspect-video w-full overflow-hidden rounded-2xl border border-white/20 bg-[#062a44] shadow-[0_30px_80px_-30px_rgba(6,42,68,0.8)]";

  // 1) Self-hosted
  if (VSL.src) {
    return (
      <div className={frame}>
        <video
          ref={videoRef}
          className="h-full w-full"
          controls={started}
          preload="metadata"
          playsInline
          poster={VSL.poster ?? undefined}
          title={VSL.title}
          onPlay={() => !started && start()}
        >
          <source src={VSL.src} type="video/mp4" />
          Your browser doesn&apos;t support embedded video.
        </video>
        {!started && <PosterOverlay onPlay={start} />}
      </div>
    );
  }

  // 2) External embed (lazy)
  if (VSL.embed) {
    const sep = VSL.embed.includes("?") ? "&" : "?";
    return (
      <div className={frame}>
        {started ? (
          <iframe
            className="h-full w-full"
            src={`${VSL.embed}${sep}autoplay=1`}
            title={VSL.title}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <>
            {VSL.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={VSL.poster} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-[url('/landing/team-field-blur.jpg')] bg-cover bg-center opacity-70" aria-hidden />
            )}
            <PosterOverlay onPlay={start} />
          </>
        )}
      </div>
    );
  }

  // 3) Placeholder
  return (
    <div className={frame} role="img" aria-label="Atlas demo video placeholder">
      <div className="absolute inset-0 bg-[url('/landing/team-field-blur.jpg')] bg-cover bg-center" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-[#14213d]/80 via-[#14213d]/45 to-[#14213d]/30" aria-hidden />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <button type="button" onClick={start} className="lp-light lp-focus group grid h-20 w-20 place-items-center lp-light rounded-full bg-white text-[#14213d] shadow-[0_0_0_12px_rgba(255,255,255,0.35)] transition-transform hover:scale-105" aria-label="Play demo video">
          <Play className="ml-1 h-8 w-8 fill-current" aria-hidden />
        </button>
        <div className="lp-placeholder rounded-md bg-white/10 px-3 py-1.5 font-mono text-xs text-white">[ ATLAS VSL — REPLACE WITH FINAL VIDEO ]</div>
        <p className="max-w-sm text-sm text-white/80">
          Paste your YouTube / Vimeo / Stream embed URL into <code className="text-white">VSL.embed</code> in{" "}
          <code className="text-white">lib/landing/config.ts</code>
        </p>
      </div>
      <span className="absolute bottom-4 right-4 rounded-md bg-white/90 px-2 py-1 font-mono text-xs text-slate-700">{VSL.durationLabel}</span>
    </div>
  );
}

function PosterOverlay({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="lp-focus group absolute inset-0 grid place-items-center bg-gradient-to-t from-[#14213d]/50 via-transparent to-transparent"
      aria-label="Play demo video"
    >
      <span className="lp-light grid h-20 w-20 place-items-center lp-light rounded-full bg-white text-[#14213d] shadow-[0_0_0_12px_rgba(255,255,255,0.35)] transition-transform group-hover:scale-105">
        <Play className="ml-1 h-8 w-8 fill-current" aria-hidden />
      </span>
      <span className="absolute bottom-4 right-4 rounded-md bg-white/90 px-2 py-1 font-mono text-xs text-slate-700">{VSL.durationLabel}</span>
    </button>
  );
}
