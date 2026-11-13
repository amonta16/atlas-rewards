import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/preview/events";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { getPreviewBySlug, SLUG_RE } from "@/lib/preview/store";

/**
 * GET /medspa/walkthrough/<slug> — CP-234 · "Book a 15-min walkthrough" from a preview.
 * CP-246: now lands on /medspa/book/<slug> (the Launch Plan call); the text below is the old flow.
 *
 * Sends the owner to the existing /medspa calendar for the lead their quiz created
 * (/medspa/start?lead=<id>, which opens straight on the time picker). The lead id
 * is looked up here, so the public preview never carries it. No lead yet (quiz
 * skipped) or area taken → the regular /medspa start page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = (params.slug ?? "").toLowerCase();
  if (!SLUG_RE.test(slug)) return NextResponse.redirect(`${SITE_ORIGIN}/medspa/start?from=preview`, 302);
  // Audit step 6: ?pv= links the lead /medspa/start creates to this preview, so booking stops its follow-up.
  const fallback = NextResponse.redirect(`${SITE_ORIGIN}/medspa/start?from=preview&pv=${slug}`, 302);
  const row = await getPreviewBySlug(slug).catch(() => null);
  // Audit step 7: every "Book 15 min" (the page, emails, texts, the desk) lands here. ?src= says which.
  const src = (new URL(req.url).searchParams.get("src") ?? "other").replace(/[^a-z_]/g, "").slice(0, 20) || "other";
  if (row) await recordEvent(row.id, "book_clicked", { [`src_${src}`]: true, last_src: src });
  // CP-246: an open (or unknown) area goes to the preview's own booking page: the Launch Plan call,
  // name + mobile + two taps, then the calendar. A taken area keeps the /medspa/start waitlist flow.
  if (!row || row.area_open === false) return fallback;
  // Keep the ad's UTMs and click id on the way through (the booking page sends them with the lead).
  const keep = new URLSearchParams();
  const inUrl = new URL(req.url).searchParams;
  for (const k of ["utm_source", "utm_campaign", "utm_content", "fbclid"]) { const v = inUrl.get(k); if (v) keep.set(k, v.slice(0, 200)); }
  keep.set("src", src);
  return NextResponse.redirect(`${SITE_ORIGIN}/medspa/book/${slug}?${keep.toString()}`, 302);
}
