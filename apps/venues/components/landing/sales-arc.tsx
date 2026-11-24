/**
 * components/landing/sales-arc.tsx — CP-265 · the /medspa/app hero background (replaces the paper birds there)
 * and the notifications that drop onto the phones below it.
 *
 *   SalesArc     a soft half-circle rising from the bottom of the blue hero (three faint concentric arcs, a
 *                glow inside, a slow light along the outer one) with "payment received" notifications:
 *                · 1400 px and up: twelve faint cards sitting on the two outer arcs, about three showing at
 *                  once, the far ones smaller and fainter (depth);
 *                · below that (phones, tablets, small laptops): small chips (photo + amount) that peek in
 *                  from the left and right edges, very faint, so the headline stays readable.
 *   PhoneToasts  an iPhone-style notification sliding down onto the 3D phones, one at a time (every size).
 *
 * CP-265: the sender is Spa by the Bay (a live Atlas app; Andrew OK'd showing its name publicly on 2026-11-08)
 * and the items are from its real treatment menu. Its menu has no prices on file, so the amounts are
 * illustrative. Decoration only (aria-hidden, pointer-events none). Reduced motion: the arc stays still,
 * two hero cards and one toast sit still. Styles: site.css .s-arc-run, .s-ping, .s-chip, .s-toast.
 */

type Ping = { img: string; amount: string; item: string };

const SENDER = { name: "Spa by the Bay", color: "#008799" }; // its brand primary

// Spa by the Bay's menu: neurotoxin, dermal filler, lip filler, HydraFacial, microneedling, chemical peel,
// laser hair removal, IPL photofacial.
const PINGS: Ping[] = [
  { img: "neurotoxin", amount: "$520", item: "Neurotoxin, 40 units" },
  { img: "hydrafacial", amount: "$540", item: "HydraFacial, 3 sessions" },
  { img: "lipfiller", amount: "$650", item: "Lip filler, 1 syringe" },
  { img: "microneedling", amount: "$750", item: "Microneedling, 3 sessions" },
  { img: "chemicalpeel", amount: "$450", item: "Chemical peel, 3 sessions" },
  { img: "laserhair", amount: "$900", item: "Laser hair removal, 6 sessions" },
  { img: "ipl", amount: "$350", item: "IPL photofacial" },
  { img: "dermalfiller", amount: "$1,300", item: "Dermal filler, 2 syringes" },
  { img: "glow", amount: "$180", item: "HydraFacial" },
  { img: "smile", amount: "$260", item: "Neurotoxin, 20 units" },
  { img: "eyes", amount: "$390", item: "Neurotoxin, crow's feet" },
  { img: "tightening", amount: "$1,050", item: "Microneedling, 6 sessions" },
];

// Where each desktop card sits: side, ring (o = outer arc, i = inner arc), degrees up from the base line.
// Near cards (outer, low) are larger and clearer; far ones (inner, or high) smaller and fainter.
// All spots sit below the headline and outside the text column (checked at 1400–1920 px). Three show at once
// (index i with i+1 and i+2), and same-side neighbours (i, i+2) never share a height.
const SPOTS: Array<{ side: "l" | "r"; ring: "o" | "i"; deg: number }> = [
  { side: "l", ring: "o", deg: 34 }, { side: "r", ring: "o", deg: 20 }, { side: "l", ring: "o", deg: 14 },
  { side: "r", ring: "o", deg: 40 }, { side: "l", ring: "o", deg: 40 }, { side: "r", ring: "o", deg: 26 },
  { side: "l", ring: "i", deg: 22 }, { side: "r", ring: "o", deg: 40 }, { side: "l", ring: "o", deg: 40 },
  { side: "r", ring: "o", deg: 14 }, { side: "l", ring: "o", deg: 20 }, { side: "r", ring: "o", deg: 40 },
];

// The arc's box: 2:1, centered on the hero's bottom edge. Radii as a share of the width: outer 48%, inner 40.5%.
const BOX = "absolute bottom-0 left-1/2 aspect-[2/1] w-[clamp(760px,78vw,1180px)] -translate-x-1/2";

function onArc(deg: number, side: "l" | "r", r: number) {
  const a = (deg * Math.PI) / 180;
  const x = 50 + (side === "l" ? -1 : 1) * r * Math.cos(a);
  const y = 100 - 2 * r * Math.sin(a);
  return { left: `${x.toFixed(2)}%`, top: `${y.toFixed(2)}%` };
}

function Card({ p, compact = false }: { p: Ping; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl bg-white/95 text-left shadow-[0_18px_40px_-18px_rgba(2,20,70,.6)] ring-1 ring-white/60 backdrop-blur ${compact ? "p-2 pr-2.5" : "p-2.5 pr-3"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/landing/pings/${p.img}.webp`} alt="" width={96} height={96} loading="lazy" decoding="async" className={`shrink-0 rounded-[10px] object-cover ring-1 ring-black/5 ${compact ? "h-9 w-9" : "h-10 w-10"}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[10.5px] font-semibold" style={{ color: SENDER.color }}>{SENDER.name} <span className="font-medium text-[#6B7A8C]">· now</span></span>
          <span className="shrink-0 text-[13px] font-semibold leading-tight text-[#0E7A4F]">+{p.amount}</span>
        </span>
        <span className="block truncate text-[13px] font-semibold leading-tight text-[#0B1B2B]">{p.item}</span>
        <span className="block text-[11px] leading-snug text-[#6B7A8C]">Paid in the app</span>
      </span>
    </div>
  );
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

      {/* 1400 px and up: twelve faint cards on the arcs, ~3 at a time (24 s loop, a new one every 2 s) */}
      <div className={`${BOX} hidden min-[1400px]:block`}>
        {PINGS.map((p, i) => {
          const s = SPOTS[i];
          const far = s.ring === "i" || s.deg >= 40;
          return (
            <div key={i} className="s-ping absolute w-[234px]"
              style={{ ...onArc(s.deg, s.side, s.ring === "o" ? 48 : 40.5), ["--d" as string]: `${i * 2}s`, ["--o" as string]: far ? ".42" : ".62", ["--k" as string]: far ? ".86" : "1" }}>
              <div className="-translate-x-1/2 -translate-y-1/2"><Card p={p} /></div>
            </div>
          );
        })}
      </div>

      {/* Below 1400 px: chips (photo + amount) peeking in from the edges, very faint */}
      {/* Only in the two clear lanes on a phone (measured at 375 px): beside the "For med spas" pill and beside
          the checklist. Consecutive chips take different lanes; ~2 show at once (20 s loop, every 2.5 s). */}
      <div className="min-[1400px]:hidden">
        {PINGS.slice(0, 8).map((p, i) => {
          const lane = [
            { top: "15.3%", side: "left", inset: "12px" }, { top: "76.4%", side: "right", inset: "-6px" },
            { top: "15.3%", side: "right", inset: "12px" }, { top: "76.4%", side: "left", inset: "-6px" },
          ][i % 4];
          const left = lane.side === "left";
          return (
            <div key={i} className="s-chip absolute" style={{ top: lane.top, [lane.side]: lane.inset, ["--d" as string]: `${i * 2.5}s`, ["--x" as string]: left ? "-10px" : "10px" }}>
              <div className="flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/95 py-1 pl-1 pr-2.5 shadow-[0_10px_24px_-12px_rgba(2,20,70,.6)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/landing/pings/${p.img}.webp`} alt="" width={96} height={96} loading="lazy" decoding="async" className="h-6 w-6 rounded-full object-cover" />
                <span className="text-[11.5px] font-semibold text-[#0E7A4F]">+{p.amount}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Notifications sliding down onto the 3D phones, one at a time. Put inside a `relative` box over the video. */
export function PhoneToasts() {
  const list = [PINGS[0], PINGS[1], PINGS[2], PINGS[3], PINGS[7], PINGS[5]];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[6%] z-[2] flex justify-center">
      {list.map((p, i) => (
        <div key={i} className="s-toast absolute w-[min(78%,300px)] sm:w-[min(44%,320px)]" style={{ ["--d" as string]: `${i * 4}s` }}>
          <Card p={p} compact />
        </div>
      ))}
    </div>
  );
}
