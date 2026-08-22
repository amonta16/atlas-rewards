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
 *  3. RECOMMENDED (large file): host externally and paste the embed URL into
 *     `embed`, leaving `src` null. Best options for fast playback:
 *       YouTube (unlisted) : "https://www.youtube-nocookie.com/embed/VIDEO_ID?rel=0&modestbranding=1"
 *       Vimeo              : "https://player.vimeo.com/video/VIDEO_ID?dnt=1"
 *       Cloudflare Stream  : "https://customer-XXXX.cloudflarestream.com/VIDEO_ID/iframe"
 *     The iframe only loads after the poster/Watch button is clicked, so the
 *     provider's JS never slows the first paint. Set `poster` to a frame of
 *     the video (public/videos/atlas-vsl-poster.jpg) for the inline section.
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
