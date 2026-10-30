/**
 * logo-colors.ts — CP-113 (instant demo builder)
 *
 * Pull a brand palette straight out of an uploaded logo, entirely in the
 * browser — no Google Places / paid API. A rep snaps the shop's logo at the
 * door and we derive {primary, secondary, accent} from its dominant colors,
 * then clamp them into a band that always photographs well (same idea as the
 * CP-104 loyalty-card ramp: keep the hue, tame saturation/lightness).
 *
 * Everything here is pure + client-safe (canvas). If extraction can't run
 * (tainted canvas, weird file), callers fall back to a preset theme.
 */

export type BrandColors = { primary: string; secondary: string; accent: string };

/* ── hex ⇄ hsl (self-contained; mirrors lib/loyalty-card.ts) ───────────── */

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

/* ── palette from a single dominant hue ───────────────────────────────── */

/** Brand-primary band: vivid enough to read as a brand color, never neon,
 *  never so light it dies on white or so dark it muddies. */
function clampPrimary(hex: string): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return hslToHex(h, Math.min(Math.max(s, 0.45), 0.9), Math.min(Math.max(l, 0.4), 0.55));
}

/**
 * Build a coherent {primary, secondary, accent} from one seed color.
 * secondary = same family, deeper (for gradients/headers); accent = a
 * shifted, punchy hue for CTAs and rings.
 */
export function paletteFromColor(seed: string): BrandColors {
  const primary = clampPrimary(seed);
  const [h, s, l] = rgbToHsl(...hexToRgb(primary));
  const secondary = hslToHex(h - 12, Math.min(0.85, s * 1.02), Math.max(0.34, l - 0.1));
  // Accent: swing toward the complementary side but stay in the same warm/cool
  // temperature so it harmonizes rather than clashes.
  const accent = hslToHex(h + 150, Math.min(0.88, Math.max(0.55, s)), Math.min(0.58, Math.max(0.46, l)));
  return { primary, secondary, accent };
}

/* ── dominant-color extraction from a logo File ───────────────────────── */

/**
 * Read the top brand colors out of an image File (extracts from the LOCAL
 * file via a data URL, so there is no CORS/tainted-canvas problem). Ignores
 * near-white/near-black/very-low-saturation pixels (backgrounds, outlines)
 * and buckets by coarse hue so we get *distinct* brand colors, most common
 * first. Returns [] if nothing usable (caller falls back to a preset).
 */
export function dominantColorsFromFile(file: File, max = 3): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve([]);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve([]);
      img.onload = () => {
        try {
          const N = 40;
          const canvas = document.createElement("canvas");
          canvas.width = N; canvas.height = N;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve([]);
          ctx.drawImage(img, 0, 0, N, N);
          const { data } = ctx.getImageData(0, 0, N, N);

          // Bucket saturated pixels by 30°-hue × light/dark; keep a weight and
          // a representative color per bucket.
          const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 200) continue;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const [h, s, l] = rgbToHsl(r, g, b);
            if (s < 0.22) continue;               // greys / near-white / near-black
            if (l < 0.12 || l > 0.9) continue;    // extreme lights/darks
            const key = `${Math.round(h / 30)}_${l < 0.5 ? 0 : 1}`;
            const cur = buckets.get(key);
            if (cur) { cur.count++; cur.r += r; cur.g += g; cur.b += b; }
            else buckets.set(key, { count: 1, r, g, b });
          }
          const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
          const out = sorted.slice(0, max).map((k) =>
            rgbToHex(k.r / k.count, k.g / k.count, k.b / k.count),
          );
          resolve(out);
        } catch {
          resolve([]);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Extract → palette in one call. Empty extraction returns null. */
export async function paletteFromLogoFile(file: File): Promise<BrandColors | null> {
  const colors = await dominantColorsFromFile(file, 3);
  if (colors.length === 0) return null;
  const pal = paletteFromColor(colors[0]);
  // If the logo genuinely has a strong second color, use it as the accent.
  if (colors[1]) {
    const [h, s, l] = rgbToHsl(...hexToRgb(colors[1]));
    if (s > 0.3) pal.accent = hslToHex(h, Math.min(0.88, Math.max(0.55, s)), Math.min(0.58, Math.max(0.46, l)));
  }
  return pal;
}

/* ── monogram fallback (no logo on hand) ──────────────────────────────── */

/** Up to two initials from a business name. */
export function initialsOf(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "★";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A data-URL SVG monogram tile in the brand color — used as the logo when the
 * rep doesn't have one. Self-contained (no upload needed); can be dropped
 * straight into logo_url.
 */
export function monogramDataUrl(name: string, colors: BrandColors): string {
  const initials = initialsOf(name);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${colors.primary}"/>` +
    `<stop offset="1" stop-color="${colors.secondary}"/></linearGradient></defs>` +
    `<rect width="240" height="240" rx="52" fill="url(#g)"/>` +
    `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" ` +
    `font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="110" font-weight="800" ` +
    `fill="#ffffff" letter-spacing="2">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
