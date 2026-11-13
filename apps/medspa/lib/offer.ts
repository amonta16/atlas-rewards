/**
 * lib/offer.ts — CP-237 · the founding offer, for the /p/<slug> preview page.
 *
 * KEEP IN SYNC with apps/venues/lib/landing/medspa-funnel.ts (FOUNDING, OFFER_NAME, MONTHLY_PRICE,
 * TERRITORY, HOLD, GUARANTEES short lines). The two apps deploy separately and don't share that file.
 */
export const OFFER = {
  name: "Founding Partner Program",
  foundingActive: true,
  spots: 10,
  setupFull: 1000,
  setupFounding: 500,
  trade: "a short filmed testimonial and a case study after 90 days",
  monthlyPrice: null as number | null,
  radiusMiles: 10,
  holdHours: 48,
  includes: [
    "Your practice's own patient app",
    "Checkout banner, designed and printed",
    "Table tents for every room",
    "QR scanners at checkout",
    "Software setup and staff training",
    "Your area, locked",
  ],
  guarantees: [
    "Pays for itself in 90 days, or you don't pay until it does",
    "Live in 7 days, or setup and month one are free",
    "Cancel any month and keep your banners, table tents and patient list",
  ],
};

/**
 * CP-246 · the call, sold as its own offer. KEEP IN SYNC with LAUNCH_CALL in
 * apps/venues/lib/landing/medspa-funnel.ts; `minutes` with CALL_MINUTES in
 * apps/venues/lib/landing/availability.ts (what the calendar actually books).
 */
export const LAUNCH_CALL = {
  name: "Launch Plan call",
  minutes: 20,
  value: 300,
  takeaways: [
    { t: "Your overdue-patient number", d: "How many of your patients are past due for toxin, filler and facials, and what bringing back 10 a month is worth to you." },
    { t: "Your first 3 automations, picked", d: "The recall, membership and slow-day offers to switch on first, chosen from your own menu." },
    { t: "Your launch plan, in writing", d: "Go-live date, what goes at your checkout and the price for your area, emailed after the call. Yours to keep." },
  ],
};

/**
 * CP-246 · the hero mechanism: why booking reminders and brand points don't bring patients back,
 * and what Atlas does instead. Shown on /p/<slug> under the pitch.
 */
export const MECHANISM = {
  name: "Due-Date Recall",
  problem: [
    { t: "Booking reminders", d: "remind patients about visits they already booked. They never notice the one who didn't." },
    { t: "Allē and ASPIRE", d: "reward the brand, not your practice. Patients can redeem them at any practice that carries it." },
    { t: "Your front desk", d: "means to call everyone who's overdue. On a busy week, nobody does." },
  ],
  steps: [
    { t: "Knows who's due", d: "Every treatment on your menu has a \"due again\" time. Atlas tracks it for every patient." },
    { t: "Reaches them first", d: "When a patient comes due, your app sends your offer to their phone, under your name." },
    { t: "Rewards them for coming back", d: "Points, rewards and memberships that only spend at your practice." },
  ],
};

/**
 * CP-245 · the launch bonus on /p/<slug>: book the walkthrough within `hours` of first seeing
 * your app and these three come free. Cheap for us to deliver, worth real money to a launch.
 * KEEP IN SYNC with LAUNCH_BONUS in apps/venues/lib/landing/medspa-funnel.ts (which enforces the
 * window at booking). `value` is what each would cost from an agency; edit freely.
 */
export const LAUNCH_BONUS = {
  active: true,
  hours: 72, // CP-245.5: was 4
  bonuses: [
    { id: "videos", icon: "film", short: "3 launch videos", title: "Your app, in 3 launch videos",
      detail: "Short vertical videos of your own app on a phone, made for Reels, TikTok and Stories. Post them the day you launch.", value: 1500 },
    { id: "banner", icon: "banner", short: "Desk banner", title: "Custom front-desk banner",
      detail: "A roll-up banner in your colors with your logo and a QR code to your app, designed, printed and shipped to your front desk. Patients scan it while they wait.", value: 250 },
    { id: "audit", icon: "receipt", short: "Software audit", title: "Software cost audit",
      detail: "We go through every tool you pay for (booking, texts, reviews, loyalty, memberships) and show what Atlas replaces, with your monthly savings in writing.", value: 500 },
  ] as Array<{ id: string; icon: "film" | "banner" | "receipt"; short: string; title: string; detail: string; value: number }>,
};
