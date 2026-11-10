/**
 * Home → "Educate yourself": the skin scan's doorway. The clinic's own brand
 * color, a real face with tracking points landing on it and scores popping
 * in, so it reads as "this looks at your skin", not as a generic AI badge.
 */
import Link from "next/link";
import { EXAMPLE_IMG } from "@/lib/example";

/** Face landmarks on hero-glow.jpg (1280×720), from MediaPipe Face Landmarker: oval, brows, eyes, nose, lips, cheeks. */
const PTS: [number, number][] = [[0.419,0.157],[0.465,0.168],[0.507,0.189],[0.548,0.229],[0.578,0.28],[0.597,0.342],[0.607,0.404],[0.61,0.477],[0.605,0.542],[0.597,0.606],[0.583,0.673],[0.559,0.739],[0.528,0.785],[0.496,0.81],[0.458,0.826],[0.428,0.832],[0.397,0.833],[0.365,0.829],[0.333,0.818],[0.305,0.804],[0.289,0.788],[0.278,0.772],[0.269,0.754],[0.26,0.727],[0.258,0.695],[0.262,0.645],[0.268,0.577],[0.275,0.514],[0.283,0.455],[0.289,0.395],[0.294,0.33],[0.3,0.275],[0.312,0.226],[0.33,0.188],[0.354,0.163],[0.382,0.155],[0.295,0.271],[0.307,0.243],[0.322,0.23],[0.342,0.233],[0.368,0.245],[0.438,0.261],[0.476,0.264],[0.511,0.275],[0.538,0.302],[0.557,0.339],[0.295,0.353],[0.314,0.354],[0.335,0.357],[0.354,0.359],[0.333,0.361],[0.311,0.359],[0.442,0.379],[0.465,0.386],[0.489,0.395],[0.514,0.405],[0.488,0.399],[0.463,0.389],[0.39,0.335],[0.382,0.363],[0.374,0.384],[0.367,0.401],[0.359,0.42],[0.351,0.445],[0.349,0.471],[0.326,0.507],[0.408,0.528],[0.297,0.601],[0.307,0.58],[0.334,0.565],[0.353,0.574],[0.377,0.576],[0.423,0.612],[0.45,0.64],[0.419,0.667],[0.371,0.68],[0.345,0.676],[0.327,0.668],[0.304,0.636],[0.265,0.46],[0.51,0.526],[0.276,0.493],[0.48,0.549],[0.273,0.403],[0.529,0.469]];
const W = 1280, H = 720;
/** The first 36 points trace the face outline. */
const OVAL = PTS.slice(0, 36).map(([x, y]) => `${x * W},${y * H}`).join(" ");

const CHIPS = [
  { label: "Fine lines", score: 82, x: 64, y: 18, delay: 1.5 },
  { label: "Texture", score: 74, x: 66, y: 52, delay: 2.1 },
  { label: "Radiance", score: 88, x: 6, y: 56, delay: 2.7 },
];

export function ScanCard({ href, clinicName }: { href: string; clinicName: string }) {
  return (
    <Link href={href} className="ss-card group block overflow-hidden rounded-[20px] text-white shadow-[0_18px_40px_-22px_rgb(var(--p-rgb)/.75)] transition active:scale-[0.99]"
      style={{ background: "linear-gradient(150deg, rgb(var(--p-rgb)) 0%, color-mix(in srgb, rgb(var(--p-rgb)) 58%, #0B0D12) 100%)" }}>
      <div className="relative h-[176px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EXAMPLE_IMG.hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 50%, rgb(var(--p-rgb) / .55) 82%, rgb(var(--p-rgb)) 100%)" }} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon points={OVAL} fill="none" stroke="white" strokeOpacity=".7" strokeWidth="2.5" strokeDasharray="6 9" className="ss-oval" />
          {PTS.map(([x, y], i) => (
            <circle key={i} cx={x * W} cy={y * H} r="5" fill="white" className="ss-dot" style={{ animationDelay: `${(i % 36) * 0.03 + (i >= 36 ? 0.5 : 0)}s` }} />
          ))}
          <rect x="0" y="0" width={W} height="10" fill="white" className="ss-sweep" />
        </svg>
        {CHIPS.map((c) => (
          <span key={c.label} className="ss-chip absolute flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink shadow-card"
            style={{ left: `${c.x}%`, top: `${c.y}%`, animationDelay: `${c.delay}s` }}>
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />{c.label}<span className="tabular-nums text-sub">{c.score}</span>
          </span>
        ))}
      </div>
      <div className="px-4 pb-4 pt-3.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Free skin analysis</p>
        <h4 className="mt-1 text-[21px] font-semibold leading-[1.15] tracking-[-0.02em]">What is your skin asking for?</h4>
        <p className="mt-1.5 text-[13.5px] leading-snug text-white/80">One selfie. Your skin score, what to treat first, and a preview of results with {clinicName}.</p>
        <span className="mt-3.5 inline-flex h-10 items-center gap-1.5 rounded-full bg-white pl-4 pr-3 text-[14px] font-semibold text-ink transition group-hover:gap-2.5">
          Start the 1-minute scan
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </div>
      <style>{`
        .ss-card .ss-dot{opacity:0;animation:ss-dot 7s ease-out infinite}
        .ss-card .ss-oval{opacity:0;animation:ss-oval 7s ease-out infinite}
        .ss-card .ss-sweep{opacity:0;animation:ss-sweep 7s cubic-bezier(.45,0,.55,1) infinite}
        .ss-card .ss-chip{opacity:0;animation:ss-chip 7s cubic-bezier(.2,.7,.2,1) infinite}
        @keyframes ss-dot{0%{opacity:0;transform:scale(.2)}6%{opacity:.95}70%{opacity:.85}85%,100%{opacity:0}}
        @keyframes ss-oval{0%,8%{opacity:0}18%{opacity:1}70%{opacity:.8}85%,100%{opacity:0}}
        @keyframes ss-sweep{0%{opacity:0;transform:translateY(0)}4%{opacity:.55}30%{opacity:.55;transform:translateY(${H}px)}34%,100%{opacity:0;transform:translateY(${H}px)}}
        @keyframes ss-chip{0%{opacity:0;transform:translateY(6px) scale(.96)}6%,68%{opacity:1;transform:none}80%,100%{opacity:0;transform:translateY(-4px)}}
        .ss-card circle{transform-box:fill-box;transform-origin:center}
        @media (prefers-reduced-motion: reduce){.ss-card .ss-dot,.ss-card .ss-oval,.ss-card .ss-chip{animation:none;opacity:1}.ss-card .ss-sweep{display:none}}
      `}</style>
    </Link>
  );
}
