/**
 * lib/landing/medspa-funnel.ts — CP-201 · the /medspa ads funnel, one config file.
 *
 *   Ad → /medspa → build your app (3 taps) → your numbers (4 taps) → estimate
 *   → STEP 1: qualify form → GATE → qualified: calendar unlocks + Meta "Lead"
 *                                 → not a fit: nurture email, no calendar, NO Meta signal
 *   → booked: Meta "Schedule" → pre-call page (/medspa/confirm/<token>): video + "confirm I'll be there"
 *   → reminders (24 h, 2 h) → walkthrough → Andrew taps Showed / No-show / Paid
 *   → Paid: Meta "Purchase" (Conversions API) so Meta learns who actually buys.
 *
 * Everything Andrew is likely to tune lives here: who qualifies, the form
 * options, the pre-call video, the price line, reminder timing.
 *
 * Messaging Library rules still apply: no invented results, no price quoted
 * as settled unless PRICE_BEFORE_CALL is set on purpose.
 */

/* ───────────── who qualifies (the gate) ───────────── */

/** Step-1 role question. `qualifies: false` = no calendar. */
export const ROLES = [
  { id: "owner", label: "Owner", qualifies: true },
  { id: "partner", label: "Co-owner or partner", qualifies: true },
  { id: "manager", label: "Practice manager", qualifies: true },
  { id: "provider", label: "Provider, not an owner", qualifies: false },
  { id: "staff", label: "Front desk or staff", qualifies: false },
  { id: "research", label: "Just researching", qualifies: false },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];

/** Step-1 "where are you today" question. */
export const STAGES = [
  { id: "independent", label: "Independent practice, open now", qualifies: true },
  { id: "multi", label: "Independent, more than one location", qualifies: true },
  { id: "franchise", label: "Franchise or chain location", qualifies: false },
  { id: "opening", label: "Opening soon, not seeing patients yet", qualifies: false },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

/**
 * Visit bands from the quiz (lib/landing/medspa-quiz-model.ts VISIT_BANDS ids).
 * All bands qualify for now: a busy solo injector can still be a good fit.
 * If small practices book calls and never buy, set v1 ("Under 100") to false
 * and they'll go to the nurture email instead of the calendar.
 */
export const VISIT_BAND_QUALIFIES: Record<string, boolean> = { v1: true, v2: true, v3: true, v4: true, v5: true };

export type QualifyInput = { role: string; stage: string; visitBand: string | null };
export type QualifyResult = { qualified: boolean; reasons: string[] };

/** The one rule. Runs on the server (the source of truth) and in the browser (for instant UI). */
export function qualify(i: QualifyInput): QualifyResult {
  const reasons: string[] = [];
  const role = ROLES.find((r) => r.id === i.role);
  const stage = STAGES.find((s) => s.id === i.stage);
  if (!role) reasons.push("role_missing");
  else if (!role.qualifies) reasons.push(`role_${role.id}`);
  if (!stage) reasons.push("stage_missing");
  else if (!stage.qualifies) reasons.push(`stage_${stage.id}`);
  if (i.visitBand && VISIT_BAND_QUALIFIES[i.visitBand] === false) reasons.push(`visits_${i.visitBand}`);
  return { qualified: reasons.length === 0, reasons };
}

/* ───────────── step-1 form options ───────────── */

export const BOOKING_SYSTEMS = ["Boulevard", "Vagaro", "Mangomint", "Zenoti", "AestheticsPro", "Square Appointments", "GlossGenius", "Other", "Paper or phone"] as const;

export const TREATMENT_OPTIONS = ["Neurotoxin", "Filler", "Facials / HydraFacial", "Microneedling", "Laser", "Body contouring", "IV / wellness", "Weight loss"] as const;

/* ───────────── the pre-call page ───────────── */

/**
 * The short video on /medspa/confirm/<token> ("Watch this before your call").
 * Record 2–3 minutes: who you are, what the call covers, what it costs (if
 * PRICE_BEFORE_CALL is set), and what to have ready. Paste a Vimeo/YouTube
 * embed URL here. While null, the page shows the written version instead.
 */
export const PRECALL_VIDEO: { embed: string | null; minutes: number } = { embed: null, minutes: 3 };

/**
 * Optional: say the price before the call. The ScaleClients-style funnel does
 * this so only people who can afford it show up. Leave null to keep
 * "quoted on your walkthrough" (current offer of record). Example:
 *   "One flat plan, month to month. Most practices start around $___/month."
 */
export const PRICE_BEFORE_CALL: string | null = null;

/** What to have ready, shown on the pre-call page and in the reminder emails. */
export const PRECALL_PREP = [
  "Your treatment menu, roughly: what you offer and how often patients should come back.",
  "Who runs your front desk and what booking software you use.",
  "Whether you sell memberships today, and how they're billed.",
];

/* ───────────── follow-up timing ───────────── */

export const REMINDERS = {
  /** First reminder, hours before the call. */
  earlyHours: 24,
  /** Second reminder, hours before the call. */
  lateHours: 2,
  /** Qualified but didn't pick a time: one "your times are still open" email after this many hours. */
  unbookedFollowUpHours: 3,
  /** After the call ends, wait this many minutes, then email Andrew the Showed / No-show / Paid links. */
  outcomeAfterMinutes: 30,
} as const;

/**
 * Value sent with Meta's Purchase event when Andrew marks a lead Paid without
 * typing an amount. Internal signal only, never shown to prospects.
 * Override per deal from the email link, or with env META_PURCHASE_VALUE.
 */
export const DEFAULT_PURCHASE_VALUE = Number(process.env.META_PURCHASE_VALUE ?? 500) || 500;

/** Where funnel links point (emails are opened outside the site). */
export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.atlas-engine.app").replace(/\/$/, "");

/* ───────────── CP-202: landing video, offer, A/B tests ───────────── */

/**
 * The landing-page video (hero, "video" variant). Record 60–120 s: who you
 * are, the leak (patients drift between treatments), what Atlas does, "see
 * your app in 60 seconds". Paste a Vimeo/YouTube embed URL. While null, a
 * branded placeholder shows in its place.
 */
export const LANDING_VSL: { embed: string | null; minutes: number; label: string } = {
  embed: null,
  minutes: 2,
  label: "Andrew, founder of Atlas, in 2 minutes",
};

/* ───────────── CP-204: the offer (area lock, founding spots, guarantees) ─────────────
 * Andrew approved the structure on Oct 8 2026. Change numbers here; every page,
 * the area check and the emails read from this block.
 * Rules: honor every guarantee exactly as written, and keep the conditions in the
 * client agreement too. Only promise what Atlas can measure.
 */

/** One med spa per area. A practice's area is this many miles around its zip (per-row override in medspa_territories). */
export const TERRITORY = { radiusMiles: 10 };

/**
 * Founding practices. The setup fee is real: non-founding practices pay setupFull.
 * Founding practices pay setupFounding in exchange for a filmed testimonial and a
 * case study after 90 days. Spots left = spots minus active founding territories.
 * Set active=false when the founding round closes; the page then shows setupFull.
 */
/**
 * CP-245 · the launch bonus on the app page: book the walkthrough within `hours` of first seeing
 * your app and these come free. KEEP IN SYNC with LAUNCH_BONUS in apps/medspa/lib/offer.ts
 * (the medspa app shows them; this side enforces the window at booking).
 */
export const LAUNCH_BONUS = { active: true, hours: 72, total: 2250 }; // CP-245.5: was 4. CP-264: total = the medspa app's bonus values summed (sync-tested)

/**
 * CP-246 · the call, sold as its own offer ("sell the call, not the product"). A preview owner
 * books the Launch Plan call, not "a 15-min walkthrough". `value` is what the session is worth
 * on its own (an hour of setup and strategy work); edit freely. The length is CALL_MINUTES in
 * lib/landing/availability.ts (the calendar). Every takeaway must be something Andrew really
 * hands over on the call, whether or not they sign up.
 * KEEP IN SYNC with LAUNCH_CALL in apps/medspa/lib/offer.ts.
 */
export const LAUNCH_CALL = {
  name: "Launch Plan call",
  value: 300,
  takeaways: [
    { t: "Your overdue-patient number", d: "How many of your patients are past due for toxin, filler and facials, and what bringing back 10 a month is worth to you." },
    { t: "Your first 3 automations, picked", d: "The recall, membership and slow-day offers to switch on first, chosen from your own menu." },
    { t: "Your launch plan, in writing", d: "Go-live date, what goes at your checkout and the price for your area, emailed after the call. Yours to keep." },
  ],
};

/**
 * CP-251/257 · team proof, as post cards near the bottom of the med spa pages (/medspa/app, /med-spas,
 * /p/<slug>), before the reviews: the owner video, why we started Atlas, how we build. Med spa only (no venue
 * clients). Never frame Atlas as built at the hackathon or in a weekend: Atlas came first; the hackathon was
 * a face-scan prototype we showed a real owner. Photos: founders-atlas.webp, founders-building.webp.
 * KEEP IN SYNC across apps/medspa/lib/offer.ts and apps/venues/lib/landing/medspa-funnel.ts (tests/funnel-sync.test.ts).
 */
export const TEAM_PROOF = {
  eyebrow: "Why we built Atlas",
  // CP-252: up to 3 across on a computer, stacked on a phone. A post shows `youtube` (a YouTube id, played in
  // place, youtube-nocookie) or `file` (a photo in this app's proof folder). To add an owner video: copy the
  // first post, change id / youtube / the words. Quote owners word for word, and only with their OK.
  posts: [
    {
      id: "mission",
      title: "You paid to get them in. Then their phone forgot you.",
      body: "Every patient you win with ads walks out into a phone full of other brands. Your spa isn't one of them. Atlas fixes that: your own app, your name on their home screen, pulling them back for the next visit.",
      meta: "Francisco Vera & Andrew Montano",
      youtube: null, file: "founders-atlas.webp", w: 1100, h: 872,
      alt: "Francisco Vera (left) and Andrew Montano, founders of Atlas Engine, in navy Atlas polos",
    },
    {
      id: "owner-video",
      title: "We put it in front of a real spa owner. Watch her reaction.",
      body: "First time she'd ever seen it. A Morro Bay spa owner, on camera, her exact words: “I would be very interested in incorporating that into my business.”",
      meta: "Morro Bay, CA · November 2026",
      youtube: "dCTa10nHVfE", file: null, w: 16, h: 9,
      alt: "A Morro Bay spa owner reacts to the app (video, 1:53)",
    },
    {
      id: "process",
      title: "Nothing ships until a real owner tries to break it.",
      body: "We build every part of Atlas ourselves, then hand it to real spa owners before you ever see it. In November, at Cal Poly's AI Hackathon, we sat a Morro Bay owner down and asked for her brutally honest take.",
      meta: "Cal Poly · November 2026",
      youtube: null, file: "founders-building.webp", w: 1100, h: 916,
      alt: "Two Atlas Engine founders working on a laptop at Cal Poly",
    },
  ],
};

/**
 * CP-258 · owner videos on /medspa/app, under the sliding review screenshots. Each entry is one owner
 * saying something on camera, played in place (YouTube id, youtube-nocookie). Add real ones here, word for
 * word in `quote`, only with the owner's OK. Until there are `slots` of them, placeholder cards fill the row
 * while `showSlots` is true; set it to false to hide the placeholders and show only real videos.
 */
export const OWNER_VIDEOS = {
  showSlots: true,
  slots: 3,
  videos: [] as Array<{ youtube: string; name: string; practice: string; city: string; quote: string }>,
};

/**
 * CP-268 · client results on /medspa/app, above "Why we built Atlas" (components/landing/results-showcase.tsx):
 * big numbers on the left, the owner's photo or video on the right, and a row of clinic tabs that rotate.
 * Real case studies only: every number comes from the clinic's own Atlas dashboard and goes up only with the
 * owner's written OK. Until there are `slots` of them, placeholder cards fill the rest while `showSlots` is
 * true (no names, no numbers); set it to false to show only real ones (the section hides when there are none).
 * To add one: copy the example below into `cases`. `photo` is a file in public/landing/results/,
 * `logo` likewise (optional; the clinic's name shows when there's no logo).
 *   { id: "spa-by-the-bay", clinic: "Spa by the Bay", logo: null, photo: "spa-by-the-bay.webp", youtube: null,
 *     headline: "See how Spa by the Bay used Atlas to …",
 *     stats: [{ value: "+38%", label: "Average patient spend" }, { value: "+$4.2K", label: "Monthly membership revenue" }],
 *     uses: ["memberships", "rewards"] }
 */
export type ResultUse = "memberships" | "rewards" | "recall" | "shop" | "push";
export const RESULTS = {
  showSlots: true,
  slots: 4,
  cases: [] as Array<{
    id: string; clinic: string; logo: string | null; photo: string | null; youtube: string | null;
    headline: string; stats: Array<{ value: string; label: string }>; uses: ResultUse[];
  }>,
};

export const FOUNDING = {
  active: true,
  spots: 10,
  setupFull: 1000,
  setupFounding: 500,
  trade: "a short filmed testimonial and a case study after 90 days",
};

export type Guarantee = { id: string; title: string; short: string; body: string; fine: string };
/** Strongest first. The first one leads the ad and the page. */
export const GUARANTEES: Guarantee[] = [
  // CP-264 · the 100-patient guarantee (Andrew, Nov 23 2026). Leads the /medspa/app showcase. Counted from
  // patient sign-ups in the dashboard; the 300-visit floor keeps it fair for very small practices.
  // KEEP IN SYNC with OFFER.guarantees[0] in apps/medspa/lib/offer.ts (tests/funnel-sync.test.ts).
  {
    id: "users100",
    title: "100 patients on your app in 90 days, or every dollar back.",
    short: "100 patients on your app in 90 days, or every dollar back",
    body: "If fewer than 100 of your patients have joined your app within 90 days of going live, we refund every dollar you've paid us.",
    fine: "Counted in your Atlas dashboard: patients who create an account in your app from your go-live date. Requires your checkout banner, table tents and QR code out from day one, your front desk offering the app at checkout, and at least 300 patient visits at your practice in those 90 days. The refund covers the setup and monthly fees you've paid Atlas.",
  },
  {
    id: "pays",
    title: "It pays for itself, or you stop paying.",
    short: "Pays for itself in 90 days, or you don't pay until it does",
    body: "If Atlas hasn't brought in more than you've paid us by day 90, you don't pay another dollar until it has. We keep working, free.",
    fine: "Counted from your Atlas dashboard: membership dues collected through your app, plus the price of repeat treatments your desk logs for patients enrolled in your app, compared with the setup and monthly fees you've paid us. Requires your checkout QR code to be out, staff logging treatments at the desk, and at least one membership offered in your app.",
  },
  {
    id: "live7",
    title: "Live in 7 days, or it's on us.",
    short: "Live in 7 days, or setup and month one are free",
    body: "If your app isn't live at your checkout within 7 days of your setup call, your setup is free and your first month is free.",
    fine: "The 7 days start once we have your logo, treatment menu and membership details from the setup call.",
  },
  {
    id: "leave",
    title: "Leave any month. Keep everything.",
    short: "Cancel any month and keep your banners, table tents and patient list",
    body: "No contract. Cancel any month and you keep the banners and table tents we made you, and your patient list is yours to export.",
    fine: "Cancel before your next billing date; you're billed through the end of the current month.",
  },
];

/* ───────────── CP-205: the 48-hour hold, the offer stack, booking window ─────────────
 * From the funnel review (Oct 8 2026): capture contact details the moment an area
 * is open ("hold it for 48 hours"), name and stack the offer, put the monthly price
 * next to the estimate once it's set, keep calls close, and build the app before the call.
 */

/**
 * The hold is real: while it lasts, other practices within the radius see the area
 * as held (they can join the waitlist). It ends after `hours`, when the lead turns out
 * not to qualify, or on a lost / no-show outcome. Booking extends it to the call + `afterCallHours`.
 */
export const HOLD = { hours: 48, afterCallHours: 48 };

/** The offer's name. Shown on the results screen, the landing page and the pre-call page. */
export const OFFER_NAME = "Founding Partner Program";

/**
 * What the setup fee covers, in the order it's stacked on the page. These are the
 * real deliverables (Andrew, Oct 8 2026: banners, table tents, the design for each,
 * QR scanners, software setup). The stack's total value is FOUNDING.setupFull.
 * Optional `value` (dollars) shows next to an item; leave it off unless it's a real price.
 */
export const SETUP_STACK: Array<{ title: string; detail: string; value?: number }> = [
  { title: "Your practice's own patient app", detail: "Your name, logo and colors, your treatment menu and providers. Built before your walkthrough." },
  { title: "Checkout banner, designed and printed", detail: "Large format, made for your front desk, with your QR code." },
  { title: "Table tents for every room", detail: "Designed to match, so patients join while they wait." },
  { title: "QR scanners at checkout", detail: "Your desk logs visits and treatments in one tap." },
  { title: "Software setup and staff training", detail: "Menu, memberships and reminder timing loaded with you. Your desk trained in 20 minutes." },
  { title: "Your area, locked", detail: "No other med spa within the radius can join Atlas while you're a client." },
];

/**
 * The monthly plan, in dollars. While null, pages say "quoted on your walkthrough"
 * and the results screen shows no return multiple. Set it (e.g. 299) and the estimate
 * shows "Atlas: $299/mo · about N× back".
 */
export const MONTHLY_PRICE: number | null = null;

/** The calendar only offers the first N days that have open times (closer calls, fewer no-shows). */
export const BOOKING_WINDOW_DAYS = 4;

/**
 * The quiz no longer asks how practices recall patients today (3 questions instead of 6).
 * The estimate assumes some manual recall already happens ("Front desk calls or texts").
 */
export const DEFAULT_RECALL_ID = "manual";

/** Unbooked follow-ups (email): hours after the hold starts, then `beforeEndHours` before it ends. Max 3. */
export const FOLLOWUPS = { firstHours: 3, secondHours: 24, beforeEndHours: 4 };

/* ───────────── CP-233: instant app preview (/medspa/app) ───────────── */

/**
 * contactRequired: the owner gives name, mobile and email on the progress screen
 * (while the app builds) before the preview opens. That submit is the Meta "Lead".
 * Set false to make the form skippable (more previews seen, fewer contacts).
 */
export const PREVIEW = { contactRequired: true };
