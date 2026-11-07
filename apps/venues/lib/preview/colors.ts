/**
 * lib/preview/colors.ts — CP-232 · a spa's brand colors, made readable.
 *
 * Order: <meta name="theme-color"> (or msapplication-TileColor) → dominant
 * colors of the logo → a neutral upscale palette. Whatever the seed, the
 * primary is darkened until white text on it (and it as text on white)
 * passes WCAG AA, 4.5:1. The app only shows white on primary and primary on
 * white, so that one check covers both.
 */

export type PreviewColors = { primary: string; secondary: string; accent: string; onPrimary: string };

/** Upscale neutral: espresso, deeper espresso, champagne. */
export const NEUTRAL_PALETTE: PreviewColors = { primary: "#4A3F38", secondary: "#2E2723", accent: "#B89B72", onPrimary: "#FFFFFF" };

export const AA = 4.5;

/* ── conversions ─────────────────────────────────────────────── */

export function parseColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
    return `#${h.slice(0, 6)}`;
  }
  m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    if ([r, g, b].every((v) => v <= 255)) return rgbToHex(r, g, b);
  }
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h / 6) * 360, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
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

/* ── WCAG contrast ───────────────────────────────────────────── */

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Darken (keeping the hue) until `against` reads on it at `min`:1. */
export function ensureContrast(hex: string, against = "#FFFFFF", min = AA): string {
  if (contrastRatio(hex, against) >= min) return hex.toUpperCase();
  const [h, s, l0] = rgbToHsl(...hexToRgb(hex));
  for (let l = l0; l >= 0; l -= 0.01) {
    const c = hslToHex(h, s, l);
    if (contrastRatio(c, against) >= min) return c;
  }
  return "#000000";
}

/* ── seeds ───────────────────────────────────────────────────── */

/** Greys, near-white and near-black make a flat app: not a usable brand seed. */
export function isUsableSeed(hex: string): boolean {
  const [, s, l] = rgbToHsl(...hexToRgb(hex));
  return s >= 0.15 && l >= 0.08 && l <= 0.92;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*>`, "gi");
  for (const tag of html.match(re) ?? []) {
    const n = tag.match(/\b(?:name|property)\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (n !== name) continue;
    const c = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const v = c?.[1] ?? c?.[2] ?? c?.[3] ?? null;
    if (v) return v;
  }
  return null;
}

/** The site's declared brand color, if it is a real color (not white/black/grey). */
export function themeColorFromHtml(html: string): string | null {
  for (const name of ["theme-color", "msapplication-tilecolor", "msapplication-navbutton-color"]) {
    const c = parseColor(metaContent(html, name));
    if (c && isUsableSeed(c)) return c.toUpperCase();
  }
  return null;
}

/**
 * Dominant brand colors from raw RGBA pixels (sharp `.raw()` output).
 * Transparent, near-white, near-black and grey pixels are ignored, and buckets
 * are weighted by saturation so a small colored mark beats a big grey field.
 */
export function dominantColors(pixels: Uint8Array | Buffer, channels: number, max = 3): string[] {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i + channels - 1 < pixels.length; i += channels) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const a = channels >= 4 ? pixels[i + 3] : 255;
    if (a < 128) continue;
    const [, s, l] = rgbToHsl(r, g, b);
    if (s < 0.15 || l > 0.92 || l < 0.08) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    const w = 0.35 + s;
    e.w += w; e.r += r * w; e.g += g * w; e.b += b * w;
    buckets.set(key, e);
  }
  const ranked = [...buckets.values()].sort((x, y) => y.w - x.w);
  const out: string[] = [];
  for (const e of ranked) {
    const hex = rgbToHex(e.r / e.w, e.g / e.w, e.b / e.w);
    // Skip shades too close to one we already have.
    if (out.some((o) => Math.abs(rgbToHsl(...hexToRgb(o))[0] - rgbToHsl(...hexToRgb(hex))[0]) < 18)) continue;
    out.push(hex);
    if (out.length >= max) break;
  }
  return out;
}

/** A full readable palette from one seed color. null/unusable seed → the neutral palette. */
export function paletteFromSeed(seed: string | null, second?: string | null): PreviewColors {
  const s = seed ? parseColor(seed) : null;
  if (!s || !isUsableSeed(s)) return { ...NEUTRAL_PALETTE };
  const primary = ensureContrast(s);
  const [h, sat, l] = rgbToHsl(...hexToRgb(primary));
  const secondary = hslToHex(h, Math.min(1, sat * 1.05), Math.max(0.1, l - 0.14));
  const accentSeed = second ? parseColor(second) : null;
  const accent = accentSeed && isUsableSeed(accentSeed) ? accentSeed.toUpperCase() : hslToHex(h + 28, Math.min(0.6, sat), 0.72);
  return { primary, secondary, accent, onPrimary: "#FFFFFF" };
}

/** True when every pairing the app uses passes AA. */
export function paletteIsReadable(p: PreviewColors): boolean {
  return contrastRatio(p.primary, p.onPrimary) >= AA && contrastRatio(p.secondary, "#FFFFFF") >= AA;
}
