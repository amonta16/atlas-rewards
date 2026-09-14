/**
 * section-layouts.ts — CP-66
 *
 * Structural layout presets for the two biggest customer-app sections.
 * Where offer_card_style / card_style pick the SKIN, these pick the SHAPE —
 * so a demo can go from a 2-col grid to a horizontal scroller in one click,
 * no rebuild.
 *
 *   rewards_layout — how the Rewards store renders:
 *     grid (default) | list | carousel | spotlight | kart
 *   offers_layout — how the Limited offers render:
 *     stack (default) | coupon | carousel | billboard
 *
 * NULL / unknown ids fall back to the defaults, so existing businesses are
 * pixel-identical until a layout is chosen.
 */

import type { CSSProperties } from "react";

export type RewardsLayoutId = "grid" | "list" | "carousel" | "spotlight" | "kart";
export type OffersLayoutId = "stack" | "coupon" | "carousel" | "billboard";

export const REWARDS_LAYOUTS: {
  id: RewardsLayoutId; label: string; emoji: string; hint: string;
}[] = [
  { id: "grid",      label: "Card grid",  emoji: "🔲", hint: "2-column reward cards (default)" },
  { id: "list",      label: "Compact list", emoji: "📋", hint: "Slim rows — minimal, scannable" },
  { id: "carousel",  label: "Carousel",   emoji: "🎠", hint: "Swipe sideways through rewards" },
  { id: "spotlight", label: "Spotlight",  emoji: "🌟", hint: "First reward big, the rest in a grid" },
  { id: "kart",      label: "Kart",       emoji: "🏁", hint: "One per row — tilted photo, racing style" },
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

/* ---------------------------------------------------------------------
 * CP-136 — "kart" rewards layout geometry.
 *
 * One reward per row: a skewed nameplate (name + cost + progress bar)
 * with the photo tile rotated the OTHER way and pushed over the plate's
 * right edge, so the pair reads as a racing-game reward row.
 *
 * The numbers live here — and only here — so the customer Rewards tab,
 * the Home top-rewards section and the builder preview can never drift
 * apart. Tile rotation is deliberately ~half the plate skew; matching
 * them makes the row read as broken rather than fast.
 * ------------------------------------------------------------------ */

/** Plate skew, in degrees. */
export const KART_TILT_DEG = 6;
/** Photo tile edge, in px (it is square). */
export const KART_TILE_PX = 116;

/** The skewed nameplate. Right padding clears the overlapping tile. */
export function kartPlateStyle(
  tiltDeg: number = KART_TILT_DEG,
  tilePx: number = KART_TILE_PX,
): CSSProperties {
  return { transform: `skewX(-${tiltDeg}deg)`, paddingRight: tilePx - 4 };
}

/** Un-skews the plate's contents so text stays upright. */
export function kartPlateInnerStyle(tiltDeg: number = KART_TILT_DEG): CSSProperties {
  return { transform: `skewX(${tiltDeg}deg)` };
}

/** The tilted photo tile, overlapping the plate. */
export function kartTileStyle(
  tiltDeg: number = KART_TILT_DEG,
  tilePx: number = KART_TILE_PX,
): CSSProperties {
  return {
    width: tilePx,
    transform: `rotate(-${(tiltDeg * 0.55).toFixed(2)}deg) translateX(6px)`,
  };
}

/** Grid track pair for one kart row: flexible plate + fixed tile column. */
export function kartRowStyle(tilePx: number = KART_TILE_PX): CSSProperties {
  return { gridTemplateColumns: `minmax(0,1fr) ${tilePx}px` };
}
