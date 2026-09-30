/**
 * Live app demo data — CP-176.
 *
 * The tap-through phone on the landing page runs on a snapshot of the REAL
 * Flippo's Arcade & Batting Cage app (Morro Bay): same brand colors, same
 * point rules (+50 a visit), same rewards + photos, same bookable cages,
 * pool tables and party packages, same hours. Pulled from Supabase on
 * 2026-09-30. Nothing here talks to the database at runtime — every tap is
 * simulated in the browser, so a visitor can never write real data.
 *
 * To refresh: re-run the SELECTs in checkpoint-176-live-site/README.md and
 * paste the rows over the arrays below.
 */

const S = "https://gqmjpntzupnmjooszvcd.supabase.co/storage/v1/object/public";

export type LiveBrand = {
  name: string;
  /** Logo shown in the app header. null → a monogram chip in brand color. */
  logoUrl: string | null;
  primary: string;
  secondary: string;
  accent: string;
  /** Photo behind the Home greeting. */
  heroUrl: string | null;
};

export type LiveReward = { id: string; name: string; cost: number; img: string | null };
export type LiveResource = { id: string; name: string; note?: string; img: string | null; minutes: number };
export type LiveCategory = { id: string; label: string; unit: string; resources: LiveResource[] };
export type LivePackage = { id: string; name: string; blurb: string; includes: string[] };

export const FLIPPOS_BRAND: LiveBrand = {
  name: "Flippo's Arcade & Batting Cage",
  logoUrl: `${S}/business-logos/ffcd5f3e-5518-437d-bda8-bb2887dc4348/1781343239205.png`,
  primary: "#0284c7",
  secondary: "#5cc6ff",
  accent: "#015589",
  heroUrl: `${S}/business-heroes/ffcd5f3e-5518-437d-bda8-bb2887dc4348/1789417474852.png`,
};

/** Real point rules (point_rules on the business row). */
export const POINTS = { visit: 50, review: 1000, referral: 100, birthday: 250 };

/** Starting balance for the demo guest — enough for the first reward. */
export const START_POINTS = 910;

const R = `${S}/reward-images/ffcd5f3e-5518-437d-bda8-bb2887dc4348`;
export const FLIPPOS_REWARDS: LiveReward[] = [
  { id: "cage20", name: "Free Batting Cage · 20 min", cost: 500, img: `${R}/1789279506356.png` },
  { id: "toy15", name: "15 token toy", cost: 750, img: `${R}/1790630103354.webp` },
  { id: "arc10", name: "Free $10 Arcade Credits", cost: 800, img: `${R}/1789412654884.JPG` },
  { id: "pinball", name: "Game of Pinball", cost: 1000, img: `${R}/1790497310572.png` },
  { id: "toy100", name: "100 token toy", cost: 1500, img: `${R}/1790630118239.webp` },
  { id: "crazy", name: "Crazy toy turn", cost: 2500, img: `${R}/1790497415416.png` },
  { id: "arc20", name: "Free $20 Credits", cost: 3500, img: `${R}/1785010617975.png` },
  { id: "snack", name: "Free Pretzel, Hot Dog or Nachos", cost: 7500, img: `${R}/1790382985529.png` },
  { id: "sundae", name: "Waffle sundae", cost: 8000, img: `${R}/1790383260720.png` },
  { id: "pizza", name: "Free 14\" Pizza", cost: 19500, img: `${R}/1790382699149.png` },
];

const B = `${S}/news-images/ffcd5f3e-5518-437d-bda8-bb2887dc4348/booking`;
export const FLIPPOS_BOOKING: LiveCategory[] = [
  {
    id: "cages",
    label: "Cages",
    unit: "cage",
    resources: [
      { id: "c1", name: "Cage #1 · Softball", note: "33 MPH", img: `${B}/1790411027817.png`, minutes: 60 },
      { id: "c2", name: "Cage #2", img: `${B}/1790410863598.png`, minutes: 60 },
      { id: "c3", name: "Cage #3", img: `${B}/1790410909805.png`, minutes: 60 },
      { id: "c4", name: "Cage #4 · HitTrax", img: `${B}/1790411656413.png`, minutes: 60 },
    ],
  },
  {
    id: "pool",
    label: "Pool",
    unit: "table",
    resources: [
      { id: "p1", name: "Pool Table #1", img: `${B}/1790395622575.png`, minutes: 60 },
      { id: "p2", name: "Pool Table #2", img: `${B}/1790395642986.png`, minutes: 60 },
    ],
  },
  {
    id: "party",
    label: "Parties",
    unit: "party",
    resources: [{ id: "party", name: "Birthday party", note: "Up to 8 guests · 2 hrs", img: `${B}/1790396092385.png`, minutes: 120 }],
  },
];

export const FLIPPOS_PACKAGES: LivePackage[] = [
  {
    id: "grand-slam",
    name: "Grand Slam",
    blurb: "2 cages + 2 large pizzas + drinks",
    includes: ["2 hours of party time", "Private room & pool table", "14\" pizza + 1 drink per guest", "10% off Flippo's Cafe"],
  },
  {
    id: "level-up",
    name: "Level Up",
    blurb: "Grand Slam + 200 arcade credits per guest",
    includes: ["Everything in Grand Slam", "200 arcade credits per guest"],
  },
];

/** Real booking hours (1 = Monday … 7 = Sunday). */
export const FLIPPOS_HOURS: Record<number, [number, number]> = {
  1: [10, 20], 2: [10, 20], 3: [10, 20], 4: [10, 20], 5: [11, 21], 6: [11, 21], 7: [11, 19],
};

/** Real membership tiers. */
export const FLIPPOS_TIERS = [
  { name: "Bronze", min: 0, perks: ["Points on every visit"] },
  { name: "Silver", min: 500, perks: ["Birthday gift"] },
  { name: "Gold", min: 1500, perks: ["Birthday gift", "10% off"] },
  { name: "VIP", min: 5000, perks: ["Birthday gift", "10% off", "Free upgrade"] },
];

/** The offer running on the live app / used across the site. */
export const FLIPPOS_OFFER = { title: "Happy Hour Tuesday", sub: "10% off cages", daysLeft: 3 };

/* ── Image library (Pexels, stored in our own Supabase bucket) ───────── */
const L = `${S}/image-library/arcade`;
export const LIB = {
  arcadeNeon: `${L}/hero/pexels-18425164.jpg`,
  arcadeRow: `${L}/hero/pexels-18425165.jpg`,
  arcadeRow2: `${L}/hero/pexels-18848584.jpg`,
  gameRoom: `${L}/hero/pexels-7858743.jpg`,
  gameRoom2: `${L}/hero/pexels-9072216.jpg`,
  bowling: `${L}/hero/pexels-9821841.jpg`,
  bowling2: `${L}/hero/pexels-5952996.jpg`,
  friends: `${L}/offer/pexels-7915382.jpg`,
  friends2: `${L}/offer/pexels-7915574.jpg`,
  party: `${L}/offer/pexels-7155966.jpg`,
  party2: `${L}/offer/pexels-7099954.jpg`,
  vr: `${L}/offer/pexels-7887140.jpg`,
  racing: `${L}/offer/pexels-5767684.jpg`,
  pizza: `${L}/offer/pexels-5903316.jpg`,
  claw: `${L}/reward/pexels-32222691.jpg`,
  airHockey: `${L}/reward/pexels-9821659.jpg`,
  pinball: `${L}/reward/pexels-17366876.jpg`,
};

/* ── "Build your app" presets for the booking flow ────────────────────── */
export type VenueTypeId = "arcade" | "cages" | "bowling" | "karts" | "golf" | "trampoline";

export const VENUE_TYPES: Array<{ id: VenueTypeId; label: string; hero: string; categories: LiveCategory[] }> = [
  {
    id: "arcade",
    label: "Arcade / FEC",
    hero: LIB.arcadeNeon,
    categories: [
      { id: "party", label: "Parties", unit: "party", resources: [{ id: "a1", name: "Party room", note: "Up to 12 guests", img: LIB.party, minutes: 120 }, { id: "a2", name: "VIP party room", note: "Up to 20 guests", img: LIB.party2, minutes: 120 }] },
      { id: "vr", label: "VR", unit: "bay", resources: [{ id: "a3", name: "VR bay #1", img: LIB.vr, minutes: 30 }, { id: "a4", name: "Racing sims", img: LIB.racing, minutes: 30 }] },
    ],
  },
  { id: "cages", label: "Batting cages", hero: FLIPPOS_BRAND.heroUrl!, categories: FLIPPOS_BOOKING },
  {
    id: "bowling",
    label: "Bowling",
    hero: LIB.bowling,
    categories: [
      { id: "lanes", label: "Lanes", unit: "lane", resources: [{ id: "b1", name: "Lane 1–2", note: "Up to 6 per lane", img: LIB.bowling, minutes: 60 }, { id: "b2", name: "Lane 3–4", img: LIB.bowling2, minutes: 60 }] },
      { id: "party", label: "Parties", unit: "party", resources: [{ id: "b3", name: "Glow bowl party", img: LIB.party, minutes: 120 }] },
    ],
  },
  {
    id: "karts",
    label: "Go-karts",
    hero: LIB.racing,
    categories: [
      { id: "heats", label: "Races", unit: "heat", resources: [{ id: "k1", name: "Grand Prix heat", note: "10 laps", img: null, minutes: 15 }, { id: "k2", name: "Junior heat", note: "Ages 8+", img: null, minutes: 15 }] },
      { id: "party", label: "Parties", unit: "party", resources: [{ id: "k3", name: "Pit-crew party", img: LIB.party, minutes: 120 }] },
    ],
  },
  {
    id: "golf",
    label: "Golf sims",
    hero: LIB.gameRoom,
    categories: [
      { id: "bays", label: "Bays", unit: "bay", resources: [{ id: "g1", name: "Bay 1", note: "Up to 4 players", img: null, minutes: 60 }, { id: "g2", name: "Bay 2", note: "Up to 4 players", img: null, minutes: 60 }] },
      { id: "lessons", label: "Lessons", unit: "lesson", resources: [{ id: "g3", name: "30-min lesson", img: null, minutes: 30 }] },
    ],
  },
  {
    id: "trampoline",
    label: "Trampoline park",
    hero: LIB.friends,
    categories: [
      { id: "jump", label: "Jump time", unit: "session", resources: [{ id: "t1", name: "Open jump", note: "60 min", img: null, minutes: 60 }, { id: "t2", name: "Toddler time", img: null, minutes: 60 }] },
      { id: "party", label: "Parties", unit: "party", resources: [{ id: "t3", name: "Birthday party", img: LIB.party2, minutes: 120 }] },
    ],
  },
];

/** Swatches offered in the booking "build your app" step. */
export const BRAND_SWATCHES = ["#0284c7", "#16a34a", "#e11d48", "#7c3aed", "#ea580c", "#0f172a", "#db2777", "#ca8a04"];
