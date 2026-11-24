import { NextResponse } from "next/server";
import { previewDb } from "@/lib/preview/store";
import type { CaseStudy } from "@/lib/landing/case-studies";

/**
 * /api/site-results — CP-275 · the client results the /medspa/app Results section shows.
 * Public, read-only, switched-on rows only, in the admin's order. Cached at the edge for a
 * minute, so an edit shows on the site within about 60 seconds. No table yet → no results
 * (the section keeps its placeholders).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let results: CaseStudy[] = [];
  try {
    const { data, error } = await previewDb()
      .from("site_case_studies")
      .select("id, clinic, headline, stats, uses, photo_url, logo_url, youtube")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(8);
    if (!error) results = (data ?? []) as CaseStudy[];
  } catch { /* table not there yet */ }
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } });
}
