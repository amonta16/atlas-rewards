import type { Metadata } from "next";
import { SitePage } from "@/components/site/site-page";
import { siteFontClass } from "@/lib/landing/site-fonts";
import { MEDSPA_FAQ } from "@/lib/landing/medspa-offer";
import { IOS_APP_URL } from "@/lib/landing/config";
import "../site.css";

/**
 * atlas-engine.app/med-spas — CP-206: the med spa brand site, moved here unchanged from "/".
 * "/" is now a simple all-business funnel (the business cards point there; see components/home).
 *
 * CP-187: the brand site, med spa first.
 *
 * The previous root (family entertainment centers, CP-100 → CP-176) is kept
 * in components/landing/landing-page.tsx; venues are served by /venues.
 * This page wraps the new SitePage in the brand-site typefaces.
 */
const TITLE = "Atlas Engine — The patient app for independent med spas";
const DESCRIPTION =
  "Your own patient app that tells each patient when she's due, banks memberships toward the next visit, and gives your front desk the list of who to call this week. Set up with you in about a week. Month to month.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://www.atlas-engine.app/med-spas" },
  openGraph: {
    title: TITLE, description: DESCRIPTION, url: "https://www.atlas-engine.app/med-spas", siteName: "Atlas Engine", type: "website", locale: "en_US",
    images: [{ url: "/atlas-icon-512.png", width: 512, height: 512, alt: "Atlas Engine" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/atlas-icon-512.png"] },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: "#FFFFFF" };

export default function Page() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Atlas Engine", url: "https://www.atlas-engine.app/", logo: "https://www.atlas-engine.app/atlas-icon-512.png", email: "andrew@atlas-engine.app" },
    {
      "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Atlas Engine", applicationCategory: "BusinessApplication", operatingSystem: "iOS, Web",
      description: DESCRIPTION, url: "https://www.atlas-engine.app/med-spas", installUrl: IOS_APP_URL,
      offers: { "@type": "Offer", availability: "https://schema.org/InStock", priceCurrency: "USD" },
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: MEDSPA_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className={siteFontClass}><SitePage /></div>
    </>
  );
}
