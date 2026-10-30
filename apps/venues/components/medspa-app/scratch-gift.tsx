"use client";
/**
 * ScratchGift — CP-212 · automated offers as a scratch card on the med spa Home.
 *
 * Replaces the pop-up reveal for med spas. The front is always the same art
 * (a gift box with a ribbon, drawn in the practice's brand colour); the
 * patient scratches it off with a finger to see the gift, then taps Claim.
 *
 *   kind "member" (welcome / birthday / anniversary / win-back): the gift is
 *     already saved for them; Claim marks it revealed (mark_welcome_gift_revealed)
 *     so it shows up under Rewards → Your gifts with its desk code.
 *   kind "offer" (holiday / dated automated offer): Claim saves it (save_offer).
 *
 * Scratch progress is remembered on the device so a reload doesn't make
 * them scratch again before claiming. Keyboard / screen-reader users get a
 * "Reveal" button instead of scratching.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAppBase } from "@/lib/use-app-base";
import { optimizedUrl } from "@/lib/img";
import type { MsScratchGift } from "@/lib/medspa-app/data";
import { IcChevronRight, IcGift } from "./icons";
import { SavedGiftDetail } from "@/components/customer/saved-gift-detail";
// CP-213: handwriting for the name tag (Dermis-style gift).
import "@fontsource/caveat/600.css";

const CLEAR_AT = 0.45;        // share of the card scratched before it auto-reveals
const BRUSH = 26;             // CSS px radius of the finger

/* ───────────── colour helpers (brand hex → shades) ───────────── */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return [38, 92, 110];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex: string, toward: [number, number, number], amt: number) {
  const c = rgb(hex);
  const m = c.map((v, i) => Math.round(v + (toward[i] - v) * amt));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
const W: [number, number, number] = [255, 255, 255];
const K: [number, number, number] = [0, 0, 0];

/**
 * The fixed front (CP-213, Dermis style): a parcel wrapped in kraft paper,
 * one ribbon across and one down, in the practice's brand colour with light
 * candy stripes, a bow where they cross. The patient's name tag is drawn on
 * the canvas afterwards (needs the page's fonts). SVG, 600×360.
 */
export function giftFrontSvg(primary: string) {
  const rib = mix(primary, K, 0.04), ribDark = mix(primary, K, 0.3), stripe = mix(primary, W, 0.42), knot = mix(primary, K, 0.42);
  const stripes = (x0: number, y0: number, w: number, h: number, vertical: boolean) => {
    let out = "";
    for (let i = -h; i < w + h; i += 46) {
      out += vertical
        ? `<path d="M${x0} ${y0 + i} l${w} ${-w * 0.9} v16 l${-w} ${w * 0.9} Z" fill="${stripe}" opacity=".85"/>`
        : `<path d="M${x0 + i} ${y0 + h} l${h * 0.9} ${-h} h16 l${-h * 0.9} ${h} Z" fill="${stripe}" opacity=".85"/>`;
    }
    return out;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="600" height="360">
  <defs>
    <linearGradient id="kraft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eec497"/><stop offset=".5" stop-color="#e6b585"/><stop offset="1" stop-color="#d9a06d"/>
    </linearGradient>
    <radialGradient id="sheen" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <pattern id="fiber" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <path d="M0 4.5h9" stroke="#8a5a2b" stroke-width=".6" opacity=".08"/><circle cx="2" cy="2" r=".7" fill="#7a4a20" opacity=".08"/>
    </pattern>
    <clipPath id="hband"><rect x="0" y="150" width="600" height="38"/></clipPath>
    <clipPath id="vband"><rect x="291" y="0" width="38" height="360"/></clipPath>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5a3412" flood-opacity=".28"/></filter>
  </defs>
  <rect width="600" height="360" fill="url(#kraft)"/>
  <rect width="600" height="360" fill="url(#fiber)"/>
  <rect width="600" height="360" fill="url(#sheen)"/>
  <!-- ribbon across -->
  <g filter="url(#sh)"><rect x="0" y="150" width="600" height="38" fill="${rib}"/></g>
  <g clip-path="url(#hband)">${stripes(0, 150, 600, 38, false)}</g>
  <!-- ribbon down -->
  <g filter="url(#sh)"><rect x="291" y="0" width="38" height="360" fill="${rib}"/></g>
  <g clip-path="url(#vband)">${stripes(291, 0, 38, 360, true)}</g>
  <!-- bow -->
  <g filter="url(#sh)" transform="translate(0 32)">
    <path d="M310 137 C 268 92, 222 70, 214 98 C 206 126, 262 146, 310 137 Z" fill="none" stroke="${rib}" stroke-width="15" stroke-linejoin="round"/>
    <path d="M310 137 C 352 92, 398 70, 406 98 C 414 126, 358 146, 310 137 Z" fill="none" stroke="${rib}" stroke-width="15" stroke-linejoin="round"/>
    <path d="M296 146 C 286 180, 266 206, 240 230 L 254 246 L 262 232 L 270 240 C 292 214, 306 186, 312 150 Z" fill="${rib}"/>
    <path d="M308 150 C 316 188, 336 216, 362 246 L 370 236 L 376 250 L 392 240 C 366 214, 346 186, 326 146 Z" fill="${rib}"/>
    <path d="M296 146 C 290 170, 280 190, 268 206 L 276 212 C 290 192, 300 172, 306 150 Z M326 146 C 334 172, 344 192, 356 208 L 348 214 C 336 196, 326 174, 316 150 Z" fill="${stripe}" opacity=".7"/>
    <path d="M300 112 C 306 106, 314 106, 320 112 L 334 128 L 322 160 L 298 160 L 286 128 Z" fill="${knot}"/>
    <ellipse cx="310" cy="136" rx="20" ry="18" fill="${rib}"/>
    <ellipse cx="303" cy="129" rx="6" ry="4" fill="${stripe}" opacity=".9"/>
  </g>
</svg>`;
}

/** Draws the patient's name tag (bottom-left, tilted) onto the front. */
export function drawNameTag(ctx: CanvasRenderingContext2D, w: number, h: number, name: string) {
  const tagW = Math.min(w * 0.4, 220), tagH = Math.max(46, h * 0.2);
  ctx.save();
  ctx.translate(w * 0.06 + tagW / 2, h * 0.76);
  ctx.rotate((-9 * Math.PI) / 180);
  ctx.shadowColor = "rgba(70,40,15,.28)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fdf1f3";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(-tagW / 2, -tagH / 2, tagW, tagH, 5); else ctx.rect(-tagW / 2, -tagH / 2, tagW, tagH);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#3a2328";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let size = Math.round(tagH * 0.66);
  const font = (s: number) => `600 ${s}px 'Caveat','Bradley Hand','Segoe Print','Chalkboard SE',cursive`;
  ctx.font = font(size);
  while (size > 12 && ctx.measureText(name).width > tagW - 22) { size -= 1; ctx.font = font(size); }
  ctx.fillText(name, 0, 2);
  ctx.restore();
}

/** "Your gift: Signature facial" / "20% off" / "+250 points" … */
export function giftValueLine(g: Pick<MsScratchGift, "discountType" | "discountValue" | "rewardName" | "description">, pointsLabel = "points") {
  const v = g.discountValue ?? 0;
  switch (g.discountType) {
    case "reward": return g.rewardName ?? "A treat on us";
    case "points_bonus": return v > 0 ? `+${v.toLocaleString()} ${pointsLabel}` : "Bonus points";
    case "percent": return v > 0 ? `${v}% off your next visit` : "A little something";
    case "flat_cents": return v > 0 ? `$${(v / 100).toFixed(v % 100 ? 2 : 0)} off your next visit` : "A little something";
    default: return g.rewardName ?? "A little something for you";
  }
}

function expiresLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Claim by ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function storeKey(g: MsScratchGift) { return `ms-scratched-${g.savedId ?? g.offerId}`; }
function wasScratched(g: MsScratchGift) { try { return window.localStorage.getItem(storeKey(g)) === "1"; } catch { return false; } }
function rememberScratched(g: MsScratchGift) { try { window.localStorage.setItem(storeKey(g), "1"); } catch { /* private mode */ } }

type Phase = "covered" | "revealed" | "claiming" | "claimed";

export function ScratchGift({ gift, slug, primary, pointsLabel, fullName, demo: demoProp = false }: {
  gift: MsScratchGift; slug: string; primary: string; pointsLabel: string;
  /** CP-213: written on the gift tag, like Dermis. */
  fullName?: string;
  /** Builder preview / harness: never touches the server. */
  demo?: boolean;
}) {
  const demo = demoProp || gift.kind === "demo";
  const tagName = (fullName ?? "").trim() || "For you";
  const base = useAppBase(slug);
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const moves = useRef(0);
  const [phase, setPhase] = useState<Phase>("covered");
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(gift.savedId);
  const [showCode, setShowCode] = useState(false);
  const isPoints = gift.discountType === "points_bonus";
  const value = giftValueLine(gift, pointsLabel);
  const exp = expiresLabel(gift.expiresAt);

  // Already scratched on this phone earlier → skip straight to Claim.
  // Demo / example gifts start covered on every load (CP-213).
  useEffect(() => { if (!demo && wasScratched(gift)) setPhase("revealed"); }, [gift, demo]);

  // Paint the front once the card has a size.
  const paint = useCallback(() => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w) return;
    const r = w.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    c.style.width = `${r.width}px`; c.style.height = `${r.height}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = new Image();
    img.onload = async () => {
      // The tag's handwriting font must be ready before it is painted.
      try { await document.fonts?.load("600 30px Caveat"); } catch { /* falls back to cursive */ }
      ctx.globalCompositeOperation = "source-over";
      // cover-fit the 600×360 art
      const s = Math.max(r.width / 600, r.height / 360);
      const dw = 600 * s, dh = 360 * s;
      ctx.drawImage(img, (r.width - dw) / 2, (r.height - dh) / 2, dw, dh);
      drawNameTag(ctx, r.width, r.height, tagName);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(giftFrontSvg(primary))}`;
  }, [primary, tagName]);

  useEffect(() => {
    if (phase !== "covered") return;
    paint();
    const w = wrap.current;
    if (!w || typeof ResizeObserver === "undefined") return;
    let first = true;
    const ro = new ResizeObserver(() => { if (first) { first = false; return; } if (!started) paint(); });
    ro.observe(w);
    return () => ro.disconnect();
  }, [phase, paint, started]);

  const reveal = useCallback(() => {
    if (!demo) rememberScratched(gift);
    setPhase("revealed");
    import("canvas-confetti").then(({ default: confetti }) => {
      const r = wrap.current?.getBoundingClientRect();
      const y = r ? (r.top + r.height / 2) / window.innerHeight : 0.4;
      confetti({ particleCount: 90, spread: 75, startVelocity: 32, origin: { x: 0.5, y }, colors: [primary, "#ffffff", mix(primary, W, 0.5)], disableForReducedMotion: true });
    }).catch(() => {});
  }, [gift, primary, demo]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function scratchTo(p: { x: number; y: number }) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = BRUSH * 2;
    ctx.beginPath();
    const from = last.current ?? p;
    ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, BRUSH, 0, Math.PI * 2); ctx.fill();
    last.current = p;
    if (++moves.current % 6 === 0 && clearedShare() >= CLEAR_AT) { drawing.current = false; reveal(); }
  }
  function clearedShare() {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let clear = 0, n = 0;
    for (let i = 3; i < data.length; i += 4 * 24) { n++; if (data[i] < 40) clear++; }
    return n ? clear / n : 0;
  }

  async function claim() {
    if (demo) { setPhase("claimed"); setShowCode(true); return; }
    setPhase("claiming"); setError(null);
    const supabase = createClient();
    try {
      if (gift.kind === "member" && gift.savedId) {
        const { error: e } = await supabase.rpc("mark_welcome_gift_revealed", { p_saved_id: gift.savedId });
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.rpc("save_offer", { p_offer_id: gift.offerId });
        if (e) throw e;
        if (typeof data === "string") setSavedId(data);
      }
      setPhase("claimed");
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setError(/expired|no longer active/i.test(msg) ? "This gift has expired." : "Couldn't claim that just now. Try again.");
      setPhase("revealed");
    }
  }

  const covered = phase === "covered";
  return (
    <section className="px-5 pt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>
          {phase === "claimed" ? "Gift claimed" : "A gift for you"}
        </h2>
        {exp && phase !== "claimed" && <span className="text-[14px]" style={{ color: "var(--ms-sub)" }}>{exp}</span>}
      </div>

      <div ref={wrap} className="relative mt-4 aspect-[5/3] w-full select-none overflow-hidden rounded-[22px] bg-white ring-1 ring-[var(--ms-line)] shadow-[0_18px_40px_-26px_rgba(23,28,45,.55)]">
        {/* Underneath: the gift */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center" aria-hidden={covered}>
          {gift.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={optimizedUrl(gift.imageUrl, 240)} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-black/5" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}><IcGift className="h-8 w-8" /></span>
          )}
          <div className="mt-3 line-clamp-1 text-[14px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ms-sub)" }}>{gift.title}</div>
          <div className="mt-1 line-clamp-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: "var(--ms-p)" }}>{value}</div>
          {gift.description && gift.discountType !== "none" && (
            <p className="mt-1.5 line-clamp-2 max-w-[30ch] text-[14px] leading-snug" style={{ color: "var(--ms-sub)" }}>{gift.description}</p>
          )}
          {gift.description && gift.discountType === "none" && !gift.rewardName && (
            <p className="mt-1.5 line-clamp-2 max-w-[30ch] text-[15px] leading-snug" style={{ color: "var(--ms-ink)" }}>{gift.description}</p>
          )}
        </div>

        {/* On top: the scratch-off front */}
        {covered && (
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Gift wrapped for ${tagName}. Scratch to unwrap.`}
            className="absolute inset-0 h-full w-full cursor-grab touch-none"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = null; setStarted(true); scratchTo(point(e)); }}
            onPointerMove={(e) => { if (drawing.current) scratchTo(point(e)); }}
            onPointerUp={() => { drawing.current = false; last.current = null; if (clearedShare() >= CLEAR_AT) reveal(); }}
            onPointerCancel={() => { drawing.current = false; last.current = null; }}
          />
        )}
        {/* Dermis-style tooltip; fades once they start scratching. */}
        {covered && (
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#262b3d] px-3.5 py-2 text-[14px] font-medium text-white shadow-lg transition-opacity duration-300 after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-[#262b3d]"
            style={{ opacity: started ? 0 : 1 }}>
            Scratch to unwrap
          </span>
        )}
      </div>

      {covered && (
        <button type="button" onClick={reveal} className="sr-only focus:not-sr-only focus:mt-3 focus:block focus:text-[15px] focus:underline" style={{ color: "var(--ms-p)" }}>
          Reveal without scratching
        </button>
      )}

      {(phase === "revealed" || phase === "claiming") && (
        <div className="mt-4" style={{ animation: "ms-pop .45s cubic-bezier(.2,.9,.3,1.2) both" }}>
          {gift.voiceUrl && (
            <audio controls preload="none" src={gift.voiceUrl} className="mb-3 h-10 w-full" aria-label="Voice note from the team" />
          )}
          <button type="button" onClick={claim} disabled={phase === "claiming"}
            className="flex h-[54px] w-full items-center justify-center rounded-full text-[17px] font-semibold text-white transition active:scale-[.99] disabled:opacity-70"
            style={{ background: "var(--ms-p)" }}>
            {phase === "claiming" ? "Claiming…" : isPoints ? "Add to my points" : "Claim my gift"}
          </button>
          {error && <p className="mt-2 text-center text-[14px]" style={{ color: "#c0392b" }}>{error}</p>}
        </div>
      )}

      {phase === "claimed" && (
        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[var(--ms-line)]" style={{ animation: "ms-pop .45s cubic-bezier(.2,.9,.3,1.2) both" }}>
          {demo ? (
            <button type="button" onClick={() => setShowCode(true)} className="flex w-full items-center gap-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold" style={{ color: "var(--ms-ink)" }}>Saved to Rewards</span>
                <span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>Show the code at the front desk to use it</span>
              </span>
              <span className="flex items-center gap-1 text-[16px] font-medium" style={{ color: "var(--ms-p)" }}>Code <IcChevronRight className="h-4 w-4" /></span>
            </button>
          ) : isPoints ? (
            <p className="text-[16px]" style={{ color: "var(--ms-ink)" }}>{value} are in your balance. Enjoy!</p>
          ) : (
            <Link href={savedId ? `${base}/rewards?gift=${savedId}` : `${base}/rewards`} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold" style={{ color: "var(--ms-ink)" }}>Saved to Rewards</span>
                <span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>Show the code at the front desk to use it</span>
              </span>
              <span className="flex items-center gap-1 text-[16px] font-medium" style={{ color: "var(--ms-p)" }}>View <IcChevronRight className="h-4 w-4" /></span>
            </Link>
          )}
        </div>
      )}
      {/* Example gift: show what the desk code looks like (nothing is saved). */}
      {demo && showCode && (
        <SavedGiftDetail
          gift={{ saved_id: "example", offer_id: gift.offerId, title: gift.title, description: gift.description, image_url: gift.imageUrl,
            discount_type: "reward", discount_value: null, expires_at: gift.expiresAt, redeem_code: "WELC25X", fulfilled_at: null, gift_reward_name: gift.rewardName }}
          primary={primary} secondary={mix(primary, K, 0.25)} onClose={() => setShowCode(false)} />
      )}
    </section>
  );
}
