/**
 * lib/preview/logo.ts — CP-232 · find a spa's logo on its website.
 *
 * Candidate order: apple-touch-icon (largest first) → og:image → site icon
 * (largest first, .ico last) → any <img> whose src, alt, class or id says
 * "logo". Each candidate is downloaded through the SSRF guard and must decode
 * as a real image at least 32 px on its short side. The winner is re-encoded
 * to PNG (max 512 px), which also neutralizes SVG scripts before upload.
 *
 * CP-270 · booking platforms. Google often lists a spa's booking page as its
 * website (Vibrant U Med Spa → vibrantumedspa.janeapp.com), and every icon in
 * that page's head is the platform's own (we showed Jane's logo as theirs).
 * On a booking-platform page the head icons and og:image are skipped, and the
 * spa's logo is found as the <img> whose alt text is the spa's name. On any
 * site, images that are a booking platform's badge ("Book with Vagaro") or
 * that live on a platform's own domain are never the spa's logo.
 */
import { absolutize, findTags } from "./html";
import { safeFetch, type SafeFetchOptions } from "./safe-fetch";

const sizeOf = (sizes: string | undefined) => {
  const m = (sizes ?? "").match(/(\d+)x(\d+)/i);
  return m ? Number(m[1]) : 0;
};

/**
 * Booking and scheduling platforms whose pages (or badges) carry their own brand, not the spa's.
 * A host matches itself and its subdomains. Their asset CDNs are listed too (janeapp.net).
 */
export const BOOKING_PLATFORM_HOSTS = [
  "janeapp.com", "jane.app", "janeapp.net", "vagaro.com", "joinblvd.com", "blvd.co", "boulevard.io",
  "mindbodyonline.com", "mindbody.io", "zenoti.com", "glossgenius.com", "square.site", "squareup.com",
  "acuityscheduling.com", "as.me", "fresha.com", "mangomint.com", "schedulicity.com", "booksy.com",
  "setmore.com", "gettimely.com", "phorest.com", "aestheticrecord.com", "patientnow.com",
  "myaestheticspro.com", "calendly.com", "genbook.com", "styleseat.com", "zocdoc.com", "podium.com",
];

/** Words that mark an image as a platform's badge or logo rather than the spa's. */
const PLATFORM_WORDS = /\b(jane ?app|vagaro|boulevard|mindbody|zenoti|glossgenius|acuity|fresha|mangomint|schedulicity|booksy|setmore|timely|phorest|calendly|zocdoc|podium|powered by|book (now )?(with|on))\b/i;

const hostOf = (u: string | null | undefined) => { try { return new URL(u ?? "").hostname.toLowerCase(); } catch { return ""; } };
const onHosts = (host: string, list: string[]) => !!host && list.some((d) => host === d || host.endsWith(`.${d}`));

/** True when the page itself is a booking platform's page (the spa has no site of its own on file). */
export function isBookingPlatformPage(url: string): boolean {
  return onHosts(hostOf(url), BOOKING_PLATFORM_HOSTS);
}

/** Lower-case letters and digits only, for comparing a business name with an image's alt text. */
const squash = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Ordered, de-duplicated logo candidates from a page. Pure: no network. */
export function logoCandidates(html: string, baseUrl: string, businessName?: string): string[] {
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

  const srcOf = (t: { attrs: Record<string, string> }) => t.attrs.src || t.attrs["data-src"] || (t.attrs.srcset ?? "").split(",")[0]?.trim().split(/\s+/)[0];
  const textOf = (t: { attrs: Record<string, string> }) => [t.attrs.src, t.attrs["data-src"], t.attrs.alt, t.attrs.class, t.attrs.id, t.attrs.title].filter(Boolean).join(" ");
  const badge = (t: { attrs: Record<string, string> }) => PLATFORM_WORDS.test(textOf(t));

  // CP-270: an image whose alt text is the spa's name (the way most sites, and Jane/Vagaro booking pages,
  // mark up the logo). Needs a name of 4+ letters; "Glow" matches alt "Glow Aesthetics" and vice versa.
  const name = squash(businessName ?? "");
  const named = (t: { attrs: Record<string, string> }) => {
    const alt = squash(t.attrs.alt ?? "");
    return name.length >= 4 && alt.length >= 4 && (alt === name || alt.includes(name) || name.includes(alt));
  };
  // A name match wins over the badge words (a spa called "Spa on the Boulevard" keeps its logo).
  const nameImgs = name ? imgs.filter(named).map(srcOf) : [];

  const logoImgs = imgs
    .filter((t) => /logo/i.test(textOf(t)) && (!badge(t) || named(t)))
    .map(srcOf);

  // On a booking platform's page, everything in <head> is the platform's brand: use the page's images only.
  const platformPage = isBookingPlatformPage(baseUrl);
  const ordered = platformPage ? [...nameImgs, ...logoImgs] : [...apple, ...og, ...icons, ...nameImgs, ...logoImgs];
  const ownNamed = new Set(nameImgs.map((h) => absolutize(h, baseUrl)));

  const out: string[] = [];
  for (const href of ordered) {
    const abs = absolutize(href, baseUrl);
    if (!abs || out.includes(abs)) continue;
    // On the spa's own site, an image hosted by a booking platform is that platform's badge, unless it's
    // the one named after the spa. (On a platform page, its images are all on its CDN, so that check is off.)
    if (!platformPage && onHosts(hostOf(abs), BOOKING_PLATFORM_HOSTS) && !ownNamed.has(abs)) continue;
    out.push(abs);
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
