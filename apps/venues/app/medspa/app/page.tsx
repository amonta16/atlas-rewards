import type { Metadata } from "next";
import { PreviewStart } from "@/components/preview/preview-start";
import { MetaPixel } from "@/components/venues/meta-pixel";
import { siteFontClass } from "@/lib/landing/site-fonts";
import "../../site.css";

/**
 * /medspa/app — CP-232 · instant app preview (Meta ads destination, noindex).
 * Type your spa's name → pick it → about a minute later, your own branded Atlas
 * app at med.atlas-engine.app/p/<slug>.
 *
 * Ad URLs: /medspa/app?utm_source=meta&utm_campaign=ms_preview&utm_content=<ad>
 */
const TITLE = "See your med spa's own app in about a minute | Atlas Engine";
const DESCRIPTION = "Type your practice's name. We build a preview of your own patient app with your logo, colors and treatments.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "https://www.atlas-engine.app/medspa/app", siteName: "Atlas Engine", type: "website", images: [{ url: "/atlas-icon-512.png", width: 512, height: 512, alt: "Atlas Engine" }] },
};

export const viewport = { themeColor: "#0B5FD6" };

export default function Page() {
  return (
    <>
      <MetaPixel />
      <div className={siteFontClass}>
        <PreviewStart />
      </div>
    </>
  );
}
