/**
 * reward-card-styles.ts — CP-99 3b.1
 *
 * App-builder preset pack for the REWARD STORE panels, following the
 * CP-65.1 offer-card-styles pattern exactly: each business picks a style
 * in the brand editor (businesses.reward_card_style) and the store cards
 * restyle everywhere they render.
 *
 * NULL / unknown ids fall back to "classic" — the CP-99 3b look (quiet
 * cards, brand glow when affordable) — so existing businesses are
 * pixel-identical until a style is chosen.
 *
 * The chrome() helper returns the card SHELL's inline styles per state
 * (locked vs ready). Radius + base shadow stay CLASS-driven in the
 * component (rounded-2xl / shadow-sm) so the CP-58 per-business
 * card-shape presets keep composing with these.
 */

export type RewardCardStyleId =
  | "classic" | "outline" | "glow" | "tint" | "midnight" | "luxe";

export type RewardCardStyle = {
  id: RewardCardStyleId;
  label: string;
  emoji: string;
  hint: string;
  /** True when the card body is dark → text inside flips to white. */
  dark: boolean;
};

export const REWARD_CARD_STYLES: RewardCardStyle[] = [
  { id: "classic",  label: "Classic",     emoji: "⬜", hint: "Quiet cards that glow in your colors when ready (default)", dark: false },
  { id: "outline",  label: "Bold outline", emoji: "🔷", hint: "Strong brand border on every card", dark: false },
  { id: "glow",     label: "Glow",        emoji: "✨", hint: "Soft brand glow on every card, stronger when ready", dark: false },
  { id: "tint",     label: "Brand tint",  emoji: "🎨", hint: "Wash of your colors on every card", dark: false },
  { id: "midnight", label: "Midnight",    emoji: "🌙", hint: "Dark glass cards, white text", dark: true },
  { id: "luxe",     label: "Luxe noir",   emoji: "🖤", hint: "Near-black with a gold rim", dark: true },
];

export function rewardCardMeta(id: string | null | undefined): RewardCardStyle {
  return REWARD_CARD_STYLES.find((s) => s.id === id) ?? REWARD_CARD_STYLES[0];
}

/**
 * Card-shell inline styles for one store card.
 * `locked` = customer can't afford it yet; ready cards always get the
 * louder treatment of the pair.
 */
export function rewardCardChrome(
  id: string | null | undefined,
  primary: string,
  secondary: string | null | undefined,
  locked: boolean,
): React.CSSProperties {
  const sec = secondary || primary;
  switch (rewardCardMeta(id).id) {
    case "outline":
      return locked
        ? { border: `2px solid ${primary}40`, background: "#ffffff" }
        : {
            border: `2px solid ${primary}`,
            background: "#ffffff",
            boxShadow: `0 10px 24px -14px ${primary}88`,
          };
    case "glow":
      return locked
        ? {
            borderColor: "transparent",
            background: "#ffffff",
            boxShadow: `0 0 0 1px ${primary}30, 0 10px 26px -14px ${primary}59`,
          }
        : {
            borderColor: "transparent",
            background: `linear-gradient(180deg, #ffffff 60%, ${primary}0d 100%)`,
            boxShadow: `0 0 0 2px ${primary}66, 0 14px 30px -12px ${primary}8c`,
          };
    case "tint":
      return locked
        ? {
            background: `linear-gradient(160deg, ${primary}12 0%, #ffffff 45%, ${sec}0d 100%)`,
            borderColor: `${primary}2e`,
          }
        : {
            background: `linear-gradient(160deg, ${primary}1c 0%, #ffffff 45%, ${sec}14 100%)`,
            borderColor: `${primary}59`,
            boxShadow: `0 12px 26px -12px ${primary}77`,
          };
    case "midnight":
      return locked
        ? {
            background: "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)",
            borderColor: "rgba(255,255,255,0.12)",
            boxShadow: "0 10px 24px -12px rgba(15,23,42,0.7)",
          }
        : {
            background: "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)",
            borderColor: "rgba(255,255,255,0.2)",
            boxShadow: `0 0 0 2px ${primary}8c, 0 14px 30px -12px ${primary}66`,
          };
    case "luxe":
      return locked
        ? {
            background: "linear-gradient(160deg, #1c1917 0%, #292524 100%)",
            borderColor: "transparent",
            boxShadow: "0 0 0 1px rgba(245,158,11,0.3), 0 10px 24px -12px rgba(0,0,0,0.7)",
          }
        : {
            background: "linear-gradient(160deg, #1c1917 0%, #292524 100%)",
            borderColor: "transparent",
            boxShadow: "0 0 0 2px rgba(245,158,11,0.7), 0 14px 30px -12px rgba(0,0,0,0.8)",
          };
    case "classic":
    default:
      // CP-99 3b default: locked = quiet class-driven card (no overrides);
      // ready = brand-tinted border + ambient glow + faint gradient wash.
      return locked
        ? {}
        : {
            borderColor: `${primary}45`,
            background: `linear-gradient(180deg, #ffffff 55%, ${primary}0d 100%)`,
            boxShadow: `0 1px 2px rgba(0,0,0,0.05), 0 12px 26px -12px ${primary}77`,
          };
  }
}
