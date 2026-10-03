/**
 * /venues — Meta ads landing page config (CP-177).
 *
 * Every word a rep or Andrew might need to change lives here, so the page
 * components never need editing for copy. RULES (Atlas Messaging Library):
 *   - Only claim what the capability ledger marks Live.
 *   - Only real numbers. Industry stats always name their source.
 *   - Urgency only from a real reason. `capacityLine` stays null unless true.
 */

/** The commercial offer. Mirror the Library's "offer of record". */
export const VENUES_OFFER = {
  /** Shown under the hero CTA. */
  ctaNote: "Takes 30 seconds. Nothing to install.",
  /** Risk reversal — keep in sync with what reps actually offer. */
  riskReversal: "Try Atlas free for 30 days. Card on file, cancel anytime, no contract.",
  /** Why the offer is this generous (Sell Like Crazy: give the rationale). */
  rationale:
    "Why free? Because within a month your own dashboard shows whether guests are checking in, booking and coming back. If they aren't, you shouldn't pay for it.",
  /**
   * Real scarcity ONLY. e.g. "We install every venue in person, so we take on
   * 6 new California venues a month." Leave null if it isn't literally true.
   */
  capacityLine: null as string | null,
  /** Price is quoted on the walkthrough (it moves). Set a string to show one. */
  priceLine: null as string | null,
};

/** "Everything your venue gets" — Live features only (see ledger). */
export const VENUES_STACK: Array<{ t: string; d: string }> = [
  { t: "Your own branded app", d: "Your name, logo and colors. Guests open it from a QR code at the desk; nothing to download from a store." },
  { t: "Memberships that bill every month", d: "Sell monthly plans and passes in the app. Payments go straight to your own Stripe account." },
  { t: "Online booking and party packages", d: "Cages, lanes and rooms with your real hours and capacity. Party hosts pick a package." },
  { t: "Digital waivers", d: "Every parent who signs becomes a guest you can bring back, not a sheet of paper in a drawer." },
  { t: "Come-back offers that send themselves", d: "Welcome, birthday, holiday and we-miss-you offers go out on their own, with an expiry so guests act." },
  { t: "Front desk on the phone or tablet you already have", d: "Look guests up by phone number, award points, redeem rewards. No second computer." },
  { t: "Campaigns set up and run with you", d: "We plan your slow-day and seasonal offers with you and help you send them. You approve, we handle the rest." },
  { t: "Set up with your team", d: "We configure the app, print your desk QR signs and train your staff in about 15 minutes." },
];

export type VenueTestimonial = {
  id: string;
  name: string;
  /** e.g. "Owner · Flippo's Arcade & Batting Cage". Fill from the real clip. */
  role: string;
  /** One line they actually said on camera. Never invent. */
  quote: string | null;
  /** Vimeo/YouTube embed URL (unlisted is fine). */
  embed: string | null;
  poster: string;
};

/**
 * Filmed testimonials. Larry, Chris and Mary are filmed — upload each clip
 * (vertical, unlisted Vimeo/YouTube), paste the embed URL, fill `role` and one
 * real `quote`. Cards without an embed are hidden in production and shown as
 * marked placeholders in development.
 */
export const VENUES_TESTIMONIALS: VenueTestimonial[] = [
  {
    id: "flippos",
    name: "Flippo's Arcade & Batting Cage",
    role: "Morro Bay, CA",
    quote: null,
    embed: "https://player.vimeo.com/video/1231622571?dnt=1&title=0&byline=0&portrait=0",
    poster: "/landing/flippos-install-owner.webp",
  },
  { id: "larry", name: "Larry", role: "[Venue · role]", quote: null, embed: null, poster: "/landing/flippos-install-team.webp" },
  { id: "chris", name: "Chris", role: "[Venue · role]", quote: null, embed: null, poster: "/landing/flippos-install-team.webp" },
  { id: "mary", name: "Mary", role: "[Venue · role]", quote: null, embed: null, poster: "/landing/flippos-install-team.webp" },
];

/** Objection-handling FAQ (answers must match the ledger). */
export const VENUES_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Do my guests have to download an app?",
    a: "No. They scan a QR code at the desk and the app opens in their browser. They can save it to their home screen, or use the free AE Rewards app on iPhone.",
  },
  {
    q: "We already have a POS or card system with loyalty. Why add this?",
    a: "Keep it. Your POS counts points. Atlas is the app guests carry home: waivers, booking, memberships and the come-back offers that bring them back. If your current system already does that, you don't need us.",
  },
  {
    q: "Do I need a new computer at the front desk?",
    a: "No. The desk runs on the phone or tablet you already have. Staff look guests up by phone number or scan their code.",
  },
  {
    q: "Who sets it up and runs it?",
    a: "We do, with you. We build the app, set up your rewards, waivers and memberships, and help plan your offers. You approve things once; you don't have to become a marketer.",
  },
  {
    q: "What does it cost?",
    a: "One flat monthly plan, no per-guest fees, quoted on your walkthrough because it depends on what you turn on. You can try it free for 30 days first.",
  },
];

/** Industry proof — sourced. Shown with the source name on the page. */
export const VENUES_PROOF = [
  { big: "4.9×", small: "a year: how often members visit, vs 1.3× for non-members", source: "ROLLER 2026 benchmark" },
  { big: "~10", small: "guests in the average group booking at trampoline parks, vs about 2 at the counter", source: "ROLLER 2025 trampoline park benchmark" },
];
