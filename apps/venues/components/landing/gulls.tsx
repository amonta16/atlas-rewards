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
  const color = tone === "light" ? "rgba(255,255,255,.85)" : "rgba(11,95,214,.6)";
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {FLOCK.map((g, i) => (
        <svg key={i} viewBox="0 0 40 24" className="s-gull" style={{
          top: g.top, opacity: g.o,
          ["--w" as string]: `${g.w}px`, ["--t" as string]: `${g.t}s`, ["--d" as string]: `${g.d}s`, ["--f" as string]: `${g.f * 2.4}s`,
          ["--y1" as string]: `${g.y1}px`, ["--y2" as string]: `${g.y2}px`, ["--c" as string]: color,
        }}>
          {/* CP-259: a folded paper bird. Faceted wings in two shades flap in short bursts (.s-wings), then hold
              for a glide; the body is a folded diamond with a small head. */}
          <g className="s-wings">
            <polygon points="20,12 2,2 13,13" fill="currentColor" />
            <polygon points="20,12 13,13 8,6.5" fill="currentColor" opacity=".55" />
            <polygon points="20,12 38,2 27,13" fill="currentColor" opacity=".8" />
            <polygon points="20,12 27,13 32,6.5" fill="currentColor" opacity=".45" />
          </g>
          <polygon points="12,13 20,11.5 28,13 20,17" fill="currentColor" opacity=".9" />
          <polygon points="28,13 34,10.5 30,15" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}
