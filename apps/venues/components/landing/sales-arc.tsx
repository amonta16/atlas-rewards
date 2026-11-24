/**
 * components/landing/sales-arc.tsx — CP-265 · the /medspa/app hero background (replaces the paper birds there).
 * A soft half-circle rising from the bottom of the blue hero (three faint concentric arcs, a light glow inside,
 * a slow light travelling along the outer one), and small "payment received" notifications from a spa's app
 * that fade in and out sitting on the curve, Shopify-style: treatments, memberships, shop orders.
 *
 * Decoration only (aria-hidden, pointer-events none). The notifications are illustrative, like the phone
 * mockups: no practice is named and no figure is presented as a result. They only show from 1400 px up,
 * where there's room beside the search box; smaller screens get the arc alone. Reduced motion: the arc
 * stays, two notifications sit still, nothing moves. Styles: site.css .s-arc-run, .s-ping.
 */

type Ping = { kind: "Treatment" | "Membership" | "Shop"; amount: string; item: string; side: "l" | "r"; deg: number };

// One per side at a time, alternating sides every 3 s (site.css .s-ping: an 18 s loop, delay = 3 s × index).
// deg = where on the outer arc the card sits, measured up from the base line (low = beside the search box).
const PINGS: Ping[] = [
  { kind: "Treatment", amount: "$520", item: "Botox, 40 units", side: "l", deg: 34 },
  { kind: "Membership", amount: "$99/mo", item: "Glow Membership", side: "r", deg: 20 },
  { kind: "Shop", amount: "$68", item: "Vitamin C serum", side: "l", deg: 20 },
  { kind: "Treatment", amount: "$540", item: "HydraFacial, 3 sessions", side: "r", deg: 34 },
  { kind: "Membership", amount: "$149/mo", item: "Injectables Club", side: "l", deg: 34 },
  { kind: "Shop", amount: "$112", item: "SPF + retinol set", side: "r", deg: 20 },
];

// The arc's box: 2:1, centered on the hero's bottom edge. The outer arc's radius is 48% of the width.
const BOX = "absolute bottom-0 left-1/2 aspect-[2/1] w-[clamp(760px,78vw,1180px)] -translate-x-1/2";

function onArc(deg: number, side: "l" | "r") {
  const a = (deg * Math.PI) / 180;
  const x = 50 + (side === "l" ? -1 : 1) * 48 * Math.cos(a);
  const y = 100 - 96 * Math.sin(a);
  return { left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` };
}

export function SalesArc() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 1000 500" className={BOX}>
        <defs>
          <radialGradient id="sa-glow" cx="50%" cy="100%" r="60%">
            <stop offset="0" stopColor="#fff" stopOpacity=".14" />
            <stop offset=".7" stopColor="#fff" stopOpacity=".04" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M20,500 A480,480 0 0 1 980,500 Z" fill="url(#sa-glow)" />
        <path d="M20,500 A480,480 0 0 1 980,500" fill="none" stroke="#fff" strokeOpacity=".26" strokeWidth="1.2" />
        <path d="M95,500 A405,405 0 0 1 905,500" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth="1" />
        <path d="M170,500 A330,330 0 0 1 830,500" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="1" />
        {/* the light along the outer arc */}
        <path className="s-arc-run" d="M20,500 A480,480 0 0 1 980,500" pathLength={1000} fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2" strokeLinecap="round" strokeDasharray="60 940" />
      </svg>

      <div className={`${BOX} hidden min-[1400px]:block`}>
        {PINGS.map((p, i) => (
          <div key={i} className="s-ping absolute w-[234px]" style={{ ...onArc(p.deg, p.side), ["--d" as string]: `${i * 3}s` }}>
            <div className="-translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/95 p-2.5 pr-3 text-left shadow-[0_18px_40px_-18px_rgba(2,20,70,.6)] ring-1 ring-white/60 backdrop-blur">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#0B5FD6] text-[15px] font-bold leading-none text-white">$</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[10.5px] font-medium text-[#6B7A8C]">Your spa&apos;s app · now</span>
                    <span className="shrink-0 text-[13px] font-semibold leading-tight text-[#0E7A4F]">+{p.amount}</span>
                  </span>
                  <span className="block truncate text-[13px] font-semibold leading-tight text-[#0B1B2B]">{p.item}</span>
                  <span className="block text-[11px] leading-snug text-[#6B7A8C]">{p.kind} · paid in your app</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
