import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { interClass } from "@/lib/landing/font";
import { FAQS } from "@/lib/landing/faqs";
import { IOS_APP_URL } from "@/lib/landing/config";

/**
 * CP-100 — Atlas Engine landing page (replaces the CP-2.5 placeholder).
 *
 * This file owns SEO (metadata + JSON-LD) and the typeface. The page body
 * lives in components/landing/landing-page.tsx, which composes the sections
 * in conversion order:
 *
 *   Navbar → Hero → LogoCloud → VSLSection → ProblemSection →
 *   InteractiveDemo → RewardsDemo → FeatureShowcase → AnalyticsDemo →
 *   HowItWorks → BeforeAfter → SocialProof → CaseStudy → PricingSection →
 *   AgencyWaitlist → FAQ → FinalCTA → Footer
 *
 * Quick edits:
 *   • VSL video / poster / embed ........ lib/landing/config.ts  (VSL)
 *   • Demo CTA target (modal vs URL) .... lib/landing/config.ts  (DEMO_BOOKING_TARGET)
 *   • Lead inbox ........................ lib/landing/config.ts  (CONTACT_EMAIL)
 *   • Example brands in the phone ....... lib/landing/industries.ts
 *   • FAQ copy .......................... lib/landing/faqs.ts
 *   • Analytics fan-out ................. lib/landing/analytics.ts
 *   • Backend (tables + RPC) ............ checkpoint-100-landing-redesign/cp100_landing.sql
 *
 * Nothing here touches the customer app ([business]/*), the agency portal,
 * /login, or the API routes outside /api/landing/*.
 */

const TITLE = "Atlas Engine — Your own branded rewards app for local business";
const DESCRIPTION =
  "Give your business its own rewards app: points, streaks, a prize wheel, win-back offers, referrals and review requests — built in your brand, no developers. Book a free demo.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://www.atlas-engine.app/" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://www.atlas-engine.app/",
    siteName: "Atlas Engine",
    type: "website",
    locale: "en_US",
    // Replace with a real 1200×630 image at public/og/atlas-og.png → "/og/atlas-og.png"
    images: [{ url: "/atlas-icon-512.png", width: 512, height: 512, alt: "Atlas Engine" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/atlas-icon-512.png"],
  },
  robots: { index: true, follow: true },
};

export default function Page() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Atlas Engine",
      url: "https://www.atlas-engine.app/",
      logo: "https://www.atlas-engine.app/atlas-icon-512.png",
      email: "andrew@atlas-engine.app",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Atlas Engine",
      applicationCategory: "BusinessApplication",
      operatingSystem: "iOS, Web",
      description: DESCRIPTION,
      url: "https://www.atlas-engine.app/",
      installUrl: IOS_APP_URL,
      offers: { "@type": "Offer", availability: "https://schema.org/InStock", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.filter((f) => !f.a.startsWith("[")).map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\s*\[ CONFIRM[^\]]*\]/g, "") },
      })),
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingPage fontClassName={interClass} />
    </>
  );
}
