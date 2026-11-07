/**
 * lib/preview/logo.ts — CP-232 · find a spa's logo on its website.
 *
 * Candidate order: apple-touch-icon (largest first) → og:image → site icon
 * (largest first, .ico last) → any <img> whose src, alt, class or id says
 * "logo". Each candidate is downloaded through the SSRF guard and must decode
 * as a real image at least 32 px on its short side. The winner is re-encoded
 * to PNG (max 512 px), which also neutralizes SVG scripts before upload.
 */
import { absolutize, findTags } from "./html";
import { safeFetch, type SafeFetchOptions } from "./safe-fetch";

const sizeOf = (sizes: string | undefined) => {
  const m = (sizes ?? "").match(/(\d+)x(\d+)/i);
  return m ? Number(m[1]) : 0;
};

/** Ordered, de-duplicated logo candidates from a page. Pure: no network. */
export function logoCandidates(html: string, baseUrl: string): string[] {
  const links = findTags(html, ["link"]);
  const metas = findTags(html, ["meta"]);
  const imgs = findTags(html, ["img"]);
  const rels = (t: { attrs: Record<string, string> }) => (t.attrs.rel ?? "").toLowerCase().split(/\s+/);

  const apple = links
    .filter((t) => rels(t).some((r) => r === "apple-touch-icon" || r === "apple-touch-icon-precomposed"))
    .sort((a, b) => sizeOf(b.attrs.sizes) - sizeOf(a.attrs.sizes))
    .map((t) => t.attrs.href);

  const og = metas
    .filter((t) => ["og:image", "og:image:url", "og:image:secure_url"].includes((t.attrs.property ?? t.attrs.name ?? "").toLowerCase()))
    .map((t) => t.attrs.content);

  const icons = links
    .filter((t) => rels(t).includes("icon"))
    .sort((a, b) => {
      const ico = (h: string | undefined) => (/\.ico(\?|$)/i.test(h ?? "") ? 1 : 0);
      return ico(a.attrs.href) - ico(b.attrs.href) || sizeOf(b.attrs.sizes) - sizeOf(a.attrs.sizes);
    })
    .map((t) => t.attrs.href);

  const logoImgs = imgs
    .filter((t) => /logo/i.test([t.attrs.src, t.attrs["data-src"], t.attrs.alt, t.attrs.class, t.attrs.id].filter(Boolean).join(" ")))
    .map((t) => t.attrs.src || t.attrs["data-src"] || (t.attrs.srcset ?? "").split(",")[0]?.trim().split(/\s+/)[0]);

  const out: string[] = [];
  for (const href of [...apple, ...og, ...icons, ...logoImgs]) {
    const abs = absolutize(href, baseUrl);
    if (abs && !out.includes(abs)) out.push(abs);
  }
  return out;
}

/**
 * `png` is what the app shows (darkened when needed); `colorPng` is the logo as
 * the site has it, for reading brand colors. `adjusted` = we darkened it.
 */
export type LogoImage = { png: Buffer; colorPng: Buffer; width: number; height: number; source: string; adjusted: boolean };

export type LogoTone = { transparentShare: number; meanLuminance: number; meanSaturation: number };

/** How a logo's visible pixels look: share of transparent pixels, and mean luminance/saturation of the rest (0–1). */
export function logoTone(rgba: Uint8Array | Buffer, channels: number): LogoTone {
  let clear = 0, n = 0, lum = 0, sat = 0, total = 0;
  for (let i = 0; i + channels - 1 < rgba.length; i += channels) {
    total++;
    const a = channels >= 4 ? rgba[i + 3] : 255;
    if (a < 128) { clear++; continue; }
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    n++;
  }
  return { transparentShare: total ? clear / total : 0, meanLuminance: n ? lum / n : 0, meanSaturation: n ? sat / n : 0 };
}

/**
 * A light logo on a transparent background (made for a dark website header)
 * disappears on the app's white top bar. Near-white/grey ones are inverted to
 * near-black; light colored ones are dimmed (hue kept). Everything else is untouched.
 */
export function needsDarkening(t: LogoTone): "invert" | "dim" | null {
  if (t.transparentShare < 0.15 || t.meanLuminance < 0.75) return null;
  return t.meanSaturation < 0.18 ? "invert" : "dim";
}

/** Decodes and normalizes one downloaded image. null when it isn't a usable logo. */
export async function normalizeLogo(buf: Buffer, source: string): Promise<LogoImage | null> {
  const sharp = (await import("sharp")).default;
  try {
    const img = sharp(buf, { limitInputPixels: 40_000_000, density: 144 });
    const meta = await img.metadata();
    const okFormats = new Set(["png", "jpeg", "webp", "gif", "svg", "avif", "tiff"]);
    if (!meta.format || !okFormats.has(meta.format)) return null;
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 32) return null;
    // Trim empty margins (transparent or flat background) so a thin wordmark fills
    // the app's logo slot instead of floating small in a big empty canvas.
    let source2: Buffer = await img.rotate().png().toBuffer();
    // Judge light-vs-dark on the untrimmed logo (its transparent canvas is part of the signal).
    const pre = await sharp(source2).resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const fix = needsDarkening(logoTone(pre.data, pre.info.channels));
    try {
      const trimmed = await sharp(source2).trim({ threshold: 12 }).png().toBuffer({ resolveWithObject: true });
      if (trimmed.info.width >= 24 && trimmed.info.height >= 12) source2 = trimmed.data;
    } catch { /* nothing to trim */ }
    const { data, info } = await sharp(source2)
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });

    let shown = data;
    if (fix === "invert") shown = await sharp(data).ensureAlpha().negate({ alpha: false }).png({ compressionLevel: 9 }).toBuffer();
    if (fix === "dim") shown = await sharp(data).ensureAlpha().modulate({ brightness: 0.45, saturation: 1.2 }).png({ compressionLevel: 9 }).toBuffer();
    return { png: shown, colorPng: data, width: info.width, height: info.height, source, adjusted: fix !== null };
  } catch {
    return null;
  }
}

/** Tries candidates in order; returns the first usable logo, or null. */
export async function fetchFirstLogo(candidates: string[], opts: { maxTries?: number; fetchOpts?: SafeFetchOptions; deadline?: number } = {}): Promise<LogoImage | null> {
  for (const url of candidates.slice(0, opts.maxTries ?? 5)) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    try {
      const r = await safeFetch(url, { accept: "image/*,*/*;q=0.5", onOverflow: "error", ...opts.fetchOpts });
      if (r.contentType && !r.contentType.startsWith("image/") && r.contentType !== "application/octet-stream") continue;
      const logo = await normalizeLogo(r.body, url);
      if (logo) return logo;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

/** Dominant colors from a (normalized) logo. */
export async function logoPixels(png: Buffer): Promise<{ data: Buffer; channels: number }> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(png).resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, channels: info.channels };
}

/** Two-letter monogram from a business name ("Glow Aesthetics" → "GA"). Letters only. */
export function initialsOf(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(the|and|&|of|med|medical|spa|llc|inc|co)$/i.test(w));
  const letters = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
  return letters.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "A";
}
