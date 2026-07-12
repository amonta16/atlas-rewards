/**
 * design-styles.ts — CP-58
 *
 * Two more "click-to-design" levers for the app builder, on top of the
 * colors / patterns / banner styles that already exist:
 *
 *   • Card style  — how every reward / stat / offer card looks: corner
 *                   roundness, shadow depth, and (for "outlined") a brand ring
 *                   instead of a drop shadow.
 *   • Button style — the shape of every CTA button in the customer app.
 *
 * Both are applied purely through CSS variables, so nothing has to be
 * re-written component-by-component. The variables are consumed by:
 *   - globals.css   → scoped `.atlas-surface` rules remap the rounded and
 *                     shadow utilities the cards already use onto these vars.
 *   - ui/button.tsx → its base radius reads `--atlas-btn-radius`.
 *
 * When the agency hasn't picked a style, we fall back to the presets whose
 * values equal Tailwind's stock rounded-2xl / rounded-xl / shadow-sm, so an
 * un-customized business looks pixel-identical to before CP-58.
 *
 * The outlined preset's ring uses `hsl(var(--brand-primary) / …)`, which
 * resolves because the per-business theme sets --brand-primary on :root (real
 * app) or the preview wrapper (brand editor).
 */

import { ctaGlowShadow } from "@/lib/element-styles";

export type CardStyleId = "rounded" | "soft" | "sharp" | "elevated" | "outlined";
export type ButtonStyleId = "rounded" | "pill" | "soft" | "square";

type CardVars = {
  "--card-radius-lg": string; // maps rounded-2xl (stock 1rem)
  "--card-radius-md": string; // maps rounded-xl  (stock 0.75rem)
  "--card-radius-xl": string; // maps rounded-3xl (stock 1.5rem)
  "--card-shadow": string;    // maps shadow-sm   (stock 0 1px 2px 0 rgb(0 0 0/.05))
};

export const CARD_STYLES: {
  id: CardStyleId; label: string; emoji: string; hint: string; vars: CardVars;
}[] = [
  {
    id: "rounded", label: "Rounded", emoji: "▢", hint: "The classic Atlas look (default)",
    vars: {
      "--card-radius-lg": "1rem",
      "--card-radius-md": "0.75rem",
      "--card-radius-xl": "1.5rem",
      "--card-shadow": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    },
  },
  {
    id: "soft", label: "Soft & pillowy", emoji: "🫧", hint: "Big rounded corners, gentle glow",
    vars: {
      "--card-radius-lg": "1.5rem",
      "--card-radius-md": "1.15rem",
      "--card-radius-xl": "1.85rem",
      "--card-shadow": "0 6px 20px -6px rgb(0 0 0 / 0.10)",
    },
  },
  {
    id: "sharp", label: "Sharp & modern", emoji: "▨", hint: "Crisp corners, flat — minimal vibe",
    vars: {
      "--card-radius-lg": "0.35rem",
      "--card-radius-md": "0.3rem",
      "--card-radius-xl": "0.4rem",
      "--card-shadow": "0 1px 0 0 rgb(0 0 0 / 0.06)",
    },
  },
  {
    id: "elevated", label: "Elevated", emoji: "🃏", hint: "Cards float off the page",
    vars: {
      "--card-radius-lg": "1rem",
      "--card-radius-md": "0.8rem",
      "--card-radius-xl": "1.35rem",
      "--card-shadow": "0 12px 28px -8px rgb(0 0 0 / 0.16), 0 4px 10px -6px rgb(0 0 0 / 0.10)",
    },
  },
  {
    id: "outlined", label: "Outlined", emoji: "⬚", hint: "Brand-colored ring, no drop shadow",
    vars: {
      "--card-radius-lg": "1rem",
      "--card-radius-md": "0.8rem",
      "--card-radius-xl": "1.35rem",
      "--card-shadow": "0 0 0 1.5px hsl(var(--brand-primary) / 0.32)",
    },
  },
];

export const BUTTON_STYLES: {
  id: ButtonStyleId; label: string; emoji: string; hint: string; radius: string;
}[] = [
  { id: "rounded", label: "Rounded", emoji: "▢", hint: "Softly rounded corners (default)", radius: "0.5rem" },
  { id: "pill",    label: "Pill",    emoji: "💊", hint: "Fully round ends",                 radius: "9999px" },
  { id: "soft",    label: "Chunky",  emoji: "🟦", hint: "Extra-round, friendly",           radius: "0.95rem" },
  { id: "square",  label: "Square",  emoji: "⬛", hint: "Barely-there corners, technical",  radius: "0.15rem" },
];

const DEFAULT_CARD: CardStyleId = "rounded";
const DEFAULT_BUTTON: ButtonStyleId = "rounded";

/**
 * CSS variables to spread onto a surface wrapper (the customer app shell or
 * the brand-editor preview root). Unknown / null ids fall back to the default
 * presets, which equal the stock look — so nothing changes until a style is
 * explicitly chosen.
 */
export function designVars(
  cardStyle?: string | null,
  buttonStyle?: string | null,
  /** CP-67: businesses.cta_glow (none/soft/bold) — brand glow behind CTAs. */
  ctaGlow?: string | null,
  /** CP-67: brand primary hex, needed to tint the CTA glow. */
  primary?: string | null,
): React.CSSProperties {
  const card =
    CARD_STYLES.find(c => c.id === cardStyle) ??
    CARD_STYLES.find(c => c.id === DEFAULT_CARD)!;
  const btn =
    BUTTON_STYLES.find(b => b.id === buttonStyle) ??
    BUTTON_STYLES.find(b => b.id === DEFAULT_BUTTON)!;

  return {
    ...card.vars,
    "--atlas-btn-radius": btn.radius,
    // CP-67: consumed by ui/button.tsx and key custom CTAs. "0 0 #0000" = no glow.
    "--atlas-cta-glow": ctaGlowShadow(ctaGlow, primary || "#6366f1"),
  } as React.CSSProperties;
}
