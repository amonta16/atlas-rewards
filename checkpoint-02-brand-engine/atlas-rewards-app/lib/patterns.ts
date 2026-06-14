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
  | "none" | "gradient" | "aurora" | "blobs" | "lowpoly" | "diagonal"
  | "geometric" | "swirls" | "circles" | "waves" | "confetti"
  | "honeycomb" | "topography" | "bubbles" | "terrazzo"
  | "medspa" | "restaurant" | "arcade" | "logo";

export const PATTERN_OPTIONS: { id: PatternId; label: string; emoji: string; hint: string }[] = [
  { id: "none",       label: "No pattern",   emoji: "⬜", hint: "Plain background" },
  // Larger, fuller "designs" (full-bleed, brand-colored).
  { id: "gradient",   label: "Brand glow",   emoji: "🎨", hint: "Soft gradient in your colors" },
  { id: "aurora",     label: "Aurora",       emoji: "🌈", hint: "Big soft bands of color" },
  { id: "blobs",      label: "Color blobs",  emoji: "🫧", hint: "Large flowing shapes" },
  { id: "lowpoly",    label: "Low-poly",     emoji: "💠", hint: "Faceted gradient" },
  { id: "diagonal",   label: "Diagonal",     emoji: "📐", hint: "Bold diagonal bands" },
  // Subtle repeating textures.
  { id: "geometric",  label: "Dots",         emoji: "🔷", hint: "Neutral dots — fits anything" },
  { id: "swirls",     label: "Swirls",       emoji: "🌀", hint: "Flowing spirals" },
  { id: "circles",    label: "Rings",        emoji: "⭕", hint: "Concentric circles" },
  { id: "waves",      label: "Waves",        emoji: "🌊", hint: "Gentle wave lines" },
  { id: "topography", label: "Topography",   emoji: "🗺️", hint: "Contour map lines" },
  { id: "bubbles",    label: "Bubbles",      emoji: "🔵", hint: "Soft floating circles" },
  { id: "confetti",   label: "Confetti",     emoji: "🎉", hint: "Playful scattered bits" },
  { id: "terrazzo",   label: "Terrazzo",     emoji: "🧱", hint: "Speckled chips" },
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
    case "lowpoly":
      // Faceted "diamond" triangles at varied opacity → a tileable low-poly
      // gradient feel that stays seamless when repeated.
      return { size: 90,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90'><g fill='${c}'><polygon points='0,0 45,0 0,45' fill-opacity='0.07'/><polygon points='45,0 90,0 90,45' fill-opacity='0.15'/><polygon points='45,0 90,45 45,45' fill-opacity='0.11'/><polygon points='45,0 45,45 0,45' fill-opacity='0.18'/><polygon points='0,45 45,45 0,90' fill-opacity='0.13'/><polygon points='45,45 45,90 0,90' fill-opacity='0.08'/><polygon points='45,45 90,45 90,90' fill-opacity='0.18'/><polygon points='45,45 90,90 45,90' fill-opacity='0.12'/></g></svg>` };
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
    case "topography":
      return { size: 120,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><g stroke='${c}' stroke-opacity='0.16' fill='none' stroke-width='1.3'><path d='M0 30 q30 -20 60 0 t60 0'/><path d='M0 45 q30 -18 60 0 t60 0'/><path d='M0 78 q30 -22 60 0 t60 0'/><path d='M0 93 q30 -18 60 0 t60 0'/><ellipse cx='60' cy='60' rx='22' ry='14'/><ellipse cx='60' cy='60' rx='12' ry='7'/></g></svg>` };
    case "bubbles":
      return { size: 96,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><g fill='${c}'><circle cx='22' cy='26' r='14' fill-opacity='0.10'/><circle cx='70' cy='18' r='8' fill-opacity='0.14'/><circle cx='78' cy='64' r='18' fill-opacity='0.08'/><circle cx='34' cy='72' r='10' fill-opacity='0.13'/><circle cx='52' cy='46' r='5' fill-opacity='0.16'/></g></svg>` };
    case "terrazzo":
      return { size: 80,
        svg: `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><g fill='${c}'><circle cx='14' cy='16' r='4' fill-opacity='0.18'/><rect x='44' y='10' width='8' height='5' rx='2' transform='rotate(25 48 12)' fill-opacity='0.14'/><circle cx='66' cy='30' r='3' fill-opacity='0.2'/><rect x='20' y='44' width='7' height='5' rx='2' transform='rotate(-18 23 46)' fill-opacity='0.16'/><circle cx='58' cy='60' r='5' fill-opacity='0.12'/><rect x='34' y='66' width='6' height='4' rx='2' transform='rotate(40 37 68)' fill-opacity='0.18'/><circle cx='72' cy='72' r='3' fill-opacity='0.16'/></g></svg>` };
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

  // Aurora — bigger, bolder bands of brand color across the whole screen.
  if (id === "aurora") {
    return {
      backgroundColor: baseTint,
      backgroundImage:
        `radial-gradient(80% 55% at 10% 8%, ${primary}40 0%, transparent 60%),` +
        `radial-gradient(75% 50% at 95% 18%, ${sec}3a 0%, transparent 58%),` +
        `radial-gradient(90% 70% at 50% 108%, ${acc}38 0%, transparent 60%),` +
        `radial-gradient(60% 45% at 75% 70%, ${primary}26 0%, transparent 60%)`,
      backgroundAttachment: "fixed",
    };
  }

  // Color blobs — large flowing shapes, brand-colored (full-bleed cover).
  if (id === "blobs") {
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 800' preserveAspectRatio='xMidYMid slice'>` +
      `<path d='M-40 120 C 120 40 180 220 320 150 C 460 80 470 360 300 360 C 120 360 60 260 -40 320 Z' fill='${primary}' fill-opacity='0.16'/>` +
      `<path d='M420 520 C 280 460 240 660 120 600 C -20 530 -10 800 180 800 C 360 800 460 660 460 600 Z' fill='${sec}' fill-opacity='0.14'/>` +
      `<path d='M60 470 C 150 430 170 560 250 540 C 330 520 320 640 230 650 C 130 660 20 560 60 470 Z' fill='${acc}' fill-opacity='0.12'/>` +
      `</svg>`;
    return {
      backgroundColor: baseTint,
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
    };
  }

  // Diagonal — bold brand-colored diagonal bands with a soft corner glow.
  if (id === "diagonal") {
    return {
      backgroundColor: baseTint,
      backgroundImage:
        `linear-gradient(135deg, ${primary}24 0%, transparent 38%),` +
        `linear-gradient(315deg, ${acc}1c 0%, transparent 40%),` +
        `repeating-linear-gradient(135deg, ${sec}12 0 20px, transparent 20px 64px)`,
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
