/**
 * Landing analytics — CP-100.
 *
 * One `track()` call fans out to whichever providers are present on
 * `window` at runtime. Nothing is installed by default; add the provider
 * snippet to app/layout.tsx (or a <Script>) and events start flowing:
 *
 *   PostHog  → window.posthog.capture(name, props)
 *   GA4      → window.gtag("event", name, props)
 *   Plausible→ window.plausible(name, { props })
 *   Meta     → window.fbq("trackCustom", name, props)
 *   Google Ads → fires through gtag; map `demo_requested` to a conversion
 *                action in the Ads UI.
 *   Everything also lands in window.dataLayer for GTM.
 *
 * Microsoft Clarity (heatmaps/recordings): paste the Clarity snippet in
 * layout.tsx — it needs no events; it records automatically.
 */

export type LandingEvent =
  | "hero_cta_clicked"
  | "vsl_played"
  | "vsl_25_percent"
  | "vsl_50_percent"
  | "vsl_75_percent"
  | "vsl_completed"
  | "demo_clicked"
  | "demo_requested"
  | "pricing_viewed"
  | "final_cta_clicked"
  | "faq_opened"
  | "interactive_demo_used"
  | "waitlist_joined"
  | "nav_cta_clicked"
  | "section_viewed";

type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    posthog?: { capture: (n: string, p?: Props) => void };
    gtag?: (...args: unknown[]) => void;
    plausible?: (n: string, o?: { props?: Props }) => void;
    fbq?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

export function track(event: LandingEvent, props: Props = {}) {
  if (typeof window === "undefined") return;
  const payload = { ...props, page: "landing" };
  try {
    (window.dataLayer ||= []).push({ event, ...payload });
    window.posthog?.capture(event, payload);
    window.gtag?.("event", event, payload);
    window.plausible?.(event, { props: payload });
    window.fbq?.("trackCustom", event, payload);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[atlas-analytics]", event, payload);
    }
  } catch {
    /* analytics must never break the page */
  }
}
