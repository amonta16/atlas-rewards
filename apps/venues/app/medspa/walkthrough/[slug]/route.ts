import { NextResponse } from "next/server";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { getPreviewBySlug, SLUG_RE } from "@/lib/preview/store";

/**
 * GET /medspa/walkthrough/<slug> — CP-234 · "Book a 15-min walkthrough" from a preview.
 *
 * Sends the owner to the existing /medspa calendar for the lead their quiz created
 * (/medspa/start?lead=<id>, which opens straight on the time picker). The lead id
 * is looked up here, so the public preview never carries it. No lead yet (quiz
 * skipped) or area taken → the regular /medspa start page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = (params.slug ?? "").toLowerCase();
  if (!SLUG_RE.test(slug)) return NextResponse.redirect(`${SITE_ORIGIN}/medspa/start?from=preview`, 302);
  // Audit step 6: ?pv= links the lead /medspa/start creates to this preview, so booking stops its follow-up.
  const fallback = NextResponse.redirect(`${SITE_ORIGIN}/medspa/start?from=preview&pv=${slug}`, 302);
  const row = await getPreviewBySlug(slug).catch(() => null);
  const leadId = (row as { landing_lead_id?: string | null } | null)?.landing_lead_id;
  if (!row || !leadId || row.area_open === false) return fallback;
  return NextResponse.redirect(`${SITE_ORIGIN}/medspa/start?lead=${leadId}&from=preview`, 302);
}
