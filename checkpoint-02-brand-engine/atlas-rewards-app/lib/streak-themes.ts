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

export type StreakEnv = { top: string; mid: string; edge: string };

const OCEAN_ENV: StreakEnv = { top: "#1e3d59", mid: "#16324a", edge: "#0e2233" };

export function streakEnvColors(input?: string | null): StreakEnv {
  const raw = (input ?? "").trim();
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

export type StreakEnvPatternId = "none" | "lowpoly" | "waves" | "stars" | "ascent";

export const STREAK_ENV_PATTERNS: { id: StreakEnvPatternId; label: string; emoji: string }[] = [
  { id: "none",    label: "Clean",    emoji: "◽" },
  { id: "lowpoly", label: "Low poly", emoji: "🔷" },
  { id: "waves",   label: "Waves",    emoji: "🌊" },
  { id: "stars",   label: "Stars",    emoji: "✨" },
  { id: "ascent",  label: "Ascent",   emoji: "⛰️" },
];

/** CSS layers for the picked pattern. null = no pattern layer. */
export function streakEnvPatternCss(id: string | null | undefined): React.CSSProperties | null {
  switch (id) {
    case "lowpoly":
      return {
        backgroundImage:
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.05) 30%, transparent 30%)," +
          "linear-gradient(315deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.04) 22%, transparent 22%)," +
          "linear-gradient(225deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.03) 45%, transparent 45%)",
        backgroundSize: "180px 180px, 260px 260px, 340px 340px",
      };
    case "waves":
      return {
        backgroundImage:
          "repeating-linear-gradient(100deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 2px, transparent 2px, transparent 36px)," +
          "repeating-linear-gradient(82deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 52px)",
      };
    case "stars":
      return {
        backgroundImage:
          "radial-gradient(1.6px 1.6px at 22% 26%, rgba(255,255,255,0.5), transparent 65%)," +
          "radial-gradient(1.1px 1.1px at 66% 12%, rgba(255,255,255,0.4), transparent 65%)," +
          "radial-gradient(1.3px 1.3px at 84% 52%, rgba(255,255,255,0.35), transparent 65%)," +
          "radial-gradient(1px 1px at 38% 68%, rgba(255,255,255,0.3), transparent 65%)," +
          "radial-gradient(1.4px 1.4px at 10% 84%, rgba(255,255,255,0.3), transparent 65%)",
        backgroundSize: "260px 300px",
        backgroundRepeat: "repeat",
      };
    case "ascent":
      return {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 10px, transparent 10px, transparent 64px)," +
          "repeating-linear-gradient(-45deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 10px, transparent 10px, transparent 64px)",
      };
    default:
      return null;
  }
}
