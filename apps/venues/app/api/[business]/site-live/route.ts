import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { siteContentFor } from "@/lib/venue-site/content";
import { siteLiveFor } from "@/lib/venue-site/live";

/**
 * GET /api/[business]/site-live — what's in use right now, for the venue website.
 *
 * booking_resources_now is signed-in only, so the website polls it here (service
 * role, lib/venue-site/live.ts). Only businesses with a website answer.
 * → { rows: [{ resource_id, units, busy_now, next_free_at }] }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { business: string } }) {
  const rl = await rateLimit(clientKey(req, "site-live"), 30, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!siteContentFor(params.business)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const rows = await siteLiveFor({ slug: params.business });
  if (!rows) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" } });
}
