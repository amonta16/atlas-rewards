/**
 * offer-card-styles.ts — CP-65.1
 *
 * The customer "Limited offers" cards are no longer locked to flat white.
 * Each business picks an offer-card style in the brand editor
 * (businesses.offer_card_style); the cards restyle everywhere they render.
 *
 * NULL / unknown ids fall back to "clean" (the original white card), so
 * existing businesses look pixel-identical until a style is chosen.
 */

export type OfferCardStyleId =
  | "clean" | "tint" | "pop" | "gradient" | "midnight" | "luxe";

export type OfferCardStyle = {
  id: OfferCardStyleId;
  label: string;
  emoji: string;
  hint: string;
  /** True when the card background is dark → text flips to white. */
  dark: boolean;
};

export const OFFER_CARD_STYLES: OfferCardStyle[] = [
  { id: "clean",    label: "Clean white", emoji: "⬜", hint: "The original card (default)", dark: false },
  { id: "tint",     label: "Brand tint",  emoji: "🎨", hint: "Soft wash of your colors",    dark: false },
  { id: "pop",      label: "Poppy glow",  emoji: "✨", hint: "White card, bold brand ring + glow", dark: false },
  { id: "gradient", label: "Gradient",    emoji: "🌈", hint: "Full brand gradient, white text", dark: true },
  { id: "midnight", label: "Midnight",    emoji: "🌙", hint: "Dark glass card, white text", dark: true },
  { id: "luxe",     label: "Luxe noir",   emoji: "🖤", hint: "Near-black with a gold rim",  dark: true },
];

export function offerCardMeta(id: string | null | undefined): OfferCardStyle {
  return OFFER_CARD_STYLES.find((s) => s.id === id) ?? OFFER_CARD_STYLES[0];
}

/** Container styles for one offer card. */
export function offerCardStyle(
  id: string | null | undefined,
  primary: string,
  secondary?: string | null,
): React.CSSProperties {
  const sec = secondary || primary;
  switch (offerCardMeta(id).id) {
    case "tint":
      return {
        background: `linear-gradient(135deg, ${primary}16 0%, ${sec}0a 100%)`,
        borderColor: `${primary}33`,
      };
    case "pop":
      return {
        background: "#ffffff",
        borderColor: "transparent",
        boxShadow: `0 0 0 2px ${primary}59, 0 10px 26px -10px ${primary}80`,
      };
    case "gradient":
      return {
        background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)`,
        borderColor: "rgba(255,255,255,0.25)",
        boxShadow: `0 10px 24px -10px ${primary}99`,
      };
    case "midnight":
      return {
        background: "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)",
        borderColor: "rgba(255,255,255,0.14)",
        boxShadow: "0 10px 24px -10px rgba(15, 23, 42, 0.8)",
      };
    case "luxe":
      return {
        background: "linear-gradient(160deg, #1c1917 0%, #292524 100%)",
        borderColor: "transparent",
        boxShadow: "0 0 0 1.5px rgba(245, 158, 11, 0.55), 0 10px 24px -10px rgba(0,0,0,0.7)",
      };
    case "clean":
    default:
      // The original look: white + faint brand border.
      return {
        background: "#ffffff",
        borderColor: `${primary}1f`,
      };
  }
}
