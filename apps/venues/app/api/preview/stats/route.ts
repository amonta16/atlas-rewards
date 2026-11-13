import { NextResponse } from "next/server";
import { previewDb } from "@/lib/preview/store";

/**
 * GET /api/preview/stats — CP-246 · real social proof for the lead magnet.
 * { built_7d }: app previews built in the last 7 days (ready or claimed), leaving out anything
 * named like a test. Read by /medspa/app and by /p/<slug> on the med spa app, which only show it
 * at 3 or more. A count only; nothing about any practice. Cached 5 minutes at the edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { count, error } = await previewDb().from("app_previews")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .in("status", ["ready", "claimed"])
      .not("business_name", "ilike", "%test%");
    if (error) throw new Error(error.message);
    return NextResponse.json({ built_7d: count ?? 0 }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" } });
  } catch (e) {
    console.error("[preview] stats failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ built_7d: null }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
