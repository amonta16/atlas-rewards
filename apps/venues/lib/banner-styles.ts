/**
 * banner-styles.ts — CP-56
 *
 * Styles for the sticky "featured offer" banner that sits on top of every
 * customer tab. The agency picks one in the brand editor. Brand styles
 * (solid / gradient / stripes / confetti) use the business's own colors;
 * seasonal themes (christmas, halloween, …) use their own festive palette.
 *
 * All styles assume WHITE banner text (the banner content is white), so
 * every background stays dark/saturated enough for contrast.
 */

export type BannerStyleId =
  | "brand" | "gradient" | "stripes" | "confetti"
  | "christmas" | "halloween" | "valentine" | "gold" | "midnight" | "stpatrick";

export const BANNER_OPTIONS: { id: BannerStyleId; label: string; emoji: string; themed?: boolean }[] = [
  { id: "stripes",   label: "Stripes",      emoji: "📐" },
  { id: "brand",     label: "Solid",        emoji: "🎯" },
  { id: "gradient",  label: "Gradient",     emoji: "🌈" },
  { id: "confetti",  label: "Confetti",     emoji: "🎉" },
  { id: "christmas", label: "Christmas",    emoji: "🎄", themed: true },
  { id: "halloween", label: "Halloween",    emoji: "🎃", themed: true },
  { id: "valentine", label: "Valentine's",  emoji: "💖", themed: true },
  { id: "stpatrick", label: "St. Patrick's", emoji: "🍀", themed: true },
  { id: "gold",      label: "Gold luxe",    emoji: "✨", themed: true },
  { id: "midnight",  label: "Midnight",     emoji: "🌙", themed: true },
];

export function bannerStyle(
  id: BannerStyleId | string | null | undefined,
  primary: string,
  secondary?: string | null,
  accent?: string | null,
): React.CSSProperties {
  const sec = secondary || primary;
  const which = (id ?? "stripes") as BannerStyleId;

  switch (which) {
    case "brand":
      return { backgroundColor: primary };

    case "gradient":
      return {
        backgroundColor: primary,
        backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)`,
      };

    case "confetti":
      return {
        backgroundColor: primary,
        backgroundImage: `radial-gradient(rgba(255,255,255,0.30) 1.6px, transparent 1.7px), radial-gradient(rgba(255,255,255,0.16) 1.2px, transparent 1.3px)`,
        backgroundSize: "16px 16px, 24px 24px",
        backgroundPosition: "0 0, 8px 8px",
      };

    case "christmas":
      return {
        backgroundColor: "#b91c1c",
        backgroundImage:
          `repeating-linear-gradient(45deg, rgba(255,255,255,0.22) 0 7px, transparent 7px 14px, rgba(21,128,61,0.6) 14px 21px, transparent 21px 28px)`,
      };

    case "halloween":
      return {
        backgroundColor: "#7c2d12",
        backgroundImage:
          `repeating-linear-gradient(45deg, rgba(0,0,0,0.28) 0 10px, transparent 10px 20px), linear-gradient(135deg, #f97316 0%, #7c2d12 100%)`,
      };

    case "valentine":
      return {
        backgroundColor: "#be185d",
        backgroundImage:
          `radial-gradient(rgba(255,255,255,0.28) 1.6px, transparent 1.7px), linear-gradient(135deg, #ec4899 0%, #be185d 100%)`,
        backgroundSize: "16px 16px, 100% 100%",
      };

    case "stpatrick":
      return {
        backgroundColor: "#15803d",
        backgroundImage:
          `repeating-linear-gradient(45deg, rgba(255,255,255,0.16) 0 8px, transparent 8px 18px), linear-gradient(135deg, #16a34a 0%, #14532d 100%)`,
      };

    case "gold":
      return {
        backgroundColor: "#b45309",
        backgroundImage:
          `repeating-linear-gradient(45deg, rgba(255,255,255,0.20) 0 6px, transparent 6px 14px), linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #b45309 100%)`,
      };

    case "midnight":
      return {
        backgroundColor: "#0f172a",
        backgroundImage:
          `radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1.5px), linear-gradient(135deg, #1e293b 0%, #0f172a 100%)`,
        backgroundSize: "18px 18px, 100% 100%",
      };

    case "stripes":
    default:
      // The original look: brand color + faint diagonal stripes.
      return {
        backgroundColor: primary,
        backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 8px, rgba(255,255,255,0) 8px 18px)`,
      };
  }
}
