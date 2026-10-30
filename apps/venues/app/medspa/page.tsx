import type { Metadata } from "next";
import { MedspaFunnelPage } from "@/components/medspa/medspa-funnel-page";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { siteFontClass } from "@/lib/landing/site-fonts";
import "../site.css";

/**
 * /medspa — the med spa Meta ads landing page (noindex).
 * CP-182 → CP-184: first versions ("porcelain & deep water", components/medspa/medspa-page.tsx, kept, unused).
 * CP-201: rebuilt in the brand-site look (app/site.css, Manrope) with the full funnel:
 *   build your app → numbers → estimate → qualify gate → calendar → pre-call page
 *   (/medspa/confirm/<token>) → reminders → outcome links → Meta Purchase.
 * Funnel knobs: lib/landing/medspa-funnel.ts · Copy: lib/landing/medspa-offer.ts
 *
 * Ad URLs: /medspa?utm_source=meta&utm_campaign=ms_recall&utm_content=founder_v1
 */
const TITLE = "Atlas Engine for med spas: bring patients back before their treatment wears off";
const DESCRIPTION =
  "Your practice's own patient app, reminders before each treatment wears off, and memberships that bill monthly. Month to month. See your app and your numbers in about a minute.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://www.atlas-engine.app/medspa" },
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://www.atlas-engine.app/medspa",
    siteName: "Atlas Engine",
    type: "website",
    images: [{ url: "/atlas-icon-512.png", width: 512, height: 512, alt: "Atlas Engine" }],
  },
};

export const viewport = { themeColor: "#FFFFFF" };

export default function Page() {
  return (
    <>
      <MetaPixel />
      <div className={siteFontClass}>
        <MedspaFunnelPage />
      </div>
    </>
  );
}
