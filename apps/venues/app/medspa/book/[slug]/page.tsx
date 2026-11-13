import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { OceanBackground } from "@/components/site/ocean-background";
import { PreviewBooker } from "@/components/medspa/preview-booker";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteFontClass } from "@/lib/landing/site-fonts";
import { getPreviewBySlug, isExpired, SLUG_RE } from "@/lib/preview/store";
import "../../../site.css";

/**
 * /medspa/book/<slug> — CP-246 · the Launch Plan call, booked straight from a preview.
 * Every "Book" link on a preview goes through /medspa/walkthrough/<slug> (which counts the click)
 * and lands here. No preview, an expired one, or a taken area → the regular /medspa/start page.
 * The owner's email is never put on this page; the lead API reads it from the preview.
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: { absolute: "Book your Launch Plan call · Atlas Engine" },
  description: "A 20-minute call with Andrew: your overdue-patient number, your first 3 automations and your launch plan in writing.",
  robots: { index: false, follow: false },
};
export const viewport = { themeColor: "#0B5FD6" };

export default async function Page({ params, searchParams }: { params: { slug: string }; searchParams?: { src?: string } }) {
  const slug = (params.slug ?? "").toLowerCase();
  if (!SLUG_RE.test(slug)) redirect("/medspa/start?from=preview");
  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row)) redirect("/medspa/start?from=preview");
  if (row.area_open === false) redirect(`/medspa/start?from=preview&pv=${slug}`);

  // Came back after answering already? Open on the calendar (or "already booked").
  let lead: { id: string; first: string; qualified: boolean; booked: boolean } | null = null;
  if (row.landing_lead_id) {
    const { data } = await createAdminClient().from("landing_leads").select("id, name, qualified, demo_request_id").eq("id", row.landing_lead_id).maybeSingle();
    if (data) lead = { id: data.id, first: String(data.name ?? "").split(/\s+/)[0] ?? "", qualified: !!data.qualified, booked: !!data.demo_request_id };
  }
  const deadline = row.bonus_deadline_at && Date.parse(row.bonus_deadline_at) > Date.now() && !row.bonus_claimed_at ? row.bonus_deadline_at : null;
  const src = (searchParams?.src ?? "page").replace(/[^a-z_]/g, "").slice(0, 20) || "page";

  return (
    <>
      <MetaPixel />
      <div className={siteFontClass}>
        <div className="site s-ocean relative min-h-screen overflow-x-clip">
          <OceanBackground eager style={{ position: "fixed" }} />
          <div aria-hidden className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-[#06318F]/40" />
          <header className="relative z-10">
            <div className="s-wrap flex h-[68px] items-center justify-between">
              <a href="/medspa" className="s-focus rounded-md" aria-label="Atlas Engine for med spas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/atlas-engine-logo.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
              </a>
            </div>
          </header>
          <main className="relative z-10 pb-16 pt-2 sm:pt-6">
            <div className="s-wrap">
              <PreviewBooker slug={slug} business={row.business_name} hasEmail={!!row.contact_email} lead={lead} bonusDeadline={deadline} src={src} />
            </div>
          </main>
          <footer className="relative z-10 pb-8 text-center text-[12.5px] text-white/70">© {new Date().getFullYear()} Atlas Engine · <a className="hover:text-white" href="/legal/privacy">Privacy</a> · <a className="hover:text-white" href="/legal/terms">Terms</a></footer>
        </div>
      </div>
    </>
  );
}
