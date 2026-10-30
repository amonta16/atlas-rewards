/**
 * streak-themes.ts — CP-65
 *
 * The streak surface is no longer locked to orange fire. Each business picks
 * a streak theme in the brand editor (businesses.streak_theme), and every
 * streak surface — the header chip, the Home teaser card, the trail, and the
 * full StreakWidget panel — re-themes from the same preset:
 *
 *   fire (default) · gold · neon · pink · blue · gray · coffee · midnight
 *   · brand (derived live from the business's primary color)
 *
 * NULL / unknown ids fall back to "fire", so existing businesses look
 * pixel-identical until a theme is chosen.
 */

export type StreakThemeId =
  | "fire" | "gold" | "neon" | "pink" | "blue"
  | "gray" | "coffee" | "midnight" | "brand";

export type StreakTheme = {
  id: StreakThemeId;
  label: string;
  emoji: string;
  /** Main surface gradient (chip, teaser card, panel header). */
  from: string;
  to: string;
  /** Filled check-in cell gradient in the widget tray (light → mid → deep). */
  cell: [string, string, string];
  /** Shadow color for filled cells (rgba). */
  glow: string;
};

// ---- tiny hex helpers (for the "brand" derived theme) ----
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
const lighten = (hex: string, t: number) => mix(hex, "#ffffff", t);
const darken = (hex: string, t: number) => mix(hex, "#000000", t);
function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const STREAK_THEMES: StreakTheme[] = [
  {
    id: "fire", label: "Classic fire", emoji: "🔥",
    from: "#fb923c", to: "#ef4444",
    cell: ["#fde047", "#f97316", "#dc2626"],
    glow: "rgba(220, 38, 38, 0.8)",
  },
  {
    id: "gold", label: "Luxury gold", emoji: "✨",
    from: "#eab308", to: "#854d0e",
    cell: ["#fef9c3", "#facc15", "#b45309"],
    glow: "rgba(180, 83, 9, 0.8)",
  },
  {
    id: "neon", label: "Neon green", emoji: "⚡",
    from: "#22c55e", to: "#065f46",
    cell: ["#bbf7d0", "#22c55e", "#15803d"],
    glow: "rgba(34, 197, 94, 0.8)",
  },
  {
    id: "pink", label: "Soft pink", emoji: "🌸",
    from: "#f472b6", to: "#be185d",
    cell: ["#fce7f3", "#f472b6", "#db2777"],
    glow: "rgba(219, 39, 119, 0.8)",
  },
  {
    id: "blue", label: "Tech blue", emoji: "💧",
    from: "#38bdf8", to: "#1d4ed8",
    cell: ["#bae6fd", "#3b82f6", "#1e40af"],
    glow: "rgba(59, 130, 246, 0.8)",
  },
  {
    id: "gray", label: "Minimal gray", emoji: "🌫️",
    from: "#71717a", to: "#27272a",
    cell: ["#e4e4e7", "#a1a1aa", "#52525b"],
    glow: "rgba(82, 82, 91, 0.7)",
  },
  {
    id: "coffee", label: "Warm coffee", emoji: "☕",
    from: "#a16207", to: "#44240b",
    cell: ["#fde8c8", "#b5651d", "#6b3410"],
    glow: "rgba(107, 52, 16, 0.8)",
  },
  {
    id: "midnight", label: "Midnight", emoji: "🌙",
    from: "#475569", to: "#0f172a",
    cell: ["#cbd5e1", "#475569", "#1e293b"],
    glow: "rgba(30, 41, 59, 0.8)",
  },
  {
    // The values below are placeholders — resolveStreakTheme() rebuilds this
    // theme live from the business's primary color.
    id: "brand", label: "Match my brand", emoji: "🎨",
    from: "#6366f1", to: "#312e81",
    cell: ["#e0e7ff", "#6366f1", "#3730a3"],
    glow: "rgba(99, 102, 241, 0.8)",
  },
];

const DEFAULT_THEME = STREAK_THEMES[0]; // fire

/**
 * Resolve a business's streak theme. "brand" derives a full gradient set from
 * the primary color; null / unknown ids fall back to classic fire.
 */
export function resolveStreakTheme(
  id: string | null | undefined,
  brandPrimary?: string | null,
): StreakTheme {
  if (id === "brand" && brandPrimary && /^#?[0-9a-fA-F]{3,8}$/.test(brandPrimary)) {
    const p = brandPrimary.startsWith("#") ? brandPrimary : `#${brandPrimary}`;
    return {
      id: "brand", label: "Match my brand", emoji: "🎨",
      from: lighten(p, 0.12),
      to: darken(p, 0.35),
      cell: [lighten(p, 0.55), p, darken(p, 0.3)],
      glow: rgba(darken(p, 0.2), 0.8),
    };
  }
  return STREAK_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** The main streak gradient as a CSS background value. */
export function streakGradient(theme: StreakTheme, angle = 135): string {
  return `linear-gradient(${angle}deg, ${theme.from} 0%, ${theme.to} 100%)`;
}

/* ────────────────────────────────────────────────────────────────────
   CP-99 Phase 4: streak-page ENVIRONMENT color (businesses.streak_env_color).
   The streak page is its own controlled world — cool, deep, premium — so
   the white reward cards pop and the warm flame stays the hottest color.
   Default is a desaturated ocean blue. A client-configured color is never
   used literally: it's desaturated and clamped dark so readability can't
   be destroyed by a bright / neon / near-white pick.
   ──────────────────────────────────────────────────────────────────── */

export type StreakEnv = { top: string; mid: string; edge: string; light?: boolean };

const OCEAN_ENV: StreakEnv = { top: "#1e3d59", mid: "#16324a", edge: "#0e2233" };

/** LIGHT environment presets — tinted enough that white reward cards still
 *  pop (never pure white-on-white). Stored in the same streak_env_color
 *  column as their preset id (plain text, no CHECK — by design). */
export const STREAK_ENV_LIGHT_PRESETS: { id: string; label: string; env: StreakEnv }[] = [
  { id: "sky",   label: "Soft sky", env: { top: "#d3e5f8", mid: "#bcd5ee", edge: "#9cbfdf", light: true } },
  { id: "ice",   label: "Ice",      env: { top: "#e0e9f0", mid: "#cbd9e4", edge: "#aec1d1", light: true } },
  { id: "sand",  label: "Sand",     env: { top: "#f0e7d9", mid: "#e4d6c1", edge: "#cfbca1", light: true } },
  { id: "pearl", label: "Pearl",    env: { top: "#edeae7", mid: "#dfdad5", edge: "#c7c0b9", light: true } },
  { id: "mist",  label: "Mist",     env: { top: "#e3e9f0", mid: "#d2dce6", edge: "#b9c6d4", light: true } },
];

export function streakEnvColors(input?: string | null): StreakEnv {
  const raw = (input ?? "").trim();
  const preset = STREAK_ENV_LIGHT_PRESETS.find(p => p.id === raw);
  if (preset) return preset.env;
  if (!/^#?[0-9a-fA-F]{6}$/.test(raw)) return OCEAN_ENV;
  const p = raw.startsWith("#") ? raw : `#${raw}`;
  // Desaturate ~35% toward gray, then clamp relative luminance into a deep,
  // premium band [0.045, 0.15] — dark enough for white text + white cards,
  // never pitch black.
  let [r, g, b] = hexToRgb(p);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  r += (gray - r) * 0.35; g += (gray - g) * 0.35; b += (gray - b) * 0.35;
  const lum = () => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  let guard = 0;
  while (lum() > 0.15 && guard++ < 24) { r *= 0.88; g *= 0.88; b *= 0.88; }
  while (lum() < 0.045 && guard++ < 24) { r += (255 - r) * 0.1; g += (255 - g) * 0.1; b += (255 - b) * 0.1; }
  const mid = toHex([r, g, b]);
  return { top: lighten(mid, 0.08), mid, edge: darken(mid, 0.24) };
}

/* ────────────────────────────────────────────────────────────────────
   CP-99 Phase 4: streak ENVIRONMENT PATTERN (businesses.streak_env_pattern).
   Pure-CSS atmosphere layers for the streak page's outer environment —
   deliberately faint (opacities ≤ 0.05) so they never compete with the
   road or rewards. The page masks the pattern out of the protected
   center corridor, so the route always stays visually calm.
   ──────────────────────────────────────────────────────────────────── */

export type StreakEnvPatternId =
  | "none" | "lowpoly" | "waves" | "stars" | "ascent"
  | "confetti" | "sparkle" | "deco" | "grid" | "topo" | "flow";

export const STREAK_ENV_PATTERNS: { id: StreakEnvPatternId; label: string; emoji: string }[] = [
  { id: "none",     label: "Clean",        emoji: "◽" },
  { id: "lowpoly",  label: "Low poly",     emoji: "🔷" },
  { id: "grid",     label: "Subtle grid",  emoji: "🔳" },
  { id: "topo",     label: "Topo lines",   emoji: "🗺️" },
  { id: "waves",    label: "Waves",        emoji: "🌊" },
  { id: "flow",     label: "Flow lines",   emoji: "💫" },
  { id: "ascent",   label: "Ascent",       emoji: "⛰️" },
  { id: "stars",    label: "Stars",        emoji: "✨" },
  { id: "confetti", label: "Confetti",     emoji: "🎊" },
  { id: "sparkle",  label: "Fine sparkle", emoji: "💎" },
  { id: "deco",     label: "Art deco",     emoji: "🏛️" },
];

/** CSS layers for the picked pattern. null = no pattern layer.
 *  `light` flips the base ink from white to deep slate so patterns stay
 *  visible (but equally subtle) on the LIGHT environment presets. */
export function streakEnvPatternCss(id: string | null | undefined, light = false): React.CSSProperties | null {
  // pattern "ink" at a given alpha — white on dark envs, slate on light.
  const ink = (a: number) => (light ? `rgba(51,65,85,${(a * 0.9).toFixed(3)})` : `rgba(255,255,255,${a})`);
  switch (id) {
    case "lowpoly":
      return {
        backgroundImage:
          `linear-gradient(135deg, ${ink(0.05)} 0%, ${ink(0.05)} 30%, transparent 30%),` +
          `linear-gradient(315deg, ${ink(0.04)} 0%, ${ink(0.04)} 22%, transparent 22%),` +
          `linear-gradient(225deg, ${ink(0.03)} 0%, ${ink(0.03)} 45%, transparent 45%)`,
        backgroundSize: "180px 180px, 260px 260px, 340px 340px",
      };
    case "grid":
      return {
        backgroundImage:
          `repeating-linear-gradient(0deg, ${ink(0.04)} 0px, ${ink(0.04)} 1px, transparent 1px, transparent 36px),` +
          `repeating-linear-gradient(90deg, ${ink(0.04)} 0px, ${ink(0.04)} 1px, transparent 1px, transparent 36px)`,
      };
    case "topo":
      return {
        backgroundImage:
          `repeating-radial-gradient(ellipse 420px 300px at 18% 22%, transparent 0px, transparent 30px, ${ink(0.035)} 30px, ${ink(0.035)} 31px),` +
          `repeating-radial-gradient(ellipse 520px 380px at 85% 75%, transparent 0px, transparent 38px, ${ink(0.03)} 38px, ${ink(0.03)} 39px)`,
      };
    case "waves":
      return {
        backgroundImage:
          `repeating-linear-gradient(100deg, ${ink(0.045)} 0px, ${ink(0.045)} 2px, transparent 2px, transparent 36px),` +
          `repeating-linear-gradient(82deg, ${ink(0.03)} 0px, ${ink(0.03)} 2px, transparent 2px, transparent 52px)`,
      };
    case "flow":
      return {
        backgroundImage:
          `repeating-linear-gradient(115deg, ${ink(0.05)} 0px, transparent 3px, transparent 26px, ${ink(0.028)} 29px, transparent 32px, transparent 74px),` +
          `repeating-linear-gradient(65deg, ${ink(0.022)} 0px, transparent 2px, transparent 48px)`,
      };
    case "stars":
      return {
        backgroundImage:
          `radial-gradient(1.6px 1.6px at 22% 26%, ${ink(0.5)}, transparent 65%),` +
          `radial-gradient(1.1px 1.1px at 66% 12%, ${ink(0.4)}, transparent 65%),` +
          `radial-gradient(1.3px 1.3px at 84% 52%, ${ink(0.35)}, transparent 65%),` +
          `radial-gradient(1px 1px at 38% 68%, ${ink(0.3)}, transparent 65%),` +
          `radial-gradient(1.4px 1.4px at 10% 84%, ${ink(0.3)}, transparent 65%)`,
        backgroundSize: "260px 300px",
        backgroundRepeat: "repeat",
      };
    case "ascent":
      return {
        backgroundImage:
          `repeating-linear-gradient(45deg, ${ink(0.035)} 0px, ${ink(0.035)} 10px, transparent 10px, transparent 64px),` +
          `repeating-linear-gradient(-45deg, ${ink(0.035)} 0px, ${ink(0.035)} 10px, transparent 10px, transparent 64px)`,
      };
    case "confetti":
      // Sparse celebratory pieces — achievement energy, NOT a birthday party.
      return {
        backgroundImage:
          "radial-gradient(2px 4px at 15% 18%, rgba(251,191,36,0.24), transparent 65%)," +
          `radial-gradient(2px 3px at 68% 38%, ${ink(0.20)}, transparent 65%),` +
          "radial-gradient(3px 2px at 40% 72%, rgba(96,165,250,0.18), transparent 65%)," +
          "radial-gradient(2px 3px at 86% 82%, rgba(244,114,182,0.16), transparent 65%)," +
          "radial-gradient(2px 2px at 8% 55%, rgba(74,222,128,0.16), transparent 65%)",
        backgroundSize: "320px 360px",
        backgroundRepeat: "repeat",
      };
    case "sparkle":
      // Fine premium glints — sparser and warmer than "stars".
      return {
        backgroundImage:
          "radial-gradient(1.4px 1.4px at 28% 20%, rgba(253,230,138,0.55), transparent 65%)," +
          `radial-gradient(1px 1px at 74% 58%, ${ink(0.45)}, transparent 65%),` +
          "radial-gradient(1.6px 1.6px at 12% 80%, rgba(253,230,138,0.4), transparent 65%)," +
          `radial-gradient(0.9px 0.9px at 55% 40%, ${ink(0.3)}, transparent 65%)`,
        backgroundSize: "340px 400px",
        backgroundRepeat: "repeat",
      };
    case "deco":
      // Barely-there art-deco luxury grid with a faint gold cast.
      return {
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(212,175,55,0.05) 0px, rgba(212,175,55,0.05) 1px, transparent 1px, transparent 44px)," +
          "repeating-linear-gradient(90deg, rgba(212,175,55,0.05) 0px, rgba(212,175,55,0.05) 1px, transparent 1px, transparent 44px)," +
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 31px)",
      };
    default:
      return null;
  }
}
