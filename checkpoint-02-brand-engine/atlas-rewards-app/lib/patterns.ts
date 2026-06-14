/**
 * patterns.ts — CP-52
 *
 * A tiny library of FAINT, tileable background patterns for the customer
 * app, so each business's app feels a little warmer / on-theme instead of
 * flat white. Patterns are inline SVGs (no asset hosting) tinted with the
 * business's brand color and kept very low-opacity so content stays the
 * star. The agency picks one in the brand editor (Design).
 *
 * `none` is the default. `logo` tiles the business's own logo super-faintly.
 */

export type PatternId =
  | "none" | "geometric" | "medspa" | "restaurant" | "arcade" | "logo";

export const PATTERN_OPTIONS: { id: PatternId; label: string; emoji: string; hint: string }[] = [
  { id: "none",       label: "No pattern",   emoji: "⬜", hint: "Plain background" },
  { id: "geometric",  label: "Soft geometric", emoji: "🔷", hint: "Neutral dots — fits anything" },
  { id: "medspa",     label: "Medspa",       emoji: "🌿", hint: "Botanical leaves" },
  { id: "restaurant", label: "Restaurant",   emoji: "☕", hint: "Cups & cutlery" },
  { id: "arcade",     label: "Arcade",       emoji: "👾", hint: "Retro pixels" },
  { id: "logo",       label: "Logo tile",    emoji: "🏷️", hint: "Repeats your logo, faintly" },
];

// Each tile is intentionally low-alpha. Color is injected as a hex string.
function tile(id: PatternId, color: string): { svg: string; size: number } | null {
  const c = color;
  switch (id) {
    case "geometric":
      return {
        size: 44,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><g fill='${c}' fill-opacity='0.10'><circle cx='6' cy='6' r='2'/><circle cx='28' cy='28' r='2'/></g><g fill='${c}' fill-opacity='0.05'><circle cx='28' cy='6' r='1.4'/><circle cx='6' cy='28' r='1.4'/></g></svg>`,
      };
    case "medspa":
      return {
        size: 70,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='70' height='70'><g stroke='${c}' stroke-opacity='0.13' fill='none' stroke-width='1.4'><path d='M14 40 C14 26 26 18 34 16 C32 28 24 40 14 40 Z'/><path d='M22 30 C26 28 30 24 33 19'/><path d='M52 60 C52 50 60 44 66 43 C64 52 60 60 52 60 Z'/></g></svg>`,
      };
    case "restaurant":
      return {
        size: 72,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><g stroke='${c}' stroke-opacity='0.13' fill='none' stroke-width='1.4'><path d='M14 18 h14 a3 3 0 0 1 3 3 v6 a8 8 0 0 1 -8 8 h-4 a8 8 0 0 1 -8 -8 v-6 a3 3 0 0 1 3 -3 Z'/><path d='M31 22 a5 5 0 0 1 0 10'/><path d='M16 41 h12'/><path d='M50 14 v18 M54 14 v18 M58 14 v18 M54 32 v22'/><path d='M44 56 a8 8 0 0 1 16 0 Z'/></g></svg>`,
      };
    case "arcade":
      return {
        size: 56,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><g fill='${c}' fill-opacity='0.12'><rect x='14' y='10' width='6' height='6'/><rect x='36' y='10' width='6' height='6'/><rect x='8' y='16' width='40' height='6'/><rect x='8' y='22' width='6' height='6'/><rect x='20' y='22' width='16' height='6'/><rect x='42' y='22' width='6' height='6'/><rect x='14' y='28' width='6' height='6'/><rect x='36' y='28' width='6' height='6'/></g></svg>`,
      };
    default:
      return null;
  }
}

/**
 * CSS background for the chosen pattern. Returns a style object you can
 * spread onto the customer-app container. `none` → plain near-white.
 *
 * For `logo` we tile the logo image under a heavy white veil so it reads
 * as a faint watermark rather than a loud repeat.
 */
export function patternStyle(
  pattern: PatternId | string | null | undefined,
  color: string,
  logoUrl?: string | null,
): React.CSSProperties {
  const baseTint = "#fbfbfc";
  const id = (pattern ?? "none") as PatternId;

  if (id === "logo") {
    if (!logoUrl) return { backgroundColor: baseTint };
    return {
      backgroundColor: baseTint,
      backgroundImage:
        `linear-gradient(rgba(255,255,255,0.92), rgba(255,255,255,0.92)), url("${logoUrl}")`,
      backgroundSize: "auto, 84px",
      backgroundRepeat: "repeat",
    };
  }

  const t = tile(id, color);
  if (!t) return { backgroundColor: id === "none" ? "#ffffff" : baseTint };

  const uri = `url("data:image/svg+xml,${encodeURIComponent(t.svg)}")`;
  return {
    backgroundColor: baseTint,
    backgroundImage: uri,
    backgroundSize: `${t.size}px ${t.size}px`,
    backgroundRepeat: "repeat",
  };
}
