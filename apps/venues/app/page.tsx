import type { Metadata } from "next";
import { HomePage } from "@/components/home/home-page";
import { siteFontClass } from "@/lib/landing/site-fonts";
import { IOS_APP_URL } from "@/lib/landing/config";
import "./site.css";

/**
 * atlas-engine.app — CP-206: a simple funnel for ANY local business.
 *
 * The business cards (cold approach: coffee shops, donut shops, smoke shops, salons,
 * med spas…) point here, so this page can't be med spa only. It leads with the VSL,
 * one big "Book a demo", then reviews, the apps, the features and how it works.
 *
 * The med spa brand site that lived here (CP-187 → CP-204) moved unchanged to
 * /med-spas (app/med-spas/page.tsx). The med spa ads funnel stays at /medspa;
 * entertainment venues at /venues.
 */
const TITLE = "Atlas Engine: your own loyalty app for your local business";
const DESCRIPTION =
  "The loyalty app big chains have, in your business's name: points, rewards, come-back offers, memberships and a one-tap front desk. Set up for you. Watch the 2-minute video and book a free demo.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://www.atlas-engine.app/" },
  openGraph: {
    title: TITLE, description: DESCRIPTION, url: "https://www.atlas-engine.app/", siteName: "Atlas Engine", type: "website", locale: "en_US",
    images: [{ url: "/landing/atlas-vsl-poster.jpg", width: 1600, height: 900, alt: "Atlas Engine: big chains' loyalty apps vs your local shop" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/landing/atlas-vsl-poster.jpg"] },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: "#0B5FD6" };

export default function Page() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Atlas Engine", url: "https://www.atlas-engine.app/", logo: "https://www.atlas-engine.app/atlas-icon-512.png", email: "andrew@atlas-engine.app" },
    {
      "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Atlas Engine", applicationCategory: "BusinessApplication", operatingSystem: "iOS, Web",
      description: DESCRIPTION, url: "https://www.atlas-engine.app/", installUrl: IOS_APP_URL,
      offers: { "@type": "Offer", availability: "https://schema.org/InStock", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org", "@type": "VideoObject", name: "Why the big chains keep your customers", description: DESCRIPTION,
      thumbnailUrl: "https://www.atlas-engine.app/landing/atlas-vsl-poster.jpg", contentUrl: "https://www.atlas-engine.app/landing/atlas-vsl.mp4",
      uploadDate: "2026-10-09", duration: "PT2M34S",
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className={siteFontClass}><HomePage /></div>
    </>
  );
}
