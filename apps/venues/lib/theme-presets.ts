/**
 * theme-presets.ts — CP-65
 *
 * One-click theme presets for the app builder. Each preset is a complete,
 * hand-tuned "look" that sets EVERY design lever at once — brand colors,
 * header/background (incl. dark modes), background pattern + tint, card and
 * button shapes, offer-banner style, and the streak theme — so a demo app
 * goes from default to on-brand in one click, then any individual lever can
 * still be tweaked below.
 *
 * Presets only change the local editor state; nothing is saved until the
 * agency hits Save, so trying looks is free.
 *
 * Every id referenced here must exist in its home module:
 *   background_pattern → lib/patterns.ts PATTERN_OPTIONS
 *   card_style         → lib/design-styles.ts CARD_STYLES
 *   button_style       → lib/design-styles.ts BUTTON_STYLES
 *   banner_style       → lib/banner-styles.ts BANNER_OPTIONS
 *   streak_theme       → lib/streak-themes.ts STREAK_THEMES
 */

import type { BrandColors } from "@/lib/types/database";

export type ThemePreset = {
  id: string;
  label: string;
  emoji: string;
  blurb: string;
  /** Library-industry-ish hints shown as tiny chips ("great for …"). */
  greatFor: string[];
  brand_colors: BrandColors;
  header_color: string | null;
  surface_color: string | null;
  background_pattern: string | null;
  pattern_color: string | null;
  card_style: string | null;
  button_style: string | null;
  banner_style: string | null;
  streak_theme: string;
  /** CP-65.1: customer offer-card style (lib/offer-card-styles.ts). */
  offer_card_style: string | null;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "soft-spa", label: "Soft Spa", emoji: "🌿",
    blurb: "Sage + warm cream, pillowy cards — calm and premium.",
    greatFor: ["Medspa", "Salon", "Wellness"],
    brand_colors: { primary: "#5f7a6a", secondary: "#3e5348", accent: "#d4b896" },
    header_color: null, surface_color: "#f7f5f0",
    background_pattern: "silk", pattern_color: null,
    card_style: "soft", button_style: "pill",
    banner_style: "brand", streak_theme: "brand",
    offer_card_style: "tint",
  },
  {
    id: "blush-beauty", label: "Blush Beauty", emoji: "💅",
    blurb: "Pinks and petals — playful-polished for beauty brands.",
    greatFor: ["Beauty Salon", "Lashes", "Nails"],
    brand_colors: { primary: "#db2777", secondary: "#9d174d", accent: "#f9a8d4" },
    header_color: null, surface_color: "#fdf2f8",
    background_pattern: "bubbles", pattern_color: null,
    card_style: "soft", button_style: "pill",
    banner_style: "gradient", streak_theme: "pink",
    offer_card_style: "tint",
  },
  {
    id: "premium-noir", label: "Premium Noir", emoji: "🖤",
    blurb: "Black + gold dark mode — the top-shelf VIP look.",
    greatFor: ["Medspa", "Smoke Shop", "Fine dining"],
    brand_colors: { primary: "#a16207", secondary: "#78350f", accent: "#eab308" },
    header_color: "#0b0b0d", surface_color: "#131316",
    background_pattern: "orbs", pattern_color: "#a16207",
    card_style: "elevated", button_style: "square",
    banner_style: "gold", streak_theme: "gold",
    offer_card_style: "luxe",
  },
  {
    id: "ocean-clean", label: "Ocean Clean", emoji: "🌊",
    blurb: "Crisp blues on white — clean, trustworthy, modern.",
    greatFor: ["Dental", "Gym", "Tech"],
    brand_colors: { primary: "#0284c7", secondary: "#075985", accent: "#38bdf8" },
    header_color: null, surface_color: "#f0f9ff",
    background_pattern: "waves-layered", pattern_color: null,
    card_style: "rounded", button_style: "rounded",
    banner_style: "gradient", streak_theme: "blue",
    offer_card_style: "clean",
  },
  {
    id: "forest-fresh", label: "Forest Fresh", emoji: "🍃",
    blurb: "Deep greens + lime pop — natural with an edge.",
    greatFor: ["Dispensary", "Juice bar", "Outdoors"],
    brand_colors: { primary: "#16a34a", secondary: "#14532d", accent: "#84cc16" },
    header_color: null, surface_color: "#f4f8f2",
    background_pattern: "hills", pattern_color: null,
    card_style: "soft", button_style: "soft",
    banner_style: "brand", streak_theme: "neon",
    offer_card_style: "tint",
  },
  {
    id: "espresso", label: "Espresso House", emoji: "☕",
    blurb: "Roasted browns + caramel — cozy coffeehouse warmth.",
    greatFor: ["Coffee Shop", "Bakery", "Café"],
    brand_colors: { primary: "#92400e", secondary: "#451a03", accent: "#d97706" },
    header_color: null, surface_color: "#faf6f1",
    background_pattern: "swirls", pattern_color: null,
    card_style: "rounded", button_style: "soft",
    banner_style: "stripes", streak_theme: "coffee",
    offer_card_style: "tint",
  },
  {
    id: "neon-arcade", label: "Neon Arcade", emoji: "👾",
    blurb: "Glowing purple + cyan on near-black — full retro energy.",
    greatFor: ["Arcade", "Gaming", "Nightlife"],
    brand_colors: { primary: "#a855f7", secondary: "#6d28d9", accent: "#22d3ee" },
    header_color: "#0f0a1e", surface_color: "#120b24",
    background_pattern: "arcade", pattern_color: "#22d3ee",
    card_style: "sharp", button_style: "square",
    banner_style: "midnight", streak_theme: "neon",
    offer_card_style: "midnight",
  },
  {
    id: "sunny-scoop", label: "Sunny Scoop", emoji: "🍦",
    blurb: "Sherbet brights + confetti — pure playful fun.",
    greatFor: ["Ice Cream", "Dessert", "Kids"],
    brand_colors: { primary: "#db2777", secondary: "#7c3aed", accent: "#fbbf24" },
    header_color: null, surface_color: "#fffbf2",
    background_pattern: "confetti", pattern_color: null,
    card_style: "soft", button_style: "pill",
    banner_style: "confetti", streak_theme: "pink",
    offer_card_style: "pop",
  },
  {
    id: "minimal-mono", label: "Minimal Mono", emoji: "◻️",
    blurb: "Near-black on off-white, sharp corners — quiet luxury.",
    greatFor: ["Barber", "Boutique", "Studio"],
    brand_colors: { primary: "#18181b", secondary: "#3f3f46", accent: "#a1a1aa" },
    header_color: null, surface_color: "#fafafa",
    background_pattern: "none", pattern_color: null,
    card_style: "sharp", button_style: "square",
    banner_style: "brand", streak_theme: "gray",
    offer_card_style: "clean",
  },
  {
    id: "bold-appetite", label: "Bold Appetite", emoji: "🍕",
    blurb: "Hot red + amber, floating cards — makes food look loud.",
    greatFor: ["Restaurant", "Pizza", "BBQ"],
    brand_colors: { primary: "#dc2626", secondary: "#7f1d1d", accent: "#f59e0b" },
    header_color: null, surface_color: "#fff8f2",
    background_pattern: "restaurant", pattern_color: null,
    card_style: "elevated", button_style: "soft",
    banner_style: "stripes", streak_theme: "fire",
    offer_card_style: "pop",
  },
];

/** The Business fields a preset writes — handy for patch(). */
export function presetPatch(p: ThemePreset) {
  return {
    brand_colors: p.brand_colors,
    header_color: p.header_color,
    surface_color: p.surface_color,
    background_pattern: p.background_pattern,
    pattern_color: p.pattern_color,
    card_style: p.card_style,
    button_style: p.button_style,
    banner_style: p.banner_style,
    streak_theme: p.streak_theme,
    offer_card_style: p.offer_card_style,
  };
}
