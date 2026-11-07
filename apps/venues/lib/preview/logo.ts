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

export type LogoImage = { png: Buffer; width: number; height: number; source: string };

/** Decodes and normalizes one downloaded image. null when it isn't a usable logo. */
export async function normalizeLogo(buf: Buffer, source: string): Promise<LogoImage | null> {
  const sharp = (await import("sharp")).default;
  try {
    const img = sharp(buf, { limitInputPixels: 40_000_000, density: 144 });
    const meta = await img.metadata();
    const okFormats = new Set(["png", "jpeg", "webp", "gif", "svg", "avif", "tiff"]);
    if (!meta.format || !okFormats.has(meta.format)) return null;
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 32) return null;
    const { data, info } = await img
      .rotate()
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return { png: data, width: info.width, height: info.height, source };
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(the|and|&|of|med|medical|spa|llc|inc|co)$/i.test(w));
  const letters = (words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
  return letters.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "A";
}
