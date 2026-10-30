/**
 * img — CP-164 · serve phone-sized images instead of the originals
 *
 * Reward / offer / booking photos are uploaded straight from camera rolls:
 * the average reward image in storage is 1.4 MB and the biggest are 18 MB
 * PNGs, then drawn into a 180px-wide card. That is the "images load slow".
 *
 * Supabase Storage (Pro plan) resizes on the fly at
 *   /storage/v1/render/image/public/<bucket>/<path>?width=…&quality=…
 * and caches the result at the CDN edge. optimizedUrl() rewrites a public
 * object URL into that form; anything that isn't a Supabase public object
 * URL (data:, other hosts, already-transformed) passes through untouched.
 *
 * Widths are CSS pixels; pass the rendered width and we request 1× and 2×
 * for the srcset so retina phones stay crisp without shipping 4000px files.
 */

const OBJECT = "/storage/v1/object/public/";
const RENDER = "/storage/v1/render/image/public/";

export function optimizedUrl(url: string | null | undefined, width = 800, quality = 75): string {
  if (!url) return "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\//.test(url)) return url;
  if (!url.includes(OBJECT)) return url;
  // SVG / GIF: leave alone (transform would rasterize / drop animation).
  if (/\.(svg|gif)(\?|$)/i.test(url)) return url;
  const base = url.replace(OBJECT, RENDER).split("?")[0];
  const w = Math.max(64, Math.min(2000, Math.round(width)));
  return `${base}?width=${w}&quality=${quality}&resize=contain`;
}

/** 1× + 2× candidates for a given CSS width. */
export function optimizedSrcSet(url: string | null | undefined, width = 800, quality = 75): string | undefined {
  if (!url || optimizedUrl(url, width, quality) === url) return undefined;
  return `${optimizedUrl(url, width, quality)} 1x, ${optimizedUrl(url, width * 2, Math.max(55, quality - 10))} 2x`;
}
