import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { isOwnerViewKey, SLUG_RE } from "@/lib/preview/store";

/**
 * GET /api/preview/owner-check?slug=&k= — CP-245.4 · is this the owner-view key Admin made for
 * this preview? → { ok }. Asked by the med spa page's server before it shows the demo clock.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-owner"), 60, 600);
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });
  const u = new URL(req.url);
  const slug = (u.searchParams.get("slug") ?? "").toLowerCase();
  const k = u.searchParams.get("k") ?? "";
  const ok = SLUG_RE.test(slug) && /^[A-Za-z0-9_-]{16,64}$/.test(k) && isOwnerViewKey(slug, k);
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "no-store" } });
}
