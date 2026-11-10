/**
 * Home → "Educate yourself": the skin scan's doorway. The clinic's own brand
 * color and a real, front-facing face (lib/educate-sample): tracking points
 * land on it, then, once the sample's AI preview exists, a wipe shows the
 * before and after so the difference is plain to see.
 */
import Link from "next/link";
import { EDUCATE_SAMPLE as S } from "@/lib/educate-sample";

const W = S.width, H = S.height;
/** The first 36 points trace the face outline. */
const OVAL = S.pts.slice(0, 36).map(([x, y]) => `${x * W},${y * H}`).join(" ");
const LOOP = 9; // seconds
const FRAME = S.frame;

export function ScanCard({ href, clinicName }: { href: string; clinicName: string }) {
  const hasAfter = !!S.after;
  const chips = S.chips.filter((c) => c.before > 0);
  return (
    <Link href={href} className={`ss-card group block overflow-hidden rounded-[20px] text-white shadow-[0_18px_40px_-22px_rgb(var(--p-rgb)/.75)] transition active:scale-[0.99] ${hasAfter ? "ss-ba" : ""}`}
      style={{ background: "linear-gradient(150deg, rgb(var(--p-rgb)) 0%, color-mix(in srgb, rgb(var(--p-rgb)) 58%, #0B0D12) 100%)" }}>
      {/* The photo and the points share one box, so they always line up. */}
      <div className="relative overflow-hidden bg-ink" style={{ aspectRatio: `${W} / ${Math.round(H * (FRAME[1] - FRAME[0]))}` }}>
        <div className="absolute inset-x-0" style={{ aspectRatio: `${W} / ${H}`, top: `${(-FRAME[0] / (FRAME[1] - FRAME[0])) * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={S.before} alt="" className="absolute inset-0 h-full w-full" />
          {hasAfter && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={S.after!} alt="" className="ss-after absolute inset-0 h-full w-full" />
          )}
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
            <polygon points={OVAL} fill="none" stroke="white" strokeOpacity=".75" strokeWidth="3.5" strokeDasharray="8 12" className="ss-oval" />
            {S.pts.map(([x, y], i) => (
              <circle key={i} cx={x * W} cy={y * H} r="6.5" fill="white" className="ss-dot" style={{ animationDelay: `${(i % 36) * 0.025 + (i >= 36 ? 0.45 : 0)}s` }} />
            ))}
            <rect x="0" y={FRAME[0] * H} width={W} height="14" fill="white" className="ss-sweep" />
          </svg>
        </div>
        {hasAfter && <span className="ss-line pointer-events-none absolute inset-y-0 w-[2px] bg-white shadow-[0_0_14px_rgba(0,0,0,.35)]" />}
        <div className="absolute inset-x-0 bottom-0 h-8" style={{ background: "linear-gradient(to bottom, transparent, rgb(var(--p-rgb)))" }} />

        {hasAfter && <>
          <span className="ss-tag-b absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm">Before</span>
          <span className="ss-tag-a absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink">After treatment · AI preview</span>
        </>}
        {chips.map((c, i) => (
          <span key={c.label} className="ss-chip absolute flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-ink shadow-card"
            style={{ left: `${c.x}%`, top: `${c.y}%`, animationDelay: `${1.2 + i * 0.35}s` }}>
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />{c.label}
            <span className="relative tabular-nums text-sub">
              <span className="ss-n-b">{c.before}</span>
              {hasAfter && <span className="ss-n-a absolute left-0 top-0 font-bold text-brand">{c.after}</span>}
            </span>
          </span>
        ))}
      </div>
      <div className="px-4 pb-4 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">Free skin analysis</p>
        <h4 className="mt-1 text-[21px] font-semibold leading-[1.15] tracking-[-0.02em]">What is your skin asking for?</h4>
        <p className="mt-1.5 text-[13.5px] leading-snug text-white/80">One selfie. Your skin score, what to treat first, and a preview of your results with {clinicName}.</p>
        <span className="mt-3.5 inline-flex h-10 items-center gap-1.5 rounded-full bg-white pl-4 pr-3 text-[14px] font-semibold text-ink transition group-hover:gap-2.5">
          Start the 1-minute scan
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </div>
      <style>{`
        .ss-card .ss-dot,.ss-card .ss-oval,.ss-card .ss-sweep,.ss-card .ss-chip,.ss-card .ss-after,.ss-card .ss-line,.ss-card .ss-tag-b,.ss-card .ss-tag-a,.ss-card .ss-n-b,.ss-card .ss-n-a{animation-duration:${LOOP}s;animation-iteration-count:infinite}
        .ss-card circle{transform-box:fill-box;transform-origin:center}
        /* 1 · scan: sweep, points land, outline traces */
        .ss-card .ss-sweep{opacity:0;animation-name:ss-sweep;animation-timing-function:cubic-bezier(.45,0,.55,1)}
        .ss-card .ss-dot{opacity:0;animation-name:ss-dot;animation-timing-function:ease-out}
        .ss-card .ss-oval{opacity:0;animation-name:ss-oval}
        .ss-card .ss-chip{opacity:0;animation-name:ss-chip;animation-timing-function:cubic-bezier(.2,.7,.2,1)}
        @keyframes ss-sweep{0%{opacity:0;transform:translateY(0)}3%{opacity:.6}22%{opacity:.6;transform:translateY(${H * (FRAME[1] - FRAME[0])}px)}25%,100%{opacity:0;transform:translateY(${H * (FRAME[1] - FRAME[0])}px)}}
        @keyframes ss-dot{0%{opacity:0;transform:scale(.2)}5%{opacity:.95;transform:none}30%{opacity:.85}38%,100%{opacity:0}}
        @keyframes ss-oval{0%,6%{opacity:0}14%{opacity:1}30%{opacity:.8}38%,100%{opacity:0}}
        @keyframes ss-chip{0%{opacity:0;transform:translateY(6px) scale(.96)}5%,82%{opacity:1;transform:none}90%,100%{opacity:0;transform:translateY(-4px)}}
        /* no preview yet: keep the scan on screen longer */
        .ss-card:not(.ss-ba) .ss-dot{animation-name:ss-dot-long}
        .ss-card:not(.ss-ba) .ss-oval{animation-name:ss-oval-long}
        @keyframes ss-dot-long{0%{opacity:0;transform:scale(.2)}5%{opacity:.95;transform:none}75%{opacity:.85}88%,100%{opacity:0}}
        @keyframes ss-oval-long{0%,6%{opacity:0}14%{opacity:1}75%{opacity:.8}88%,100%{opacity:0}}
        /* 2 · before → after wipe, hold, wipe back */
        .ss-card .ss-after{animation-name:ss-after;animation-timing-function:cubic-bezier(.65,0,.35,1)}
        .ss-card .ss-line{opacity:0;animation-name:ss-line;animation-timing-function:cubic-bezier(.65,0,.35,1)}
        .ss-card .ss-tag-b{animation-name:ss-tag-b}
        .ss-card .ss-tag-a{opacity:0;animation-name:ss-tag-a}
        .ss-card .ss-n-b{animation-name:ss-n-b}
        .ss-card .ss-n-a{opacity:0;animation-name:ss-n-a}
        @keyframes ss-after{0%,38%{clip-path:inset(0 100% 0 0)}52%,84%{clip-path:inset(0 0 0 0)}96%,100%{clip-path:inset(0 100% 0 0)}}
        @keyframes ss-line{0%,37%{opacity:0;left:0}39%{opacity:1;left:0}52%{opacity:1;left:calc(100% - 2px)}54%,84%{opacity:0;left:calc(100% - 2px)}85%{opacity:1;left:calc(100% - 2px)}96%{opacity:1;left:0}97%,100%{opacity:0;left:0}}
        @keyframes ss-tag-b{0%,40%{opacity:1}46%,90%{opacity:0}96%,100%{opacity:1}}
        @keyframes ss-tag-a{0%,48%{opacity:0}54%,84%{opacity:1}90%,100%{opacity:0}}
        @keyframes ss-n-b{0%,50%{opacity:1}54%,84%{opacity:0}88%,100%{opacity:1}}
        @keyframes ss-n-a{0%,50%{opacity:0}54%,84%{opacity:1}88%,100%{opacity:0}}
        @media (prefers-reduced-motion: reduce){.ss-card *{animation:none!important}.ss-card .ss-sweep,.ss-card .ss-line,.ss-card .ss-after,.ss-card .ss-tag-a,.ss-card .ss-n-a{display:none}.ss-card .ss-dot,.ss-card .ss-oval,.ss-card .ss-chip{opacity:1}}
      `}</style>
    </Link>
  );
}
