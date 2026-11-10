import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { NEUTRAL_PALETTE, paletteFromSeed, parseColor, type PreviewColors } from "@/lib/preview/colors";
import { fetchFirstLogo, normalizeLogo } from "@/lib/preview/logo";
import { checkUrl } from "@/lib/preview/safe-fetch";
import { getPreviewBySlug, isExpired, medspaOrigin, previewDb, SLUG_RE, uploadLogo } from "@/lib/preview/store";

/**
 * POST /api/preview/brand — lead-magnet audit, step 2 · "Wrong logo or color? Fix it" on
 * med.atlas-engine.app/p/<slug>. A wrong logo kills the "this is mine" moment, so every
 * render has a one-tap fix path.
 *
 * Body { slug, logo_data?: "data:image/png;base64,…" (≤ 2.5 MB, png/jpeg/webp/gif),
 *        logo_url?: "https://…", primary?: "#RRGGBB" }   (at least one of them)
 * The image goes through the same normalizer as the build (trim, light-logo fix, 512 px PNG)
 * and is re-hosted; a URL is fetched through the SSRF guard. Cross-origin from the med spa
 * app only (CORS locked to that origin), rate limited. Anyone holding the preview link can
 * fix its branding, which is the point: the link is the owner's.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const MAX_BYTES = 2_500_000;
const DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = medspaOrigin();
  return origin === allowed
    ? { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const h = cors(req);
  const reply = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { ...h, "Cache-Control": "no-store" } });
  const rl = await rateLimit(clientKey(req, "pv-brand"), 10, 600);
  if (!rl.ok) return reply(429, { error: "Too many changes. Please wait a few minutes." });

  let b: { slug?: unknown; logo_data?: unknown; logo_url?: unknown; primary?: unknown };
  try { b = await req.json(); } catch { return reply(400, { error: "Invalid request." }); }
  const slug = typeof b.slug === "string" ? b.slug.toLowerCase() : "";
  if (!SLUG_RE.test(slug)) return reply(404, { error: "Preview not found." });
  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row) || (row.status !== "ready" && row.status !== "claimed")) return reply(404, { error: "Preview not found." });

  const update: Record<string, unknown> = {};

  // Logo: an uploaded image, or a link to one
  if (typeof b.logo_data === "string" && b.logo_data) {
    const m = DATA_RE.exec(b.logo_data);
    if (!m) return reply(400, { error: "Use a PNG, JPG, WebP or GIF image." });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_BYTES) return reply(413, { error: "That image is too big. Try one under 2 MB." });
    const logo = await normalizeLogo(buf, "upload");
    if (!logo) return reply(400, { error: "We couldn't use that image as a logo. Try a larger or clearer one." });
    const url = await uploadLogo(slug, logo.png);
    if (!url) return reply(500, { error: "Upload failed. Please try again." });
    Object.assign(update, { logo_url: url, logo_is_monogram: false });
  } else if (typeof b.logo_url === "string" && b.logo_url.trim()) {
    const raw = b.logo_url.trim().slice(0, 500);
    let url: string;
    try { url = checkUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString(); } catch { return reply(400, { error: "That link isn't allowed (public http/https only)." }); }
    const logo = await fetchFirstLogo([url], { maxTries: 1 });
    if (!logo) return reply(400, { error: "We couldn't load a logo from that link. Try uploading the image instead." });
    const hosted = await uploadLogo(slug, logo.png);
    if (!hosted) return reply(500, { error: "Upload failed. Please try again." });
    Object.assign(update, { logo_url: hosted, logo_is_monogram: false });
  }

  // Color: the owner's pick is the brand, muted or not; it's still checked for readable contrast
  if (typeof b.primary === "string" && b.primary) {
    const seed = parseColor(b.primary);
    if (!seed) return reply(400, { error: "Pick a color." });
    const old = (row.colors ?? {}) as Partial<PreviewColors>;
    const colors = paletteFromSeed(seed, old.accent ?? null, { allowMuted: true });
    if (colors.primary === NEUTRAL_PALETTE.primary && seed.toUpperCase() !== NEUTRAL_PALETTE.primary) {
      return reply(400, { error: "That color is too light to read on. Pick a slightly darker shade." });
    }
    update.colors = colors;
  }

  if (!Object.keys(update).length) return reply(400, { error: "Upload a logo or pick a color." });
  const { error } = await previewDb().from("app_previews").update(update).eq("id", row.id);
  if (error) { console.error("[preview] brand fix failed", slug, error.message); return reply(500, { error: "Couldn't save. Please try again." }); }
  return reply(200, { ok: true, logo_url: update.logo_url ?? row.logo_url, colors: update.colors ?? row.colors });
}
