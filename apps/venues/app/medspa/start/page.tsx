import type { Metadata } from "next";
import { MedspaStartPage } from "@/components/medspa/medspa-start-page";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { siteFontClass } from "@/lib/landing/site-fonts";
import "../../site.css";

/**
 * /medspa/start — CP-202 · the funnel as its own page (quiz first, no landing page).
 *   Ad set B points here directly (less friction); the /medspa landing page's
 *   buttons land here too (?from=landing&hero=<arm>), so both arms share one funnel.
 *   /medspa/start?lead=<id> (the "times still open" email) opens on the calendar.
 */
const TITLE = "Is your area still open? · Atlas Engine for med spas";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: "Atlas works with one med spa per area. Check if yours is open, see what patient recall could win back, and pick a time.",
  alternates: { canonical: "https://www.atlas-engine.app/medspa/start" },
  robots: { index: false, follow: false },
  openGraph: { title: TITLE, url: "https://www.atlas-engine.app/medspa/start", siteName: "Atlas Engine", type: "website", images: [{ url: "/atlas-icon-512.png", width: 512, height: 512, alt: "Atlas Engine" }] },
};
export const viewport = { themeColor: "#0B5FD6" };

export default function Page() {
  return (
    <>
      <MetaPixel />
      <div className={siteFontClass}><MedspaStartPage /></div>
    </>
  );
}
