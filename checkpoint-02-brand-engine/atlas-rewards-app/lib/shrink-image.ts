/**
 * shrinkImage — CP-164 · downscale a photo in the browser before upload
 *
 * Camera-roll photos are 3–18 MB; nothing in the app draws wider than ~800
 * CSS px (1600 device px). Resize to max 1600 on the long edge and re-encode
 * as JPEG q0.85 (WebP where the browser can encode it). Typical result:
 * 150–350 KB. PNG/JPEG/WebP/HEIC-decodable inputs only; anything else (SVG,
 * GIF, tiny files) is returned as-is.
 */
export async function shrinkImage(file: File, maxEdge = 1600, quality = 0.85): Promise<File> {
  if (!/^image\/(png|jpe?g|webp|heic|heif|avif)$/i.test(file.type)) return file;
  if (file.size < 200_000) return file;                          // already small
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const type = supportsWebp() ? "image/webp" : "image/jpeg";
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, type, quality));
    if (!blob || blob.size >= file.size) return file;             // never make it bigger
    const ext = type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], name, { type, lastModified: Date.now() });
  } catch {
    return file;                                                   // decode failed (odd HEIC etc.) → upload original
  }
}

let webp: boolean | null = null;
function supportsWebp(): boolean {
  if (webp !== null) return webp;
  try {
    const c = document.createElement("canvas");
    webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { webp = false; }
  return webp;
}
