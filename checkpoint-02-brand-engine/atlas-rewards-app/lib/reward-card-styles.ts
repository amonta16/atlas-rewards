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
  | "classic" | "outline" | "glow" | "tint" | "midnight" | "luxe"
  | "gradient" | "chrome" | "prism" | "sticker";

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
  // CP-99 3b.2: higher-contrast pack — white cards can read flat on light
  // pages, these bring their own color/texture.
  { id: "gradient", label: "Brand gradient", emoji: "🌈", hint: "Full wash of your two colors, white text", dark: true },
  { id: "chrome",   label: "Chrome",      emoji: "🪞", hint: "Polished metallic shine", dark: false },
  { id: "prism",    label: "Low poly",    emoji: "🔺", hint: "Angular facets in your colors", dark: false },
  { id: "sticker",  label: "Sticker pop", emoji: "💥", hint: "Thick ink border with a punchy offset shadow", dark: false },
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
    case "gradient":
      // Same brand-gradient body in both states (the midnight pattern) —
      // ready cards pop via a white ring + bigger glow.
      return locked
        ? {
            background: `linear-gradient(160deg, ${primary} 0%, ${sec} 100%)`,
            borderColor: "rgba(255,255,255,0.25)",
            boxShadow: `0 10px 24px -12px ${primary}66`,
          }
        : {
            background: `linear-gradient(160deg, ${primary} 0%, ${sec} 100%)`,
            borderColor: "rgba(255,255,255,0.45)",
            boxShadow: `0 0 0 2px rgba(255,255,255,0.35), 0 14px 30px -12px ${primary}99`,
          };
    case "chrome":
      return locked
        ? {
            background: "linear-gradient(150deg, #f8fafc 0%, #e2e8f0 30%, #b6c2d1 50%, #e6ebf2 70%, #ffffff 100%)",
            borderColor: "#cbd5e1",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 20px -12px rgba(100,116,139,0.5)",
          }
        : {
            background: "linear-gradient(150deg, #f8fafc 0%, #e2e8f0 30%, #b6c2d1 50%, #e6ebf2 70%, #ffffff 100%)",
            borderColor: "#94a3b8",
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 2px ${primary}8c, 0 14px 28px -12px rgba(100,116,139,0.6)`,
          };
    case "prism": {
      // Hard-stop angled gradients = flat low-poly facets in soft brand
      // tints over white — texture without hurting text contrast.
      const facets =
        `linear-gradient(135deg, ${primary}21 0%, ${primary}21 28%, transparent 28%), ` +
        `linear-gradient(315deg, ${sec}1c 0%, ${sec}1c 22%, transparent 22%), ` +
        `linear-gradient(245deg, ${primary}12 0%, ${primary}12 45%, transparent 45%), ` +
        `linear-gradient(65deg, ${sec}0f 0%, ${sec}0f 18%, transparent 18%), #ffffff`;
      return locked
        ? { background: facets, borderColor: `${primary}26` }
        : {
            background: facets,
            borderColor: `${primary}59`,
            boxShadow: `0 12px 26px -12px ${primary}77`,
          };
    }
    case "sticker":
      // Comic/sticker look: thick ink border + hard offset shadow (no blur).
      return locked
        ? { border: "2px solid #18181b", background: "#ffffff", boxShadow: "3px 3px 0 #18181b" }
        : { border: "2px solid #18181b", background: "#ffffff", boxShadow: `5px 5px 0 ${primary}` };
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
