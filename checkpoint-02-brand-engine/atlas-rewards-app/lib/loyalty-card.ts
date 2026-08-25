import type { CSSProperties } from "react";

/**
 * loyalty-card.ts — CP-104
 *
 * The Rewards-tab membership card used to feed the RAW brand colors straight
 * into a gradient and then composite a white radial at 0.55 alpha with
 * `mix-blend-mode: overlay`. Overlay against an already-saturated color is
 * what produced the blown-out hotspot Andrew flagged ("hit or miss with the
 * input colors") — on a bright yellow or pale pink brand the member's own
 * name stopped being readable.
 *
 * Two ideas fix it, both borrowed from how the Dermis card behaves:
 *
 *  1. NORMALIZE before you decorate. Hue is the part of a brand color that
 *     carries identity; saturation and lightness are the parts that decide
 *     whether a surface looks premium or cheap. So we keep the hue exactly
 *     and clamp the other two into a band that always photographs well.
 *  2. LIGHT THE SURFACE, don't spotlight it. A broad, low-alpha directional
 *     sheen plus a soft corner "volume" gradient — no blend modes, nothing
 *     that can amplify the underlying color.
 *
 * Everything here is pure math on a hex string, so the live card and the
 * builder's phone preview can share it and stay pixel-identical.
 */

/* ── hex ⇄ hsl ────────────────────────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6) || "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h =
    mx === r ? ((g - b) / d + (g < b ? 6 : 0)) :
    mx === g ? ((b - r) / d + 2) :
               ((r - g) / d + 4);
  return [(h / 6) * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

/* ── the ramp ─────────────────────────────────────────────────────────── */

/** Saturation band: below is lifeless grey, above is neon. */
const S_MIN = 0.18, S_MAX = 0.58;
/** Lightness band: below swallows the white text, above washes it out. */
const L_MIN = 0.30, L_MAX = 0.46;

export type LoyaltyCardRamp = {
  /** Top-left of the gradient — the lit face. */
  hi: string;
  /** The normalized brand color; the body of the card. */
  base: string;
  /** Bottom-right — the shaded face. */
  lo: string;
};

/**
 * Clamp any brand primary into a card-worthy ramp. Hue is preserved exactly,
 * so the card still reads as the business's color — a blue brand gets a blue
 * card — it just can't be neon, muddy, or so pale that white text dies on it.
 */
export function loyaltyCardRamp(primary: string | null | undefined): LoyaltyCardRamp {
  const [h, s0, l0] = rgbToHsl(...hexToRgb(primary || "#3b82f6"));
  const s = Math.min(Math.max(s0, S_MIN), S_MAX);
  const l = Math.min(Math.max(l0, L_MIN), L_MAX);
  const base = hslToHex(h, s, l);
  return {
    hi: hslToHex(h, s * 0.96, Math.min(0.92, l + 0.10)),
    base,
    lo: hslToHex(h, Math.min(0.72, s * 1.04), Math.max(0.06, l - 0.17)),
  };
}

/**
 * Container styles for the card: the diagonal ramp, one grounded shadow and
 * a faint brand-tinted lift. Deliberately NOT the six stacked shadows the
 * old card carried — that pile-up is most of why it read busy next to a
 * calmer reference like Dermis.
 */
export function loyaltyCardSurface(r: LoyaltyCardRamp): CSSProperties {
  return {
    background: `linear-gradient(145deg, ${r.hi} 0%, ${r.base} 46%, ${r.lo} 100%)`,
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.26)",      // top bevel, barely there
      "inset 0 0 0 1px rgba(255,255,255,0.10)",    // inner rim
      "0 20px 40px -20px rgba(15,23,42,0.55)",     // grounded drop shadow
      `0 6px 18px -14px ${r.lo}`,                  // faint brand tint underneath
    ].join(", "),
  };
}

/**
 * The broad directional sheen. `shift` comes from the card's tilt so the
 * highlight still travels across the surface, but the alphas are low enough
 * that no brand color can blow out.
 */
export function loyaltyCardSheen(shift = 0): CSSProperties {
  return {
    background:
      "linear-gradient(115deg, transparent 18%, rgba(255,255,255,0.15) 40%," +
      " rgba(255,255,255,0.05) 54%, transparent 70%)",
    transform: `translateX(${shift}px)`,
  };
}

/** Soft corner volume — reads as a lit edge rather than a spotlight. */
export function loyaltyCardVolume(x = 14, y = 8): CSSProperties {
  return {
    background: `radial-gradient(120% 90% at ${x}% ${y}%, rgba(255,255,255,0.16), transparent 60%)`,
  };
}
