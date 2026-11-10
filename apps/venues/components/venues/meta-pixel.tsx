"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, trackingAllowed } from "@/lib/privacy-optout";

/**
 * Meta Pixel for the ads landing page (CP-177).
 * Loads only when NEXT_PUBLIC_META_PIXEL_ID is set (Vercel env var), so
 * nothing ships until the Pixel exists. Fires PageView here; `track()` in
 * lib/landing/analytics.ts sends the standard `Lead` event when a demo is
 * booked, plus every custom landing event as trackCustom.
 * Next step after launch: add the Conversions API (server-side) for iOS signal loss.
 * CP-242: loads only when trackingAllowed() (cookie banner, "Do Not Sell or
 * Share", Global Privacy Control, opt-in for EU/UK visitors).
 */
export function MetaPixel() {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const check = () => setAllowed(trackingAllowed());
    check();
    window.addEventListener(CONSENT_EVENT, check);
    return () => window.removeEventListener(CONSENT_EVENT, check);
  }, []);
  if (!id || !/^\d{6,20}$/.test(id) || !allowed) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');`}
      </Script>
    </>
  );
}
