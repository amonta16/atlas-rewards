import { NextResponse } from "next/server";
import { previewDb } from "@/lib/preview/store";
import { isPlacement, type ReviewImage } from "@/lib/landing/review-images";

/**
 * /api/site-reviews?on=medspa — CP-240 · the review screenshots a page should show.
 * Public, read-only, active images only, in the admin's order. Cached at the edge
 * for a minute, so a new upload shows on the sites within about 60 seconds.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const on = new URL(req.url).searchParams.get("on");
  if (!isPlacement(on)) return NextResponse.json({ error: "Pass ?on=medspa, general or venues." }, { status: 400 });
  let images: ReviewImage[] = [];
  try {
    const { data, error } = await previewDb()
      .from("site_review_images")
      .select("id, url, width, height, alt")
      .eq("active", true)
      .contains("show_on", [on])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(60);
    if (!error) images = (data ?? []) as ReviewImage[];
  } catch { /* table not there yet → no images, the pages fall back to what they had */ }
  return NextResponse.json({ images }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } });
}
