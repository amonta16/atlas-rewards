/**
 * components/landing/sales-arc.tsx — CP-265/266 · the /medspa/app hero background (replaces the paper birds there)
 * and the notifications on the 3D phones below it. Everything is a live feed: a purchase pops in, drifts up
 * and fades out while the next one arrives below it.
 *
 *   SalesArc     the feed over the blue hero (CP-267: the half-circle arcs behind it were removed):
 *                · 1440 px and up: two streams of faint cards, one each side of the text column, a new card
 *                  every 2.4 s per side (staggered), each rising ~320 px over ~8 s, so ~3 per side are in flight
 *                  at different heights, nearer ones larger and clearer than the ones higher up;
 *                · below that: small chips (photo + amount) in the two open spaces on a phone (beside the
 *                  "For med spas" pill and beside the checklist), each popping in, rising a little and fading.
 *   PhoneToasts  notifications landing on the 3D phones like a lock-screen stack: each pops in, slides up as
 *                the next arrives under it, and fades out at the top (every size).
 *
 * The sender is Spa by the Bay (a live Atlas app; Andrew OK'd showing its name publicly on 2026-11-08) and the
 * items are from its real treatment menu. Its menu has no prices on file, so the amounts are illustrative.
 * Decoration only (aria-hidden, pointer-events none). Reduced motion: nothing moves; one card per side, one
 * chip and one toast sit still. Styles: site.css .s-flow, .s-chipflow, .s-toastflow.
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

// Desktop streams: 6 cards a side on a 14.4 s loop (one every 2.4 s), the right side offset by 1.2 s so the
// two sides alternate. Each card gets its own sideways nudge (always outward, away from the text), depth and
// opacity, so the feed looks organic rather than a conveyor belt.
const STREAM = { perSide: 6, every: 2.4 };
const FEEL = [
  { x: 0, k: 1, o: 0.62 }, { x: -14, k: 0.92, o: 0.5 }, { x: -4, k: 1, o: 0.6 },
  { x: -18, k: 0.88, o: 0.46 }, { x: -8, k: 0.96, o: 0.56 }, { x: -12, k: 0.9, o: 0.5 },
];

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
  const loop = STREAM.perSide * STREAM.every;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">

      {/* 1440 px and up: a stream each side of the text column. Lanes sit 700 px out from the center (never
          closer than 24 px to the edge), cards start just above the phones card and rise ~320 px. */}
      <div className="hidden min-[1440px]:block">
        {(["l", "r"] as const).map((side) =>
          PINGS.slice(side === "l" ? 0 : STREAM.perSide, side === "l" ? STREAM.perSide : STREAM.perSide * 2).map((p, i) => {
            const f = FEEL[i];
            return (
              <div key={`${side}${i}`} className="s-flow absolute top-[70%] w-[234px]"
                style={{
                  [side === "l" ? "left" : "right"]: "max(24px, calc(50% - 700px))",
                  ["--p" as string]: `${loop}s`,
                  ["--d" as string]: `${i * STREAM.every + (side === "r" ? STREAM.every / 2 : 0)}s`,
                  ["--x" as string]: `${side === "l" ? f.x : -f.x}px`,
                  ["--k" as string]: String(f.k), ["--o" as string]: String(f.o), ["--rise" as string]: "-320px",
                }}>
                <div className="-translate-y-1/2"><Card p={p} /></div>
              </div>
            );
          }),
        )}
      </div>

      {/* Below 1440 px: chips in the two open spaces on a phone (measured at 375 px): beside the "For med spas"
          pill and beside the checklist. Consecutive chips take different spots; each pops, rises and fades. */}
      <div className="min-[1440px]:hidden">
        {PINGS.slice(0, 8).map((p, i) => {
          const lane = [
            { top: "15.3%", side: "left", inset: "12px" }, { top: "77.8%", side: "right", inset: "-18px" },
            { top: "15.3%", side: "right", inset: "12px" }, { top: "77.8%", side: "left", inset: "-18px" },
          ][i % 4];
          return (
            <div key={i} className="s-chipflow absolute" style={{ top: lane.top, [lane.side]: lane.inset, ["--d" as string]: `${i * 2.5}s` }}>
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

/**
 * Notifications landing on the 3D phones like a lock-screen stack: one every 2.4 s, each popping in a third of
 * the way down, sliding up as the next arrives under it, and fading out near the top. Two are in view at once.
 * Put inside a `relative` box over the video.
 */
export function PhoneToasts() {
  const list = [PINGS[0], PINGS[1], PINGS[2], PINGS[3], PINGS[7], PINGS[5]];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[34%] z-[2] flex justify-center [--rise:-104px] sm:top-[30%] sm:[--rise:-140px]">
      {list.map((p, i) => (
        <div key={i} className="s-toastflow absolute w-[min(78%,300px)] sm:w-[min(44%,320px)]" style={{ ["--d" as string]: `${i * 2.4}s`, zIndex: i }}>
          <Card p={p} compact />
        </div>
      ))}
    </div>
  );
}
