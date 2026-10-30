import type { Metadata } from "next";
import { VenuesPage } from "@/components/venues/venues-page";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { interClass } from "@/lib/landing/font";
import "./venues.css";

/**
 * CP-177 — /venues, the Meta ads landing page.
 * Ads-only (noindex) so it never competes with the homepage in search.
 * Copy + offer: lib/landing/venues-offer.ts · Theme: ./venues.css (scoped .lpv)
 * Page body: components/venues/venues-page.tsx
 *
 * Ad URLs should carry UTMs, e.g.
 *   https://www.atlas-engine.app/venues?utm_source=meta&utm_campaign=p1_party&utm_content=larry_v1
 * They're attached to each demo request as its source.
 */
const TITLE = "Atlas Engine: turn first-time guests into regulars and members";
const DESCRIPTION =
  "Your venue's own app, come-back offers sent for you, and memberships that bill monthly. Built for arcades, batting cages, trampoline parks and fun centers. Build your app free in 30 seconds.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "https://www.atlas-engine.app/venues" },
  robots: { index: false, follow: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://www.atlas-engine.app/venues",
    siteName: "Atlas Engine",
    type: "website",
    images: [{ url: "/atlas-icon-512.png", width: 512, height: 512, alt: "Atlas Engine" }],
  },
};

export const viewport = { themeColor: "#020a16" };

export default function Page() {
  return (
    <>
      <MetaPixel />
      <VenuesPage fontClassName={interClass} />
    </>
  );
}
