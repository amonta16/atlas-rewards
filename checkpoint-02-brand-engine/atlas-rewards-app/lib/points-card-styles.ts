import type { CSSProperties } from "react";

/**
 * points-card-styles.ts — CP-73
 *
 * Design presets for the Home points card (LiveMemberCard) — the white
 * "1,400 · points" strip under the hero. Andrew: "multiple presets of
 * designs, some shiny etc / fun / sleek / simple."
 *
 * Same pattern as offer-card-styles: the businesses.points_card_style
 * column stores the id, NULL = "classic" (pixel-identical to the old
 * fixed white card), and the brand editor, live card, and phone preview
 * all resolve through pointsCardStyle().
 */

export type PointsCardStyleId =
  | "classic"   // white card, brand number (the original)
  | "shiny"     // glossy brand gradient + holographic shine strip
  | "fun"       // vibrant tilted gradient + confetti dots
  | "sleek"     // dark glass with a brand glow edge
  | "simple";   // flat, quiet, borderline invisible

export const POINTS_CARD_STYLES: {
  id: PointsCardStyleId; label: string; hint: string;
}[] = [
  { id: "classic", label: "Classic", hint: "Clean white card (default)" },
  { id: "shiny",   label: "Shiny",   hint: "Glossy brand gradient with a light sweep" },
  { id: "fun",     label: "Fun",     hint: "Playful gradient with confetti dots" },
  { id: "sleek",   label: "Sleek",   hint: "Dark glass with a brand glow" },
  { id: "simple",  label: "Simple",  hint: "Flat and quiet — no shadow" },
];

export function pointsCardId(id: string | null | undefined): PointsCardStyleId {
  return (POINTS_CARD_STYLES.find((s) => s.id === id)?.id ?? "classic") as PointsCardStyleId;
}

export type PointsCardCss = {
  /** Styles for the card container. */
  container: CSSProperties;
  /** True when text should be white. */
  dark: boolean;
  /** Color of the big points numeral. */
  number: string;
  /** Render the diagonal light-sweep overlay (shiny). */
  shine: boolean;
  /** Member pill styles. */
  pill: CSSProperties;
};

export function pointsCardStyle(
  id: string | null | undefined,
  primary: string,
  secondary: string,
  accent: string,
): PointsCardCss {
  switch (pointsCardId(id)) {
    case "shiny":
      return {
        container: {
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 55%, ${primary} 100%)`,
          border: "1px solid rgba(255,255,255,0.25)",
          boxShadow: `0 14px 30px -10px ${primary}aa, inset 0 1px 0 rgba(255,255,255,0.35)`,
        },
        dark: true,
        number: "#ffffff",
        shine: true,
        pill: { background: "rgba(255,255,255,0.92)", color: "#18181b" },
      };
    case "fun":
      return {
        container: {
          // Confetti dots layered over a playful three-stop gradient.
          backgroundImage: `radial-gradient(circle at 12% 30%, rgba(255,255,255,0.4) 0 2.5px, transparent 3.5px),
            radial-gradient(circle at 32% 75%, rgba(255,255,255,0.35) 0 2px, transparent 3px),
            radial-gradient(circle at 58% 20%, rgba(255,255,255,0.3) 0 2px, transparent 3px),
            radial-gradient(circle at 82% 65%, rgba(255,255,255,0.35) 0 2.5px, transparent 3.5px),
            radial-gradient(circle at 93% 25%, rgba(255,255,255,0.3) 0 1.5px, transparent 2.5px),
            linear-gradient(120deg, ${primary} 0%, ${accent} 60%, ${secondary} 100%)`,
          border: "none",
          boxShadow: `0 12px 26px -10px ${primary}99`,
        },
        dark: true,
        number: "#ffffff",
        shine: false,
        pill: { background: "rgba(255,255,255,0.92)", color: "#18181b" },
      };
    case "sleek":
      return {
        container: {
          background: "linear-gradient(160deg, #232329 0%, #101014 100%)",
          border: `1px solid ${primary}55`,
          boxShadow: `0 12px 28px -10px rgba(0,0,0,0.6), 0 0 18px -6px ${primary}66`,
        },
        dark: true,
        number: "#ffffff",
        shine: false,
        pill: { background: `${primary}26`, color: "#ffffff", border: `1px solid ${primary}55` },
      };
    case "simple":
      return {
        container: {
          background: "#fafafa",
          border: "1px solid rgb(228 228 231)",
          boxShadow: "none",
        },
        dark: false,
        number: "#18181b",
        shine: false,
        pill: { background: "rgb(228 228 231)", color: "#3f3f46" },
      };
    case "classic":
    default:
      return {
        container: {
          background: "#ffffff",
          border: "1px solid rgb(244 244 245)",
          boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        },
        dark: false,
        number: primary,
        shine: false,
        pill: { background: `${primary}15`, color: primary },
      };
  }
}
