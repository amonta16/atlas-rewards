/**
 * /medspa — Meta ads landing page config (CP-182). Mirrors venues-offer.ts.
 *
 * RULES (Atlas Messaging Library):
 *   - Only claim what the capability ledger marks Live. Treatment-cycle recall
 *     and banked membership credits are being built (CP-182 plan): keep their
 *     copy as "we set up and run" until the features ship.
 *   - No before/after photos, no Botox/Juvéderm brand claims in ads, no
 *     cash referral rewards (anti-kickback). No revenue promises.
 *   - Urgency only from a real reason. `capacityLine` stays null unless true.
 */
export const MEDSPA_OFFER_COPY = {
  ctaNote: "Takes about 60 seconds. Nothing to install.",
  riskReversal: "Month to month. No long contract, no 90-day cancellation notice. Cancel anytime.",
  rationale:
    "Why month to month? Because within a couple of treatment cycles your own calendar shows whether overdue patients are coming back. If they aren't, you shouldn't keep paying.",
  capacityLine: null as string | null,
  priceLine: null as string | null,
};

/** "Everything your practice gets" — keep in sync with the capability ledger. */
export const MEDSPA_STACK: Array<{ t: string; d: string }> = [
  { t: "Your own branded patient app", d: "Your name, logo and colors. Patients open it from a QR code at checkout; nothing to find in an app store." },
  { t: "Recall that runs itself", d: "Patients get a \"you're due\" reminder before their treatment wears off, plus a win-back if they go quiet. We set it up and run it with you." },
  { t: "Memberships that bill monthly", d: "Sell monthly memberships in the app. Payments go straight to your own Stripe account." },
  { t: "Rewards for coming back", d: "Points for visits and reviews, redeemable for add-ons you choose. No cash referral payouts." },
  { t: "Birthday and seasonal offers", d: "Birthday treats and seasonal promotions go out on their own, with an expiry so patients act." },
  { t: "More Google reviews", d: "Happy patients get a nudge to review you right after their visit." },
  { t: "Front desk on the tablet you already have", d: "Look patients up by phone number, award points, redeem rewards. No new hardware." },
  { t: "Set up with your team", d: "We build the app, configure rewards and recall, print your checkout QR and train your staff in about 15 minutes." },
];

export type MedspaTestimonial = { id: string; name: string; role: string; quote: string | null; embed: string | null; poster: string };

/** No med spa clients yet. Cards without an embed are hidden in production. */
export const MEDSPA_TESTIMONIALS: MedspaTestimonial[] = [];

export const MEDSPA_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Do my patients have to download an app?",
    a: "No. They scan a QR code at checkout and the app opens in their browser. They can save it to their home screen, or use the free AE Rewards app on iPhone.",
  },
  {
    q: "Our booking software already sends reminders. Why add this?",
    a: "Keep them. Booking reminders confirm appointments patients already made. Atlas goes after the ones who never booked the next one: the \"you're due\" nudge, the win-back, the membership offer, and the rewards that make your practice the one they come back to.",
  },
  {
    q: "We already offer Allē and ASPIRE. Isn't that enough?",
    a: "Those reward the brand, not your practice, and patients can earn them anywhere. Your own app rewards coming back to you, across all your services.",
  },
  {
    q: "Is this compliant for a medical practice?",
    a: "We stay on the marketing side: no medical advice, no treatment claims and no cash rewards for referrals. You approve every offer before it goes out.",
  },
  {
    q: "What does it cost?",
    a: "One flat monthly plan, month to month, quoted on your walkthrough. No percentage of your treatment revenue, ever.",
  },
];

/** Sourced context, shown with the source name. */
export const MEDSPA_PROOF = [
  { big: "3–4 mo", small: "how long neurotoxin typically lasts, so every patient has a due date", source: "American Society of Plastic Surgeons" },
  { big: "$1.4M", small: "average yearly revenue of a US med spa, so one returning patient a week matters", source: "AmSpa 2024 State of the Industry" },
];
