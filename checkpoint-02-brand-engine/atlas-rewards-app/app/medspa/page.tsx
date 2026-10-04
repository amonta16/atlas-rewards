import type { Metadata } from "next";
import { MedspaPage } from "@/components/medspa/medspa-page";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { interClass } from "@/lib/landing/font";
import "../venues/venues.css";

/**
 * CP-182 — /medspa, the med spa Meta ads landing page (noindex).
 * Copy + offer: lib/landing/medspa-offer.ts · Quiz model: lib/landing/medspa-quiz-model.ts
 * Demo data: lib/landing/medspa-data.ts · Theme: app/venues/venues.css (shared .lpv)
 *
 * Ad URLs: /medspa?utm_source=meta&utm_campaign=ms_recall&utm_content=founder_v1
 */
const TITLE = "Atlas Engine for med spas: bring patients back before their treatment wears off";
const DESCRIPTION =
  "Your practice's own patient app, recall reminders and win-backs run for you, and memberships that bill monthly. Month to month. See your app and your numbers in about a minute.";

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

export const viewport = { themeColor: "#020a16" };

export default function Page() {
  return (
    <>
      <MetaPixel />
      <MedspaPage fontClassName={interClass} />
    </>
  );
}
