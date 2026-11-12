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
