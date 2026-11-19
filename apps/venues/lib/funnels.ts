/**
 * lib/funnels.ts — CP-235 · every public funnel and site we run, in one list.
 *
 * Powers Admin → Funnels (a bird's-eye view, not a builder). Add a page here
 * when you ship one. `path` is on www.atlas-engine.app unless `url` is set.
 * `ad` = the link to paste into Meta (add your utm_content per ad).
 * `stat` = which lead count to show on the card (see app/(agency)/agency/funnels).
 * CP-252: the founding-offer (/medspa, now redirects to /medspa/app) and quiz-first (/medspa/start) cards are
 * gone: we lead with the instant app preview. /medspa/start still runs for the taken-area waitlist and old email links.
 */

export type Funnel = {
  id: string;
  name: string;
  what: string;
  path?: string;
  url?: string;
  ad?: string;
  stat?: "preview_leads" | "medspa_leads" | "demo_requests";
  /** Shown as a live thumbnail (same-origin pages only). */
  thumb?: boolean;
};

export type FunnelGroup = { id: string; label: string; funnels: Funnel[] };

export const FUNNEL_GROUPS: FunnelGroup[] = [
  {
    id: "medspa", label: "Med spa ads", funnels: [
      { id: "preview", name: "Instant app preview", path: "/medspa/app", thumb: true, stat: "preview_leads",
        what: "Owner types their spa → their own app opens in seconds → email + zip unlock → book the Launch Plan call.",
        ad: "/medspa/app?utm_source=meta&utm_campaign=ms_preview&utm_content=" },
    ],
  },
  {
    id: "sites", label: "Websites", funnels: [
      { id: "home", name: "Homepage", path: "/", thumb: true, what: "atlas-engine.app: the main site." },
      { id: "med-spas", name: "Med spas site", path: "/med-spas", thumb: true, what: "The med spa page of the main site." },
      { id: "venues", name: "Venues site", path: "/venues", thumb: true, what: "Entertainment venues: arcades, karts, trampoline parks." },
      { id: "book-demo", name: "Book a demo", path: "/book-demo", thumb: true, stat: "demo_requests", what: "Calendar booking for demos (venues and general)." },
    ],
  },
  {
    id: "apps", label: "Patient apps (med.atlas-engine.app)", funnels: [
      { id: "demo-clinic", name: "Demo clinic app", url: "https://med.atlas-engine.app/demo", what: "Glow Aesthetics, the built-in example clinic. Use it in demos; no login needed." },
    ],
  },
];
