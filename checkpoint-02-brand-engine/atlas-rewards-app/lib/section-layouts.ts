/**
 * section-layouts.ts — CP-66
 *
 * Structural layout presets for the two biggest customer-app sections.
 * Where offer_card_style / card_style pick the SKIN, these pick the SHAPE —
 * so a demo can go from a 2-col grid to a horizontal scroller in one click,
 * no rebuild.
 *
 *   rewards_layout — how the Rewards store renders:
 *     grid (default) | list | carousel | spotlight
 *   offers_layout — how the Limited offers render:
 *     stack (default) | coupon | carousel | billboard
 *
 * NULL / unknown ids fall back to the defaults, so existing businesses are
 * pixel-identical until a layout is chosen.
 */

export type RewardsLayoutId = "grid" | "list" | "carousel" | "spotlight";
export type OffersLayoutId = "stack" | "coupon" | "carousel" | "billboard";

export const REWARDS_LAYOUTS: {
  id: RewardsLayoutId; label: string; emoji: string; hint: string;
}[] = [
  { id: "grid",      label: "Card grid",  emoji: "🔲", hint: "2-column reward cards (default)" },
  { id: "list",      label: "Compact list", emoji: "📋", hint: "Slim rows — minimal, scannable" },
  { id: "carousel",  label: "Carousel",   emoji: "🎠", hint: "Swipe sideways through rewards" },
  { id: "spotlight", label: "Spotlight",  emoji: "🌟", hint: "First reward big, the rest in a grid" },
];

export const OFFERS_LAYOUTS: {
  id: OffersLayoutId; label: string; emoji: string; hint: string;
}[] = [
  { id: "stack",     label: "Stacked rows", emoji: "🥞", hint: "Image-left rows (default)" },
  { id: "coupon",    label: "Coupon",       emoji: "🎟️", hint: "Ticket-style cards with a tear line" },
  { id: "carousel",  label: "Carousel",     emoji: "🎠", hint: "Swipe sideways through offers" },
  { id: "billboard", label: "Billboard",    emoji: "🖼️", hint: "Big image-first promo cards" },
];

export function rewardsLayout(id: string | null | undefined): RewardsLayoutId {
  return (REWARDS_LAYOUTS.find((l) => l.id === id)?.id ?? "grid") as RewardsLayoutId;
}

export function offersLayout(id: string | null | undefined): OffersLayoutId {
  return (OFFERS_LAYOUTS.find((l) => l.id === id)?.id ?? "stack") as OffersLayoutId;
}

/* CP-99: two more shaped sections.
 *   home_rewards_layout — the Home "Top rewards" section reuses
 *     REWARDS_LAYOUTS (grid/list/carousel/spotlight) via rewardsLayout().
 *   saved_gifts_layout — the Rewards-tab "Your saved gifts" section:
 *     stack (default, gradient rows) | grid | carousel. */

export type SavedGiftsLayoutId = "stack" | "grid" | "carousel";

export const SAVED_GIFTS_LAYOUTS: {
  id: SavedGiftsLayoutId; label: string; emoji: string; hint: string;
}[] = [
  { id: "stack",    label: "Stacked rows", emoji: "🥞", hint: "Full-width gradient rows (default)" },
  { id: "grid",     label: "Card grid",    emoji: "🔲", hint: "2-column gift cards, image on top" },
  { id: "carousel", label: "Carousel",     emoji: "🎠", hint: "Swipe sideways through gifts" },
];

export function savedGiftsLayout(id: string | null | undefined): SavedGiftsLayoutId {
  return (SAVED_GIFTS_LAYOUTS.find((l) => l.id === id)?.id ?? "stack") as SavedGiftsLayoutId;
}
