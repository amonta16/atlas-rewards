/**
 * demo-packs.ts — CP-113 (instant demo builder)
 *
 * The "few inputs" behind the one-tap demo. A rep picks a niche (food / smoke
 * / beauty) and optionally a color theme; everything a full demo needs —
 * 4 store rewards, a prize-only wheel freebie, weighted spin wedges, a
 * featured image offer, and a 4-week streak roadmap (rewards at weeks 2–5) —
 * comes from the pack below. Content only: colors come from the logo (or a
 * theme) and images are resolved server-side from the image_library by
 * `industry`. Edit copy/point-costs here without touching SQL.
 */

import type { BrandColors } from "@/lib/logo-colors";

export type DemoNiche = "food" | "smoke" | "beauty";

/** reward_type must be one of the rewards CHECK values. */
type RewardType = "discount" | "free_item" | "vip_perk" | "upgrade" | "custom";

export type DemoPack = {
  /** image_library.industry slug used to source hero/reward/offer photos. */
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
    spinPoints: [
      { label: "25 pts", points: 25, weight: 40 },
      { label: "75 pts", points: 75, weight: 25 },
      { label: "150 pts", points: 150, weight: 10 },
    ],
    offer: { title: "This week: Buy one, get one 50% off", description: "Show this at the counter — every visit this week.", expiresDays: 7 },
    streak: {
      periodType: "weekly",
      checkinsRequired: 1,
      milestones: [
        { count: 2, label: "2 weeks", giftKind: "reward", rewardRef: 0 },       // free drink
        { count: 3, label: "3 weeks", giftKind: "points", points: 150 },
        { count: 4, label: "4 weeks", giftKind: "reward", rewardRef: 2 },       // free appetizer
        { count: 5, label: "5 weeks", giftKind: "points", points: 400, mystery: true },
      ],
    },
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
    streak: {
      periodType: "weekly",
      checkinsRequired: 1,
      milestones: [
        { count: 2, label: "2 weeks", giftKind: "reward", rewardRef: 1 },       // free lighter/papers
        { count: 3, label: "3 weeks", giftKind: "points", points: 150 },
        { count: 4, label: "4 weeks", giftKind: "reward", rewardRef: 0 },       // 10% off
        { count: 5, label: "5 weeks", giftKind: "points", points: 400, mystery: true },
      ],
    },
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
    streak: {
      periodType: "weekly",
      checkinsRequired: 1,
      milestones: [
        { count: 2, label: "2 weeks", giftKind: "reward", rewardRef: 0 },       // free brow/lip wax
        { count: 3, label: "3 weeks", giftKind: "points", points: 200 },
        { count: 4, label: "4 weeks", giftKind: "reward", rewardRef: 2 },       // free add-on
        { count: 5, label: "5 weeks", giftKind: "points", points: 500, mystery: true },
      ],
    },
  },
};

export const NICHE_ORDER: DemoNiche[] = ["food", "smoke", "beauty"];

export const NICHE_META: Record<DemoNiche, { label: string; emoji: string }> = {
  food:   { label: "Food & drink", emoji: "🍔" },
  smoke:  { label: "Smoke & vape", emoji: "💨" },
  beauty: { label: "Beauty & salon", emoji: "💅" },
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
  return DEMO_PACKS[niche];
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
 * "vape" or "nail salon" instead of the exact keyword. Falls back to the
 * caller's default when nothing matches.
 */
export function guessNiche(hint: string | null | undefined, fallback: DemoNiche = "food"): DemoNiche {
  const h = (hint || "").toLowerCase();
  if (!h.trim()) return fallback;
  const has = (...w: string[]) => w.some((x) => h.includes(x));
  if (has("smoke", "vape", "vapor", "tobacco", "cigar", "hookah", "dispensary", "cannabis", "cbd", "head shop")) return "smoke";
  if (has("beauty", "salon", "spa", "nail", "hair", "lash", "brow", "wax", "barber", "med spa", "medspa", "aesthetic")) return "beauty";
  if (has("food", "restaurant", "cafe", "coffee", "diner", "grill", "pizza", "taco", "bakery", "juice", "smoothie", "deli", "bar", "eatery", "kitchen", "bbq", "sushi", "ice cream")) return "food";
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
