/**
 * lib/preview/photos.ts — CP-233 · download a spa's own photos and re-host them.
 *
 * Every photo comes from a URL we found on their site, goes through the SSRF
 * guard, must decode as a real raster image of a useful size, and is re-encoded
 * to JPEG (which also strips metadata) before it's uploaded to storage. A photo
 * that fails any step is simply dropped; the app falls back to our examples.
 */
import { safeFetch } from "./safe-fetch";

export type PhotoKind = "hero" | "treatment" | "team";

const SIZES: Record<PhotoKind, { max: number; min: number }> = {
  hero: { max: 1400, min: 500 },
  treatment: { max: 900, min: 240 },
  team: { max: 500, min: 120 },
};

/** Decode + resize + re-encode one photo. null when it isn't usable. */
export async function normalizePhoto(buf: Buffer, kind: PhotoKind): Promise<Buffer | null> {
  const sharp = (await import("sharp")).default;
  try {
    const img = sharp(buf, { limitInputPixels: 60_000_000 });
    const meta = await img.metadata();
    if (!meta.format || !["jpeg", "png", "webp", "avif", "tiff"].includes(meta.format)) return null;
    if (!meta.width || !meta.height) return null;
    const { min, max } = SIZES[kind];
    if (Math.min(meta.width, meta.height) < min * 0.6 || meta.width < min) return null;
    // A hero has to be landscape-ish; a tall portrait makes a bad banner.
    if (kind === "hero" && meta.height > meta.width * 1.1) return null;
    return await img.rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  } catch {
    return null;
  }
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/**
 * Downloads, normalizes and uploads each { url, kind }. Returns source URL → hosted URL
 * for the ones that worked. Stops starting new downloads after `deadline`.
 */
export async function hostPhotos(
  wanted: Array<{ url: string; kind: PhotoKind }>,
  upload: (jpeg: Buffer, kind: PhotoKind) => Promise<string | null>,
  opts: { deadline?: number; concurrency?: number } = {},
): Promise<Map<string, string>> {
  const unique = wanted.filter((w, i) => wanted.findIndex((x) => x.url === w.url) === i).slice(0, 16);
  const hosted = new Map<string, string>();
  await pool(unique, opts.concurrency ?? 4, async ({ url, kind }) => {
    if (opts.deadline && Date.now() > opts.deadline) return;
    try {
      const r = await safeFetch(url, { accept: "image/*", onOverflow: "error" });
      if (r.contentType && !r.contentType.startsWith("image/") && r.contentType !== "application/octet-stream") return;
      const jpeg = await normalizePhoto(r.body, kind);
      if (!jpeg) return;
      const out = await upload(jpeg, kind);
      if (out) hosted.set(url, out);
    } catch {
      /* dropped */
    }
  });
  return hosted;
}
