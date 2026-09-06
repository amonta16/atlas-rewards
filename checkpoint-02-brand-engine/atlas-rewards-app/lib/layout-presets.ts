/**
 * lib/layout-presets.ts — CP-131 · Per-niche layout presets
 *
 * One app, four layouts. A business carries `layout_preset`
 * (businesses.layout_preset) and everything structural reads from here:
 *   · which bottom-nav tabs exist and in what order (app-shell.tsx)
 *   · the order of the modules on Home (app/[business]/app/page.tsx)
 *   · which headings the shared tab pages use (/offers, /membership)
 *   · which preset a new app gets by default (demo build + New business)
 *
 * The research behind these (Sept 2026 teardown of ~30 loyalty apps) lives
 * in the "Atlas Niche Layouts" spec. The short version:
 *   · Home leads with the STORE (deal / new product / membership card),
 *     rewards are a short "redeem now" strip; the catalog lives on Rewards.
 *   · Streaks only make sense where visits are weekly or better (smoke, food).
 *   · Medspas and entertainment venues lead with a membership / pass.
 *
 * "custom" = the layout every existing app shipped with. Nothing changes
 * for a business until someone picks a preset in the builder.
 */

export type LayoutPreset = "custom" | "smoke" | "food" | "medspa" | "entertainment";

export const LAYOUT_PRESET_IDS: LayoutPreset[] = ["custom", "smoke", "food", "medspa", "entertainment"];

/** Bottom-nav tabs. Each maps to an existing route under /app. */
export type TabId = "home" | "scan" | "rewards" | "streaks" | "offers" | "book" | "membership" | "profile";

export type TabSpec = { id: TabId; label: string };

/** The blocks on Home, in the order the preset wants them. */
export type HomeModule =
  | "member_card"
  | "membership"
  | "specials"        // CP-132: "This week" weekly-deal strip
  | "events"          // CP-132: "Coming up" dated events
  | "featured_offer"
  | "top_rewards"
  | "spin_streak"
  | "raffle"
  | "winback"
  | "referral"
  | "news"
  | "location";

export type LayoutPresetSpec = {
  id: LayoutPreset;
  label: string;
  /** One line for the builder picker. */
  blurb: string;
  /** What the preset is tuned for — shown under the label. */
  fits: string;
  tabs: TabSpec[];
  home: HomeModule[];
  /** Heading over the "redeem now" strip on Home. */
  topRewardsHeading: string;
  /** Headings for the shared tab pages. */
  offersTitle: string;
  offersSubtitle: string;
  membershipTitle: string;
  /** Feature intent — used for copy and defaults, not hard gates. */
  streaks: boolean;
  spin: boolean;
};

const HOME_CUSTOM: HomeModule[] = [
  "member_card", "winback", "referral", "raffle", "featured_offer",
  "top_rewards", "spin_streak", "membership", "specials", "events", "news", "location",
];

export const LAYOUT_PRESETS: Record<LayoutPreset, LayoutPresetSpec> = {
  custom: {
    id: "custom",
    label: "Classic",
    blurb: "The original Atlas layout — every module, rewards first.",
    fits: "Any business · what existing apps use today",
    tabs: [
      { id: "home", label: "Home" },
      { id: "scan", label: "Check in" },
      { id: "rewards", label: "Rewards" },
      { id: "streaks", label: "Streaks" },
    ],
    home: HOME_CUSTOM,
    topRewardsHeading: "Top rewards",
    offersTitle: "Offers",
    offersSubtitle: "Deals and what's new.",
    membershipTitle: "Membership",
    streaks: true,
    spin: true,
  },

  smoke: {
    id: "smoke",
    label: "Smoke shop",
    blurb: "Today's deal on top, punch-card rewards, a weekly streak.",
    fits: "Smoke & vape shops, dispensaries · near-daily visits",
    tabs: [
      { id: "home", label: "Home" },
      { id: "offers", label: "Deals" },
      { id: "scan", label: "Check in" },
      { id: "rewards", label: "Rewards" },
      { id: "streaks", label: "Streak" },
    ],
    home: [
      "member_card", "featured_offer", "specials", "top_rewards", "spin_streak",
      "raffle", "winback", "referral", "events", "news", "location",
    ],
    topRewardsHeading: "Ready to claim",
    offersTitle: "Deals",
    offersSubtitle: "Today's deals and this week's specials.",
    membershipTitle: "Membership",
    streaks: true,
    spin: true,
  },

  food: {
    id: "food",
    label: "Food shop",
    blurb: "What's new this week, one offer to activate, quick rewards.",
    fits: "Cafés, boba, pizza, bakeries, smoothies · weekly visits",
    tabs: [
      { id: "home", label: "Home" },
      { id: "offers", label: "Offers" },
      { id: "scan", label: "Check in" },
      { id: "rewards", label: "Rewards" },
      { id: "streaks", label: "Streak" },
    ],
    home: [
      "member_card", "featured_offer", "specials", "top_rewards", "spin_streak",
      "raffle", "winback", "referral", "events", "news", "membership", "location",
    ],
    topRewardsHeading: "Redeem now",
    offersTitle: "Offers",
    offersSubtitle: "New this week and members-only deals.",
    membershipTitle: "Membership",
    streaks: true,
    spin: true,
  },

  medspa: {
    id: "medspa",
    label: "Medspa & aesthetics",
    blurb: "Membership card first, booking one tap away, no streaks.",
    fits: "Medspas, aesthetics, skin clinics · visits every 6–12 weeks",
    tabs: [
      { id: "home", label: "Home" },
      { id: "book", label: "Book" },
      { id: "membership", label: "Member" },
      { id: "rewards", label: "Rewards" },
      { id: "scan", label: "Check in" },
    ],
    home: [
      "membership", "member_card", "featured_offer", "events", "referral",
      "winback", "top_rewards", "news", "location",
    ],
    topRewardsHeading: "Your rewards",
    offersTitle: "Offers",
    offersSubtitle: "This month's treatment specials.",
    membershipTitle: "Membership",
    streaks: false,
    spin: false,
  },

  entertainment: {
    id: "entertainment",
    label: "Entertainment",
    blurb: "Pass card, this week's specials, events, book a party.",
    fits: "Bowling, arcades, trampoline parks, mini golf · monthly, in groups",
    tabs: [
      { id: "home", label: "Home" },
      { id: "offers", label: "Events" },
      { id: "scan", label: "Check in" },
      { id: "membership", label: "Pass" },
      { id: "rewards", label: "Rewards" },
    ],
    home: [
      "membership", "member_card", "specials", "events", "featured_offer",
      "news", "referral", "top_rewards", "winback", "location",
    ],
    topRewardsHeading: "Redeem now",
    offersTitle: "Events & specials",
    offersSubtitle: "This week's deals, events and league nights.",
    membershipTitle: "Pass",
    streaks: false,
    spin: false,
  },
};

/** Tolerant read — unknown / null values fall back to the classic layout. */
export function resolvePreset(value: string | null | undefined): LayoutPreset {
  return (LAYOUT_PRESET_IDS as string[]).includes(value ?? "") ? (value as LayoutPreset) : "custom";
}

export function presetSpec(value: string | null | undefined): LayoutPresetSpec {
  return LAYOUT_PRESETS[resolvePreset(value)];
}

/**
 * Default preset for an industry slug. Accepts both vocabularies in use:
 * the agency picker (INDUSTRY_PRESETS / industry-templates: medspa, arcade,
 * coffee, restaurant, …) and the demo-pack image-library slugs (smoke-shop,
 * dispensary, coffee-shop, ice-cream, …). Anything else → classic.
 */
export function presetForIndustry(industry: string | null | undefined): LayoutPreset {
  const s = (industry ?? "").toLowerCase().trim();
  if (!s) return "custom";
  if (/smoke|vape|dispens|tobacco|cannabis|hookah/.test(s)) return "smoke";
  if (/medspa|med-spa|aesthetic|skin|laser|botox|derm/.test(s)) return "medspa";
  if (/arcade|entertain|bowl|trampoline|golf|escape|karting|kart|cinema|theater|theatre|amusement|fec/.test(s)) return "entertainment";
  if (/restaurant|cafe|café|coffee|boba|tea|pizza|bakery|donut|dessert|ice-cream|icecream|yogurt|smoothie|juice|food|taco|burger|deli|sandwich|bar|grill/.test(s)) return "food";
  return "custom";
}

/**
 * Default preset for a demo niche (lib/demo-packs.ts DemoNiche). Beauty,
 * fitness, retail and general get the classic layout on purpose — those
 * niches aren't part of the four we tailor for yet.
 */
export function presetForNiche(niche: string): LayoutPreset {
  switch (niche) {
    case "food": case "cafe": case "pizza": case "dessert": case "bakery":
      return "food";
    case "smoke": case "dispensary":
      return "smoke";
    case "medspa":
      return "medspa";
    default:
      return "custom";
  }
}
