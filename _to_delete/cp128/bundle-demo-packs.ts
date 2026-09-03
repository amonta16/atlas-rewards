/**
 * demo-packs.ts — CP-113 (instant demo builder) · CP-128 (full niche set)
 *
 * The "few inputs" behind the one-tap demo. A rep picks a niche and
 * optionally a color theme; everything a full demo needs — 4 store rewards,
 * a prize-only wheel freebie, weighted spin wedges, a featured image offer,
 * and a 4-week streak roadmap (rewards at weeks 2–5) — comes from the pack
 * below. Content only: colors come from the logo (or a theme) and images are
 * resolved server-side from the image_library by `industry`. Edit copy and
 * point costs here without touching SQL.
 *
 * CP-128: expanded from 3 niches to 14, including a GENERIC fallback so no
 * business type ever blocks a demo at a door. Packs whose `industry` has no
 * image_library set (fitness / retail / general) build image-less but fully
 * branded — the RPC is null-safe on images by design (CP-113).
 */

import type { BrandColors } from "@/lib/logo-colors";

export type DemoNiche =
  | "food" | "cafe" | "pizza" | "dessert" | "bakery"
  | "smoke" | "dispensary"
  | "beauty" | "barber" | "nails" | "medspa"
  | "fitness" | "retail" | "general";

/** reward_type must be one of the rewards CHECK values. */
type RewardType = "discount" | "free_item" | "vip_perk" | "upgrade" | "custom";

export type DemoPack = {
  /** image_library.industry slug used to source hero/reward/offer photos.
   *  Slugs without a library set build image-less (null-safe in the RPC). */
  industry: string;
  /** businesses.industry stored on the app (same slug). */
  nicheLabel: string;
  /** 4 rewards shown in the store (is_active + show_in_store). */
  rewards: Array<{ name: string; point_cost: number; reward_type: RewardType; description: string }>;
  /** The free reward that lives ON the wheel (prize-only, not in the store). */
  spinFreeReward: { name: string; description: string; reward_type: RewardType };
  /** Points wedges on the wheel; weight = relative odds. */
  spinPoints: Array<{ label: string; points: number; weight: number }>;
  /** The featured, image-backed offer on Home. */
  offer: { title: string; description: string; expiresDays: number };
  /** 4-week roadmap. Milestones at weeks 2,3,4,5 — mix of points + rewards.
   *  `rewardRef` indexes into `rewards[]`; the RPC substitutes the real id. */
  streak: {
    periodType: "weekly";
    checkinsRequired: number;
    milestones: Array<{
      count: number;
      label: string;
      giftKind: "points" | "reward";
      points?: number;
      rewardRef?: number;   // index into rewards[]
      mystery?: boolean;    // also unlocks a wheel spin
    }>;
  };
};

/** Standard 4-week roadmap shape shared by every pack: reward at weeks 2 & 4,
 *  points at 3 & 5 (week 5 also unlocks a wheel spin). */
function roadmap(refA: number, refB: number, midPts: number, topPts: number): DemoPack["streak"] {
  return {
    periodType: "weekly",
    checkinsRequired: 1,
    milestones: [
      { count: 2, label: "2 weeks", giftKind: "reward", rewardRef: refA },
      { count: 3, label: "3 weeks", giftKind: "points", points: midPts },
      { count: 4, label: "4 weeks", giftKind: "reward", rewardRef: refB },
      { count: 5, label: "5 weeks", giftKind: "points", points: topPts, mystery: true },
    ],
  };
}

const SPIN_STD = [
  { label: "25 pts", points: 25, weight: 40 },
  { label: "75 pts", points: 75, weight: 25 },
  { label: "150 pts", points: 150, weight: 10 },
];

/* ── the packs ────────────────────────────────────────────────────────── */

export const DEMO_PACKS: Record<DemoNiche, DemoPack> = {
  food: {
    industry: "restaurant",
    nicheLabel: "Food & drink",
    rewards: [
      { name: "Free drink of choice", point_cost: 300, reward_type: "free_item", description: "Any regular-size drink on the house." },
      { name: "$5 off your order", point_cost: 500, reward_type: "discount", description: "Take $5 off any order over $15." },
      { name: "Free appetizer", point_cost: 800, reward_type: "free_item", description: "Pick any starter, on us." },
      { name: "VIP: skip-the-line + 15% off", point_cost: 1500, reward_type: "vip_perk", description: "Front-of-line pickup and 15% off, all month." },
    ],
    spinFreeReward: { name: "Free cookie", description: "A warm cookie, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "This week: Buy one, get one 50% off", description: "Show this at the counter — every visit this week.", expiresDays: 7 },
    streak: roadmap(0, 2, 150, 400),
  },

  cafe: {
    industry: "coffee-shop",
    nicheLabel: "Café & boba",
    rewards: [
      { name: "Free regular drink", point_cost: 300, reward_type: "free_item", description: "Any regular-size coffee, tea, or boba on us." },
      { name: "Free pastry of choice", point_cost: 500, reward_type: "free_item", description: "Pick anything from the pastry case." },
      { name: "Drink + pastry combo", point_cost: 900, reward_type: "free_item", description: "Your usual order, fully covered." },
      { name: "VIP: 15% off + skip the line", point_cost: 1500, reward_type: "vip_perk", description: "Members save 15% and order ahead, all month." },
    ],
    spinFreeReward: { name: "Free size upgrade", description: "Bump any drink to large, won on the wheel.", reward_type: "upgrade" },
    spinPoints: SPIN_STD,
    offer: { title: "Happy hour: 50% off drinks 2–4pm", description: "Every weekday this week — show this at the register.", expiresDays: 7 },
    streak: roadmap(0, 1, 150, 400),
  },

  pizza: {
    industry: "restaurant",
    nicheLabel: "Pizza & slices",
    rewards: [
      { name: "Free garlic knots", point_cost: 300, reward_type: "free_item", description: "An order of knots with any purchase." },
      { name: "Free slice", point_cost: 500, reward_type: "free_item", description: "Any slice in the case, on the house." },
      { name: "$10 off any large pizza", point_cost: 900, reward_type: "discount", description: "Take $10 off any large pie." },
      { name: "VIP: 15% off every order", point_cost: 1600, reward_type: "vip_perk", description: "Members-only 15% off, all month long." },
    ],
    spinFreeReward: { name: "Free fountain drink", description: "A cold one with your slice, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "This week: 2 large 1-topping pizzas $25", description: "Walk-in or call ahead — mention the app.", expiresDays: 7 },
    streak: roadmap(1, 2, 150, 400),
  },

  dessert: {
    industry: "ice-cream",
    nicheLabel: "Sweets & ice cream",
    rewards: [
      { name: "Free topping", point_cost: 250, reward_type: "free_item", description: "Add any topping, on us." },
      { name: "Free small cup or scoop", point_cost: 500, reward_type: "free_item", description: "Your favorite flavor, on the house." },
      { name: "Buy one, get one free", point_cost: 800, reward_type: "free_item", description: "Bring a friend — second one's free." },
      { name: "VIP: 15% off every visit", point_cost: 1500, reward_type: "vip_perk", description: "Members-only 15% off, all month." },
    ],
    spinFreeReward: { name: "Free waffle cone upgrade", description: "Upgrade to a waffle cone, won on the wheel.", reward_type: "upgrade" },
    spinPoints: [
      { label: "30 pts", points: 30, weight: 40 },
      { label: "100 pts", points: 100, weight: 22 },
      { label: "200 pts", points: 200, weight: 8 },
    ],
    offer: { title: "Double points weekend", description: "Every visit Fri–Sun earns 2× points — show this at the counter.", expiresDays: 7 },
    streak: roadmap(1, 2, 150, 400),
  },

  bakery: {
    industry: "coffee-shop",
    nicheLabel: "Bakery & donuts",
    rewards: [
      { name: "Free classic donut", point_cost: 250, reward_type: "free_item", description: "Any classic donut, on the house." },
      { name: "Free coffee with a dozen", point_cost: 500, reward_type: "free_item", description: "Grab a dozen, the coffee's on us." },
      { name: "$5 off a dozen", point_cost: 700, reward_type: "discount", description: "Take $5 off any full dozen." },
      { name: "VIP: first pick + 15% off", point_cost: 1400, reward_type: "vip_perk", description: "Fresh-batch priority and 15% off, all month." },
    ],
    spinFreeReward: { name: "Free donut holes", description: "A bag of holes, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "Early bird: 20% off before 9am", description: "Beat the rush this week — show this at the register.", expiresDays: 7 },
    streak: roadmap(0, 2, 150, 400),
  },

  smoke: {
    industry: "smoke-shop",
    nicheLabel: "Smoke & vape",
    rewards: [
      { name: "10% off any purchase", point_cost: 300, reward_type: "discount", description: "One-time 10% off your visit." },
      { name: "Free lighter or papers", point_cost: 500, reward_type: "free_item", description: "Grab a lighter or a pack of papers, free." },
      { name: "$10 off $50+", point_cost: 900, reward_type: "discount", description: "Spend $50, take $10 off." },
      { name: "VIP: 15% off every visit", point_cost: 1600, reward_type: "vip_perk", description: "Members-only 15% off, all month long." },
    ],
    spinFreeReward: { name: "Free grinder", description: "A house grinder, won on the wheel.", reward_type: "free_item" },
    spinPoints: [
      { label: "25 pts", points: 25, weight: 40 },
      { label: "75 pts", points: 75, weight: 25 },
      { label: "200 pts", points: 200, weight: 8 },
    ],
    offer: { title: "New drop: 20% off select brands", description: "This week only — ask staff which brands are in.", expiresDays: 7 },
    streak: roadmap(1, 0, 150, 400),
  },

  dispensary: {
    industry: "dispensary",
    nicheLabel: "Dispensary",
    rewards: [
      { name: "10% off any purchase", point_cost: 300, reward_type: "discount", description: "One-time 10% off your visit." },
      { name: "Free house accessory", point_cost: 500, reward_type: "free_item", description: "Pick a lighter, tray, or house accessory." },
      { name: "$10 off $60+", point_cost: 900, reward_type: "discount", description: "Spend $60, take $10 off." },
      { name: "VIP: 15% off every visit", point_cost: 1600, reward_type: "vip_perk", description: "Members-only 15% off, all month long." },
    ],
    spinFreeReward: { name: "Free grinder", description: "A house grinder, won on the wheel.", reward_type: "free_item" },
    spinPoints: [
      { label: "25 pts", points: 25, weight: 40 },
      { label: "75 pts", points: 75, weight: 25 },
      { label: "200 pts", points: 200, weight: 8 },
    ],
    offer: { title: "First-time members: 15% off", description: "Join the rewards app in-store and save today.", expiresDays: 14 },
    streak: roadmap(1, 0, 150, 400),
  },

  beauty: {
    industry: "beauty-salon",
    nicheLabel: "Beauty & salon",
    rewards: [
      { name: "Free brow or lip wax", point_cost: 400, reward_type: "free_item", description: "A quick brow or lip wax, on us." },
      { name: "$10 off any service", point_cost: 600, reward_type: "discount", description: "Take $10 off any service over $40." },
      { name: "Free add-on treatment", point_cost: 1000, reward_type: "free_item", description: "Add a mask or scalp treatment, free." },
      { name: "VIP: 15% off + priority booking", point_cost: 1800, reward_type: "vip_perk", description: "Members save 15% and book first, all month." },
    ],
    spinFreeReward: { name: "Free travel-size product", description: "A travel-size favorite, won on the wheel.", reward_type: "free_item" },
    spinPoints: [
      { label: "30 pts", points: 30, weight: 40 },
      { label: "100 pts", points: 100, weight: 22 },
      { label: "250 pts", points: 250, weight: 8 },
    ],
    offer: { title: "This month: 20% off your first service", description: "New members — show this at check-in.", expiresDays: 14 },
    streak: roadmap(0, 2, 200, 500),
  },

  barber: {
    industry: "beauty-salon",
    nicheLabel: "Barbershop",
    rewards: [
      { name: "Free beard line-up", point_cost: 400, reward_type: "free_item", description: "A clean line-up with any cut." },
      { name: "$5 off a cut", point_cost: 500, reward_type: "discount", description: "Take $5 off your next cut." },
      { name: "Free hot-towel shave add-on", point_cost: 900, reward_type: "free_item", description: "Add the hot-towel treatment, on us." },
      { name: "VIP: priority chair + 15% off", point_cost: 1600, reward_type: "vip_perk", description: "Skip the wait and save 15%, all month." },
    ],
    spinFreeReward: { name: "Free product sample", description: "A styling product sample, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "Midweek special: $5 off Tue–Thu", description: "Beat the weekend rush — show this in the chair.", expiresDays: 7 },
    streak: roadmap(1, 2, 150, 400),
  },

  nails: {
    industry: "beauty-salon",
    nicheLabel: "Nails & lashes",
    rewards: [
      { name: "Free nail art accent", point_cost: 400, reward_type: "free_item", description: "Add an accent nail design, on us." },
      { name: "$10 off a full set", point_cost: 700, reward_type: "discount", description: "Take $10 off any full set or fill." },
      { name: "Free hand treatment", point_cost: 900, reward_type: "free_item", description: "Add a paraffin or hand treatment, free." },
      { name: "VIP: 15% off + priority booking", point_cost: 1700, reward_type: "vip_perk", description: "Members save 15% and book first, all month." },
    ],
    spinFreeReward: { name: "Free gel upgrade", description: "Upgrade to gel polish, won on the wheel.", reward_type: "upgrade" },
    spinPoints: [
      { label: "30 pts", points: 30, weight: 40 },
      { label: "100 pts", points: 100, weight: 22 },
      { label: "250 pts", points: 250, weight: 8 },
    ],
    offer: { title: "Bring a friend: you both save 15%", description: "Book together this month and both save.", expiresDays: 14 },
    streak: roadmap(0, 2, 200, 500),
  },

  medspa: {
    industry: "medspa",
    nicheLabel: "Medspa",
    rewards: [
      { name: "Free LED add-on", point_cost: 500, reward_type: "free_item", description: "Add LED light therapy to any facial." },
      { name: "$25 off any facial", point_cost: 800, reward_type: "discount", description: "Take $25 off any facial treatment." },
      { name: "Free hydrating mask upgrade", point_cost: 1000, reward_type: "upgrade", description: "Upgrade any treatment with a hydrating mask." },
      { name: "VIP: member pricing, 15% off", point_cost: 2000, reward_type: "vip_perk", description: "Member pricing on every treatment, all month." },
    ],
    spinFreeReward: { name: "Free travel-size serum", description: "A take-home serum, won on the wheel.", reward_type: "free_item" },
    spinPoints: [
      { label: "30 pts", points: 30, weight: 40 },
      { label: "100 pts", points: 100, weight: 22 },
      { label: "250 pts", points: 250, weight: 8 },
    ],
    offer: { title: "New clients: 20% off your first treatment", description: "Join the rewards app at check-in and save today.", expiresDays: 14 },
    streak: roadmap(0, 2, 200, 500),
  },

  fitness: {
    industry: "fitness",
    nicheLabel: "Gym & fitness",
    rewards: [
      { name: "Free guest pass", point_cost: 300, reward_type: "free_item", description: "Bring a friend for a day, on us." },
      { name: "Free shake or smoothie", point_cost: 500, reward_type: "free_item", description: "Any shake at the front counter." },
      { name: "$20 off next month", point_cost: 1000, reward_type: "discount", description: "Take $20 off your next month's dues." },
      { name: "VIP: guest anytime + 15% off gear", point_cost: 1600, reward_type: "vip_perk", description: "Bring a guest whenever, plus 15% off merch." },
    ],
    spinFreeReward: { name: "Free water bottle", description: "House bottle, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "This week: $0 enrollment", description: "Join free this week — show this at the front desk.", expiresDays: 7 },
    streak: roadmap(1, 0, 150, 400),
  },

  retail: {
    industry: "retail",
    nicheLabel: "Retail & boutique",
    rewards: [
      { name: "10% off one item", point_cost: 300, reward_type: "discount", description: "One-time 10% off any single item." },
      { name: "Free house gift", point_cost: 450, reward_type: "free_item", description: "Pick a sticker pack, tote, or small gift." },
      { name: "$15 off $75+", point_cost: 900, reward_type: "discount", description: "Spend $75, take $15 off." },
      { name: "VIP: early access + 15% off", point_cost: 1600, reward_type: "vip_perk", description: "Shop new arrivals first and save 15%." },
    ],
    spinFreeReward: { name: "Mystery gift", description: "A surprise under-$10 gift, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "New arrivals: 20% off this weekend", description: "Fresh stock just landed — show this at checkout.", expiresDays: 7 },
    streak: roadmap(1, 0, 150, 400),
  },

  general: {
    industry: "general",
    nicheLabel: "Local business",
    rewards: [
      { name: "10% off your visit", point_cost: 300, reward_type: "discount", description: "One-time 10% off anything." },
      { name: "A little something free", point_cost: 500, reward_type: "free_item", description: "A house treat, on us — staff's pick." },
      { name: "$10 off $50+", point_cost: 900, reward_type: "discount", description: "Spend $50, take $10 off." },
      { name: "VIP: 15% off every visit", point_cost: 1600, reward_type: "vip_perk", description: "Members-only 15% off, all month long." },
    ],
    spinFreeReward: { name: "Free surprise gift", description: "A small house surprise, won on the wheel.", reward_type: "free_item" },
    spinPoints: SPIN_STD,
    offer: { title: "Members this week: 15% off", description: "Show the app at checkout — that's it.", expiresDays: 7 },
    streak: roadmap(1, 0, 150, 400),
  },
};

export const NICHE_ORDER: DemoNiche[] = [
  "food", "cafe", "pizza", "dessert", "bakery",
  "smoke", "dispensary",
  "beauty", "barber", "nails", "medspa",
  "fitness", "retail", "general",
];

export const NICHE_META: Record<DemoNiche, { label: string; emoji: string }> = {
  food:       { label: "Food & drink", emoji: "🍔" },
  cafe:       { label: "Café & boba", emoji: "☕" },
  pizza:      { label: "Pizza & slices", emoji: "🍕" },
  dessert:    { label: "Sweets & ice cream", emoji: "🍦" },
  bakery:     { label: "Bakery & donuts", emoji: "🍩" },
  smoke:      { label: "Smoke & vape", emoji: "💨" },
  dispensary: { label: "Dispensary", emoji: "🌿" },
  beauty:     { label: "Beauty & salon", emoji: "✨" },
  barber:     { label: "Barbershop", emoji: "💈" },
  nails:      { label: "Nails & lashes", emoji: "💅" },
  medspa:     { label: "Medspa", emoji: "🧖" },
  fitness:    { label: "Gym & fitness", emoji: "💪" },
  retail:     { label: "Retail & boutique", emoji: "🛍️" },
  general:    { label: "Any local shop", emoji: "🏪" },
};

/* ── color themes (optional override / no-logo fallback) ──────────────── */

export type ColorTheme = { id: string; label: string; colors: BrandColors };

export const COLOR_THEMES: ColorTheme[] = [
  { id: "from-logo", label: "From logo", colors: { primary: "#6366f1", secondary: "#4f46e5", accent: "#f59e0b" } }, // placeholder; replaced by extraction
  { id: "warm",  label: "Warm",  colors: { primary: "#e2571f", secondary: "#b8410f", accent: "#f4b333" } },
  { id: "cool",  label: "Cool",  colors: { primary: "#2b78d4", secondary: "#1f5aa8", accent: "#22b8a6" } },
  { id: "bold",  label: "Bold",  colors: { primary: "#7c3aed", secondary: "#5b21b6", accent: "#ec4899" } },
  { id: "fresh", label: "Fresh", colors: { primary: "#2fa84f", secondary: "#1f7a39", accent: "#f2b705" } },
  { id: "mono",  label: "Sleek", colors: { primary: "#334155", secondary: "#1e293b", accent: "#38bdf8" } },
];

export function getDemoPack(niche: DemoNiche): DemoPack {
  // CP-128: never throw at a door — an unknown value falls back to generic.
  return DEMO_PACKS[niche] ?? DEMO_PACKS.general;
}

/* ── batch helpers (CP-114) ───────────────────────────────────────────── */

/** Themes usable without a logo (excludes the "from-logo" placeholder). */
export const PRESET_THEMES: ColorTheme[] = COLOR_THEMES.filter((t) => t.id !== "from-logo");

/** Cycle through presets so an "Auto" batch isn't monochrome. */
export function themeForIndex(i: number): ColorTheme {
  return PRESET_THEMES[i % PRESET_THEMES.length];
}

/**
 * Best-effort map free text → a niche. Lets a batch line say "cafe" or
 * "vape" or "nail salon" instead of the exact keyword — and (CP-128) also
 * chews on Google Places types from the auto-fill route. Ordered from the
 * most specific niche to the broadest so "pizza restaurant" lands on pizza,
 * not food. Falls back to the caller's default when nothing matches.
 */
export function guessNiche(hint: string | null | undefined, fallback: DemoNiche = "food"): DemoNiche {
  const h = (hint || "").toLowerCase().replace(/_/g, " ");
  if (!h.trim()) return fallback;
  const has = (...w: string[]) => w.some((x) => h.includes(x));

  // specific food first, so they beat the broad "restaurant" match
  if (has("pizza", "pizzeria")) return "pizza";
  if (has("donut", "doughnut", "bakery", "bagel", "pastry", "bake shop")) return "bakery";
  if (has("ice cream", "gelato", "froyo", "frozen yogurt", "yogurt", "acai", "açaí", "juice", "smoothie", "dessert", "shave ice", "shaved ice", "candy")) return "dessert";
  if (has("coffee", "cafe", "café", "espresso", "boba", "bubble tea", "tea house", "teahouse", "matcha")) return "cafe";
  // beauty specifics before the broad salon match
  if (has("barber")) return "barber";
  if (has("nail", "lash", "manicure", "pedicure")) return "nails";
  if (has("medspa", "med spa", "medical spa", "aesthetic", "botox", "skincare", "skin care", "laser", "day spa", "spa")) return "medspa";
  // smoke-adjacent
  if (has("dispensary", "cannabis", "cbd", "weed")) return "dispensary";
  if (has("smoke", "vape", "vapor", "tobacco", "cigar", "hookah", "head shop")) return "smoke";
  // activity + retail
  if (has("gym", "fitness", "yoga", "pilates", "crossfit", "martial", "boxing", "jiu", "athletic club")) return "fitness";
  if (has("boutique", "clothing", "apparel", "shoe store", "sneaker", "jewelry", "thrift", "gift shop", "bookstore", "florist", "convenience", "liquor", "retail", "market")) return "retail";
  // broad buckets last
  if (has("beauty", "salon", "hair", "brow", "wax")) return "beauty";
  if (has("food", "restaurant", "diner", "grill", "taco", "burger", "sushi", "deli", "bar", "eatery", "kitchen", "bbq", "wing", "sandwich", "ramen", "pho", "meal", "chicken", "seafood", "steak")) return "food";
  return fallback;
}

/**
 * The jsonb payload the create_demo_business RPC consumes. Kept flat + generic
 * so the SQL never needs to know niche specifics.
 */
export function packPayload(pack: DemoPack) {
  return {
    industry: pack.industry,
    rewards: pack.rewards,
    spin_free_reward: pack.spinFreeReward,
    spin_points: pack.spinPoints,
    offer: pack.offer,
    streak: {
      period_type: pack.streak.periodType,
      checkins_required: pack.streak.checkinsRequired,
      milestones: pack.streak.milestones.map((m) => ({
        count: m.count,
        label: m.label,
        gift_kind: m.giftKind,
        points: m.points ?? null,
        reward_ref: m.rewardRef ?? null,
        mystery: m.mystery ?? false,
      })),
    },
  };
}
