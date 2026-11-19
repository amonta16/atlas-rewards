/**
 * components/landing/gulls.tsx — CP-252 · a few small seagulls gliding across a hero, slow and faint
 * (the Origami "birds in the background" feel, in Atlas's own coastal take: Morro Bay, ocean blue).
 * Pure CSS (site.css .s-gull / s-glide / s-flap): no JS, no layout cost. Decoration only (aria-hidden),
 * hidden entirely when the visitor's device asks for reduced motion.
 * Put it inside a `relative overflow-hidden` parent. `tone="light"` for ocean/blue backgrounds.
 */
type Gull = { top: string; w: number; t: number; d: number; f: number; y1: number; y2: number; o: number };

// Staggered so there are one or two in view at a time, never a flock. Negative delays start some mid-flight.
const FLOCK: Gull[] = [
  { top: "14%", w: 34, t: 30, d: -6, f: 1.15, y1: -16, y2: 10, o: 1 },
  { top: "26%", w: 24, t: 38, d: -21, f: 0.95, y1: 12, y2: -10, o: 0.8 },
  { top: "9%", w: 20, t: 44, d: -33, f: 0.85, y1: -8, y2: 14, o: 0.65 },
  { top: "34%", w: 28, t: 34, d: -14, f: 1.05, y1: 10, y2: -18, o: 0.75 },
];

export function Gulls({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const color = tone === "light" ? "rgba(255,255,255,.7)" : "rgba(11,95,214,.55)";
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {FLOCK.map((g, i) => (
        <svg key={i} viewBox="0 0 40 16" className="s-gull" style={{
          top: g.top, opacity: g.o,
          ["--w" as string]: `${g.w}px`, ["--t" as string]: `${g.t}s`, ["--d" as string]: `${g.d}s`, ["--f" as string]: `${g.f}s`,
          ["--y1" as string]: `${g.y1}px`, ["--y2" as string]: `${g.y2}px`, ["--c" as string]: color,
        }}>
          {/* a gull in flight: two curved wings meeting at the body */}
          <path d="M0 7 C 6 0, 13 0, 20 8 C 27 0, 34 0, 40 7 C 34 5, 27 6.5, 21.5 14 L 20 16 L 18.5 14 C 13 6.5, 6 5, 0 7 Z" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}
