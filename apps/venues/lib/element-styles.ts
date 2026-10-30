/**
 * element-styles.ts — CP-67
 *
 * The design element pack: the small stuff that makes a demo feel finished.
 * Four levers, each picked in the brand editor and applied across the
 * customer app + live preview:
 *
 *   badge_style   — the little chips ("Just for you", "20% off", "Earn")
 *                   gradient (default) | solid | outline | dark | glow
 *   heading_style — section titles
 *                   plain (default) | bar | underline | sticker
 *   divider_style — separators between big sections
 *                   none (default) | line | dots | sparkle
 *   cta_glow      — brand glow behind primary CTA buttons
 *                   none (default) | soft | bold
 *
 * NULL / unknown ids fall back to the defaults — pixel-identical until
 * something is picked.
 */

// ---------- badges ----------
export type BadgeStyleId = "gradient" | "solid" | "outline" | "dark" | "glow";

export const BADGE_STYLES: { id: BadgeStyleId; label: string; emoji: string }[] = [
  { id: "gradient", label: "Gradient", emoji: "🌈" },
  { id: "solid",    label: "Solid",    emoji: "🎯" },
  { id: "outline",  label: "Outline",  emoji: "⭕" },
  { id: "dark",     label: "Dark",     emoji: "⬛" },
  { id: "glow",     label: "Glow",     emoji: "✨" },
];

export function badgeStyleId(id: string | null | undefined): BadgeStyleId {
  return (BADGE_STYLES.find((b) => b.id === id)?.id ?? "gradient") as BadgeStyleId;
}

/** Full inline style (background + text color + optional glow) for a chip. */
export function badgeCss(
  id: string | null | undefined,
  primary: string,
  secondary?: string | null,
): React.CSSProperties {
  const sec = secondary || primary;
  switch (badgeStyleId(id)) {
    case "solid":
      return { background: primary, color: "#ffffff" };
    case "outline":
      return { background: "transparent", color: primary, boxShadow: `inset 0 0 0 1.5px ${primary}` };
    case "dark":
      return { background: "#18181b", color: "#ffffff" };
    case "glow":
      return {
        background: `linear-gradient(135deg, ${primary}, ${sec})`,
        color: "#ffffff",
        boxShadow: `0 4px 12px -2px ${primary}aa`,
      };
    case "gradient":
    default:
      return { background: `linear-gradient(135deg, ${primary}, ${sec})`, color: "#ffffff" };
  }
}

// ---------- section headings ----------
export type HeadingStyleId = "plain" | "bar" | "underline" | "sticker";

export const HEADING_STYLES: { id: HeadingStyleId; label: string; emoji: string }[] = [
  { id: "plain",     label: "Plain",      emoji: "🅣" },
  { id: "bar",       label: "Accent bar", emoji: "▍" },
  { id: "underline", label: "Underline",  emoji: "﹏" },
  { id: "sticker",   label: "Sticker",    emoji: "🏷️" },
];

export function headingStyleId(id: string | null | undefined): HeadingStyleId {
  return (HEADING_STYLES.find((h) => h.id === id)?.id ?? "plain") as HeadingStyleId;
}

// ---------- dividers ----------
export type DividerStyleId = "none" | "line" | "dots" | "sparkle";

export const DIVIDER_STYLES: { id: DividerStyleId; label: string; emoji: string }[] = [
  { id: "none",    label: "None",    emoji: "⬜" },
  { id: "line",    label: "Line",    emoji: "➖" },
  { id: "dots",    label: "Dots",    emoji: "⋯" },
  { id: "sparkle", label: "Sparkle", emoji: "✦" },
];

export function dividerStyleId(id: string | null | undefined): DividerStyleId {
  return (DIVIDER_STYLES.find((d) => d.id === id)?.id ?? "none") as DividerStyleId;
}

// ---------- CTA glow ----------
export type CtaGlowId = "none" | "soft" | "bold";

export const CTA_GLOWS: { id: CtaGlowId; label: string; emoji: string }[] = [
  { id: "none", label: "None", emoji: "⬜" },
  { id: "soft", label: "Soft", emoji: "🔆" },
  { id: "bold", label: "Bold", emoji: "💡" },
];

export function ctaGlowId(id: string | null | undefined): CtaGlowId {
  return (CTA_GLOWS.find((g) => g.id === id)?.id ?? "none") as CtaGlowId;
}

/** Box-shadow for the CTA glow — fed into the --atlas-cta-glow CSS var. */
export function ctaGlowShadow(id: string | null | undefined, primary: string): string {
  switch (ctaGlowId(id)) {
    case "soft": return `0 6px 18px -6px ${primary}99`;
    case "bold": return `0 8px 24px -4px ${primary}cc, 0 0 0 1px ${primary}33`;
    default: return "0 0 #0000";
  }
}
