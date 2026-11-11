/**
 * img — serve stored images as-is (no Supabase Storage image transforms)
 *
 * CP-164 rewrote every Supabase public object URL to the paid
 * /storage/v1/render/image/ endpoint so camera-roll photos (avg 1.4 MB, up to
 * 18 MB) were resized on the fly. Supabase bills that per origin image
 * transformed each billing period (Pro includes 100), and every reward,
 * offer, hero, logo and library photo a visitor saw counted.
 *
 * CP-241: images are now made small when they are stored instead —
 *   · every upload path runs shrinkImage() (max 1600px, WebP/JPEG ~150–350 KB)
 *   · scripts/shrink-stored-images.mjs downsized everything already in storage
 * so optimizedUrl() hands back the plain object URL. It also turns any
 * render/image URL that was saved into the database back into the object URL.
 * Call sites keep their width/quality arguments; they are ignored now.
 */

const OBJECT = "/storage/v1/object/public/";
const RENDER = "/storage/v1/render/image/public/";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function optimizedUrl(url: string | null | undefined, _width = 800, _quality = 75): string {
  if (!url) return "";
  if (url.includes(RENDER) && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\//.test(url)) {
    return url.replace(RENDER, OBJECT).split("?")[0];
  }
  return url;
}

/** No srcset: there is one stored size per image now. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function optimizedSrcSet(_url: string | null | undefined, _width = 800, _quality = 75): string | undefined {
  return undefined;
}
