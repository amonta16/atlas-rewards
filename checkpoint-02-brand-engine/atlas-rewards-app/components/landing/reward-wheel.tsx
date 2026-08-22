"use client";
import { useRef, useState } from "react";
import { Gift, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";

/**
 * Interactive prize wheel — CP-100.
 * SVG wedges + CSS transform with a cubic-bezier "physics" ease. Lands on a
 * pre-chosen wedge (demo — always a win) then pops a confirmation and a
 * confetti burst (canvas-confetti is already a dependency; loaded lazily).
 */
const WEDGES = [
  { label: "+250 pts", c1: "#22d3ee", c2: "#0ea5e9" },
  { label: "+50 pts", c1: "#1e293b", c2: "#0f172a" },
  { label: "Free drink", c1: "#818cf8", c2: "#6366f1" },
  { label: "+100 pts", c1: "#1e293b", c2: "#0f172a" },
  { label: "+500 pts", c1: "#34d399", c2: "#10b981" },
  { label: "+25 pts", c1: "#1e293b", c2: "#0f172a" },
  { label: "2× points", c1: "#fbbf24", c2: "#f59e0b" },
  { label: "+75 pts", c1: "#1e293b", c2: "#0f172a" },
];
const N = WEDGES.length;
const SEG = 360 / N;

export function RewardWheel({ className }: { className?: string }) {
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<string | null>(null);
  const spins = useRef(0);

  const spin = async () => {
    if (spinning) return;
    setWon(null);
    setSpinning(true);
    if (spins.current === 0) track("interactive_demo_used", { demo: "prize_wheel" });
    spins.current += 1;
    // Demo always lands on a "good" wedge — cycle through the highlights.
    const targets = [0, 4, 6, 2];
    const idx = targets[(spins.current - 1) % targets.length];
    // Pointer is at top (0°). Wedge i is centered at i*SEG + SEG/2 clockwise from top.
    const center = idx * SEG + SEG / 2;
    const jitter = (Math.random() - 0.5) * SEG * 0.5;
    const turns = 5 + Math.floor(Math.random() * 2);
    const current = rot % 360;
    const next = rot - current + turns * 360 + (360 - center) + jitter;
    setRot(next);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    await new Promise((r) => setTimeout(r, reduce ? 50 : 4600));
    setSpinning(false);
    setWon(WEDGES[idx].label);
    if (!reduce) {
      try {
        const confetti = (await import("canvas-confetti")).default;
        confetti({ particleCount: 70, spread: 60, startVelocity: 28, origin: { y: 0.7 }, colors: ["#22d3ee", "#60a5fa", "#fbbf24", "#ffffff"], disableForReducedMotion: true });
      } catch {}
    }
  };

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className="relative h-[260px] w-[260px] sm:h-[300px] sm:w-[300px]">
        {/* Pointer */}
        <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2" aria-hidden>
          <div className="h-0 w-0 border-x-[11px] border-t-[22px] border-x-transparent border-t-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]" />
        </div>
        {/* Ring glow */}
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(34,211,238,0.25),transparent)] blur-xl" aria-hidden />
        <svg
          viewBox="0 0 200 200"
          className="relative h-full w-full drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
          style={{
            transform: `rotate(${rot}deg)`,
            transition: spinning ? "transform 4.6s cubic-bezier(0.12, 0.8, 0.12, 1)" : "none",
          }}
          aria-hidden
        >
          <defs>
            {WEDGES.map((w, i) => (
              <linearGradient key={i} id={`lpw-${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={w.c1} />
                <stop offset="100%" stopColor={w.c2} />
              </linearGradient>
            ))}
          </defs>
          <circle cx="100" cy="100" r="99" fill="#0b1017" />
          {WEDGES.map((w, i) => {
            const a0 = ((i * SEG - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * SEG - 90) * Math.PI) / 180;
            const x0 = 100 + 94 * Math.cos(a0), y0 = 100 + 94 * Math.sin(a0);
            const x1 = 100 + 94 * Math.cos(a1), y1 = 100 + 94 * Math.sin(a1);
            const mid = ((i * SEG + SEG / 2 - 90) * Math.PI) / 180;
            const tx = 100 + 62 * Math.cos(mid), ty = 100 + 62 * Math.sin(mid);
            const deg = i * SEG + SEG / 2;
            return (
              <g key={i}>
                <path d={`M100,100 L${x0},${y0} A94,94 0 0,1 ${x1},${y1} Z`} fill={`url(#lpw-${i})`} stroke="#0b1017" strokeWidth="1.5" />
                <text x={tx} y={ty} fill="#fff" fontSize="8.5" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${deg} ${tx} ${ty})`} style={{ fontFamily: "inherit" }}>
                  {w.label}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="16" fill="#fff" />
          <circle cx="100" cy="100" r="6" fill="#0b1017" />
        </svg>
      </div>

      <div className="mt-6 flex min-h-[56px] items-center justify-center">
        {won ? (
          <div className="lp-pop flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm" role="status">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/20 text-emerald-300">
              <Gift className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <b className="text-white">You won {won}</b> <span className="text-zinc-400">— added to your wallet</span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={spin}
            disabled={spinning}
            className="lp-focus lp-cta-primary inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-[#06101a] hover:bg-cyan-50 disabled:opacity-70"
          >
            <RotateCw className={cn("h-4 w-4", spinning && "animate-spin")} aria-hidden />
            {spinning ? "Spinning…" : "Spin the wheel"}
          </button>
        )}
      </div>
      {won && (
        <button type="button" onClick={spin} className="lp-focus mt-2 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
          Spin again
        </button>
      )}
    </div>
  );
}
