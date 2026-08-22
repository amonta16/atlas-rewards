/**
 * Landing page configuration — CP-100.
 *
 * Every swappable piece of the marketing site lives here so Andrew can
 * replace placeholders without touching components.
 */

/** Where the primary "Book a free demo" CTA goes.
 *  - "modal"  → opens the in-house demo-request form (writes to Supabase,
 *               emails CONTACT_EMAIL). Default.
 *  - any URL  → e.g. a Calendly / GHL calendar link; CTAs become plain links. */
export const DEMO_BOOKING_TARGET: "modal" | string = "modal";

/** Inbox that receives demo requests + waitlist signups. */
export const CONTACT_EMAIL = "andrew@atlas-engine.app";

/** Public demo business (join code used on prop phones + Play testers). */
export const DEMO_JOIN_CODE = "SPABYTHEBAY";

/** iOS App Store listing for the customer app ("AE Rewards"). */
export const IOS_APP_URL = "https://apps.apple.com/us/app/ae-rewards/id6797182694";
/** Android — flips on when the Play listing is public. Leave null to hide. */
export const ANDROID_APP_URL: string | null = null;

/**
 * VSL (video sales letter).
 *
 *  HOW TO INSTALL YOUR FINAL VIDEO
 *  1. Drop the file at  public/videos/atlas-vsl.mp4   (H.264 MP4, 1920×1080, ≤ ~40 MB)
 *     and a poster at     public/videos/atlas-vsl-poster.jpg  (1920×1080 JPG, < 300 KB)
 *  2. Set `src` below to "/videos/atlas-vsl.mp4" and `poster` to the JPG path.
 *  3. To host externally instead, set `embed` to the provider URL and leave `src` null:
 *       YouTube : "https://www.youtube.com/embed/VIDEO_ID"
 *       Vimeo   : "https://player.vimeo.com/video/VIDEO_ID"
 *       Wistia  : "https://fast.wistia.net/embed/iframe/VIDEO_ID"
 *  While `src` and `embed` are both null the player renders the branded
 *  "[ ATLAS VSL — REPLACE WITH FINAL VIDEO ]" placeholder.
 */
export const VSL = {
  src: null as string | null,
  poster: null as string | null,
  embed: null as string | null,
  title: "Atlas Engine — how your rewards app works",
  /** Shown on the placeholder + used for the og:video duration hint. */
  durationLabel: "2:40",
};

/** Agency white-label tool waitlist. */
export const WAITLIST = {
  cap: 50,
  /** Promised perk for waitlisters — copy only, no numbers invented. */
  perk: "founding-member pricing",
};

/** Anchor ids used by nav + CTAs. */
export const ANCHORS = {
  product: "product",
  demo: "demo",
  vsl: "watch",
  howItWorks: "how-it-works",
  results: "results",
  pricing: "pricing",
  waitlist: "agency-waitlist",
  faq: "faq",
} as const;
