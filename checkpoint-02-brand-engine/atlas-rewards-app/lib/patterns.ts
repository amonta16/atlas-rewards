/**
 * patterns.ts — CP-52 (expanded CP-52.4)
 *
 * A library of FAINT, tileable background patterns for the customer app so
 * each business feels a little warmer / on-theme instead of flat white.
 * Patterns are inline SVGs tinted with the business's brand color (kept
 * low-opacity so content stays the star). `gradient` is a full-bleed brand
 * mesh; `logo` tiles the business's own logo as a faint watermark.
 *
 * The agency picks one in the brand editor → Design → Background pattern.
 */

export type PatternId =
  | "none" | "geometric" | "swirls" | "circles" | "waves" | "confetti"
  | "honeycomb" | "gradient" | "medspa" | "restaurant" | "arcade" | "logo";

export const PATTERN_OPTIONS: { id: PatternId; label: string; emoji: string; hint: string }[] = [
  { id: "none",       label: "No pattern",   emoji: "⬜", hint: "Plain background" },
  { id: "gradient",   label: "Brand glow",   emoji: "🎨", hint: "Soft gradient in your colors" },
  { id: "geometric",  label: "Dots",         emoji: "🔷", hint: "Neutral dots — fits anything" },
  { id: "swirls",     label: "Swirls",       emoji: "🌀", hint: "Flowing spirals" },
  { id: "circles",    label: "Rings",        emoji: "⭕", hint: "Concentric circles" },
  { id: "waves",      label: "Waves",        emoji: "🌊", hint: "Gentle wave lines" },
  { id: "confetti",   label: "Confetti",     emoji: "🎉", hint: "Playful scattered bits" },
  { id: "honeycomb",  label: "Honeycomb",    emoji: "⬡", hint: "Hexagon mesh" },
  { id: "medspa",     label: "Medspa",       emoji: "🌿", hint: "Botanical leaves" },
  { id: "restaurant", label: "Restaurant",   emoji: "☕", hint: "Cups & cutlery" },
  { id: "arcade",     label: "Arcade",       emoji: "👾", hint: "Retro pixels" },
  { id: "logo",       label: "Logo tile",    emoji: "🏷️", hint: "Repeats your logo, faintly" },
];

// Each tile is intentionally low-alpha. Color is injected as a hex string.
function tile(id: PatternId, c: string): { svg: string; size: number } | null {
  switch (id) {
    case "geometric":
      return { size: 44,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44'><g fill='${c}' fill-opacity='0.22'><circle cx='6' cy='6' r='2.2'/><circle cx='28' cy='28' r='2.2'/></g><g fill='${c}' fill-opacity='0.12'><circle cx='28' cy='6' r='1.6'/><circle cx='6' cy='28' r='1.6'/></g></svg>` };
    case "swirls":
      return { size: 80,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><g stroke='${c}' stroke-opacity='0.20' fill='none' stroke-width='1.6' stroke-linecap='round'><path d='M20 20 C32 20 32 36 20 36 C12 36 12 26 22 26 C28 26 28 32 24 32'/><path d='M60 60 C72 60 72 76 60 76 C52 76 52 66 62 66 C68 66 68 72 64 72'/></g></svg>` };
    case "circles":
      return { size: 64,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><g stroke='${c}' stroke-opacity='0.18' fill='none' stroke-width='1.5'><circle cx='32' cy='32' r='6'/><circle cx='32' cy='32' r='13'/><circle cx='32' cy='32' r='20'/><circle cx='0' cy='0' r='12'/><circle cx='64' cy='64' r='12'/></g></svg>` };
    case "waves":
      return { size: 80,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='40'><g stroke='${c}' stroke-opacity='0.20' fill='none' stroke-width='1.6'><path d='M0 20 q10 -10 20 0 t20 0 t20 0 t20 0'/><path d='M0 32 q10 -10 20 0 t20 0 t20 0 t20 0'/></g></svg>` };
    case "confetti":
      return { size: 60,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><g fill='${c}' fill-opacity='0.20'><rect x='8' y='10' width='5' height='5' rx='1' transform='rotate(20 10 12)'/><circle cx='44' cy='16' r='2.4'/><rect x='30' y='38' width='5' height='5' rx='1' transform='rotate(-15 32 40)'/><circle cx='14' cy='44' r='2.2'/><rect x='48' y='46' width='4' height='4' rx='1' transform='rotate(35 50 48)'/></g><g stroke='${c}' stroke-opacity='0.18' stroke-width='1.6' stroke-linecap='round'><path d='M24 8 l4 4'/><path d='M52 30 l4 4'/></g></svg>` };
    case "honeycomb":
      return { size: 56,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='100'><g stroke='${c}' stroke-opacity='0.18' fill='none' stroke-width='1.4'><path d='M28 0 l24 14 v28 l-24 14 l-24 -14 v-28 z'/><path d='M0 50 l24 14 v28 M56 50 l-24 14 v28'/></g></svg>` };
    case "medspa":
      return { size: 70,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='70' height='70'><g stroke='${c}' stroke-opacity='0.24' fill='none' stroke-width='1.6'><path d='M14 40 C14 26 26 18 34 16 C32 28 24 40 14 40 Z'/><path d='M22 30 C26 28 30 24 33 19'/><path d='M52 60 C52 50 60 44 66 43 C64 52 60 60 52 60 Z'/></g></svg>` };
    case "restaurant":
      return { size: 72,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><g stroke='${c}' stroke-opacity='0.24' fill='none' stroke-width='1.6'><path d='M14 18 h14 a3 3 0 0 1 3 3 v6 a8 8 0 0 1 -8 8 h-4 a8 8 0 0 1 -8 -8 v-6 a3 3 0 0 1 3 -3 Z'/><path d='M31 22 a5 5 0 0 1 0 10'/><path d='M16 41 h12'/><path d='M50 14 v18 M54 14 v18 M58 14 v18 M54 32 v22'/><path d='M44 56 a8 8 0 0 1 16 0 Z'/></g></svg>` };
    case "arcade":
      return { size: 56,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><g fill='${c}' fill-opacity='0.22'><rect x='14' y='10' width='6' height='6'/><rect x='36' y='10' width='6' height='6'/><rect x='8' y='16' width='40' height='6'/><rect x='8' y='22' width='6' height='6'/><rect x='20' y='22' width='16' height='6'/><rect x='42' y='22' width='6' height='6'/><rect x='14' y='28' width='6' height='6'/><rect x='36' y='28' width='6' height='6'/></g></svg>` };
    default:
      return null;
  }
}

/**
 * CSS background for the chosen pattern. Spread onto the customer-app
 * container. `none` → plain near-white; `gradient` → full-bleed brand mesh;
 * `logo` → faint tiled logo watermark.
 */
export function patternStyle(
  pattern: PatternId | string | null | undefined,
  primary: string,
  logoUrl?: string | null,
  secondary?: string | null,
  accent?: string | null,
): React.CSSProperties {
  const baseTint = "#faf9f7";
  const id = (pattern ?? "none") as PatternId;
  const sec = secondary || primary;
  const acc = accent || secondary || primary;

  if (id === "none") return { backgroundColor: "#fafafa" };

  if (id === "gradient") {
    return {
      backgroundColor: baseTint,
      backgroundImage:
        `radial-gradient(120% 90% at 12% 0%, ${primary}26 0%, transparent 45%),` +
        `radial-gradient(120% 90% at 95% 8%, ${sec}22 0%, transparent 42%),` +
        `radial-gradient(140% 120% at 50% 100%, ${acc}1f 0%, transparent 50%)`,
      backgroundAttachment: "fixed",
    };
  }

  if (id === "logo") {
    if (!logoUrl) return { backgroundColor: baseTint };
    return {
      backgroundColor: baseTint,
      backgroundImage:
        `linear-gradient(rgba(255,255,255,0.86), rgba(255,255,255,0.86)), url("${logoUrl}")`,
      backgroundSize: "auto, 76px",
      backgroundRepeat: "repeat",
    };
  }

  const t = tile(id, primary);
  if (!t) return { backgroundColor: baseTint };

  const uri = `url("data:image/svg+xml,${encodeURIComponent(t.svg)}")`;
  return {
    backgroundColor: baseTint,
    backgroundImage: uri,
    backgroundSize: `${t.size}px ${t.size}px`,
    backgroundRepeat: "repeat",
  };
}
