/**
 * streak-page-themes.ts — CP-99 streak visual system, simplified.
 *
 * The streak page's look is now ONE choice (businesses.streak_page_theme)
 * from a curated library with real range — from major-brand minimal to
 * loud confetti worlds — plus ONE progress-color choice
 * (businesses.streak_progress_mode: null = classic fire / "brand" /
 * "#rrggbb" custom). That's the whole configuration.
 *
 * Legacy fields (streak_env_color / streak_env_pattern) still resolve for
 * businesses that configured them before this pass — nothing breaks.
 *
 * READABILITY CONTRACT: however wild a theme's environment gets, the page
 * masks pattern + decor art out of the protected center corridor, the
 * corridor auto-contrasts from env.light, and custom progress colors get
 * luminance-clamped — a business cannot accidentally build an unreadable
 * streak page.
 */

import {
  streakEnvColors,
  streakEnvPatternCss,
  resolveStreakTheme,
  type StreakEnv,
  type StreakTheme,
} from "@/lib/streak-themes";
import { patternStyle, readableTextColor } from "@/lib/patterns";

/* ── tiny hex helpers (local copies — streak-themes keeps its private) ── */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(f, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
const mixc = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
const lighten = (h: string, t: number) => mixc(h, "#ffffff", t);
const darken = (h: string, t: number) => mixc(h, "#000000", t);
const lum = (h: string) => {
  const [r, g, b] = hexToRgb(h);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/* ── decor: deterministic scattered art (SSR-safe, no randomness) ──────── */
export type StreakDecor =
  | { kind: "icon"; icon: "flame" | "star" | "sparkle" | "trophy" | "crown" | "zap"; t: string; l: string; s: number; o: number; rot?: number; color: string }
  | { kind: "circle"; t: string; l: string; s: number; o: number; color: string; blur?: number }
  | { kind: "confetti"; t: string; l: string; w: number; h: number; o: number; color: string; rot: number }
  | { kind: "balloon"; t: string; l: string; s: number; o: number; color: string };

export type StreakPageThemeDef = {
  id: string;
  label: string;
  category: "Brand" | "Minimal" | "Fun" | "Pattern" | "Atmosphere" | "Celebration" | "Cosmic" | "Premium";
  env: StreakEnv;
  pattern?: React.CSSProperties | null;
  decor?: StreakDecor[];
  /** env derived live from brand primary at resolve time. */
  brandTint?: boolean;
  /** use the app's own configured background instead of a streak env. */
  useAppBackground?: boolean;
};

const CONFETTI_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6"];
const confettiField = (o: number): StreakDecor[] =>
  [
    ["3%", "12%", 0], ["6%", "78%", 30], ["11%", "38%", -20], ["16%", "88%", 15],
    ["22%", "8%", 45], ["27%", "62%", -35], ["33%", "20%", 10], ["39%", "84%", -15],
    ["46%", "10%", 25], ["52%", "70%", -40], ["59%", "30%", 35], ["66%", "90%", -10],
    ["73%", "16%", 20], ["80%", "76%", -25], ["87%", "40%", 40], ["93%", "82%", -30],
  ].map(([t, l, rot], i) => ({
    kind: "confetti" as const, t: t as string, l: l as string,
    w: 6 + (i % 3) * 2, h: 10 + (i % 4) * 2, o,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], rot: rot as number,
  }));

export const STREAK_PAGE_THEMES: StreakPageThemeDef[] = [
  /* ── BRAND ─────────────────────────────────────────────────────────── */
  {
    id: "brand-app", label: "Use app theme", category: "Brand",
    env: { top: "#fafafa", mid: "#fafafa", edge: "#f4f4f5", light: true },
    useAppBackground: true,
  },
  {
    id: "clean-brand", label: "Clean brand", category: "Minimal",
    // env rebuilt from the brand primary at resolve time (soft tint).
    env: { top: "#eef2ff", mid: "#e0e7ff", edge: "#c7d2fe", light: true },
    brandTint: true,
  },

  /* ── MINIMAL ───────────────────────────────────────────────────────── */
  {
    id: "soft-gradient", label: "Soft gradient", category: "Minimal",
    env: { top: "#f1f5f9", mid: "#e2e8f0", edge: "#cbd5e1", light: true },
  },
  {
    id: "classic", label: "Classic", category: "Minimal",
    env: { top: "#eef1f4", mid: "#eef1f4", edge: "#e2e6ea", light: true },
  },
  {
    id: "premium-minimal", label: "Premium minimal", category: "Premium",
    env: { top: "#1a1c20", mid: "#121417", edge: "#0a0b0d" },
  },
  {
    id: "ocean", label: "Ocean", category: "Minimal",
    env: { top: "#1e3d59", mid: "#16324a", edge: "#0e2233" },
  },

  /* ── FUN ───────────────────────────────────────────────────────────── */
  {
    id: "confetti-pop", label: "Confetti", category: "Fun",
    env: { top: "#fdf8ee", mid: "#faf1e0", edge: "#f0e2c8", light: true },
    decor: confettiField(0.6),
  },
  {
    id: "balloons", label: "Balloons", category: "Fun",
    env: { top: "#2d9cdb", mid: "#1478b8", edge: "#0b5a92" },
    decor: [
      { kind: "balloon", t: "4%", l: "14%", s: 34, o: 0.55, color: "#f87171" },
      { kind: "balloon", t: "9%", l: "80%", s: 28, o: 0.5, color: "#fde047" },
      { kind: "balloon", t: "18%", l: "26%", s: 24, o: 0.45, color: "#f9a8d4" },
      { kind: "balloon", t: "27%", l: "86%", s: 30, o: 0.5, color: "#ffffff" },
      { kind: "balloon", t: "38%", l: "10%", s: 26, o: 0.45, color: "#86efac" },
      { kind: "balloon", t: "52%", l: "82%", s: 32, o: 0.5, color: "#fdba74" },
      { kind: "balloon", t: "66%", l: "18%", s: 24, o: 0.4, color: "#fde047" },
      { kind: "balloon", t: "80%", l: "84%", s: 28, o: 0.45, color: "#f87171" },
      { kind: "circle", t: "60%", l: "50%", s: 90, o: 0.1, color: "#ffffff", blur: 20 },
    ],
  },
  {
    id: "arcade-pop", label: "Arcade pop", category: "Fun",
    env: { top: "#7c3aed", mid: "#c026d3", edge: "#e11d48" },
    pattern: {
      backgroundImage:
        "radial-gradient(2px 2px at 20% 24%, rgba(255,255,255,0.35), transparent 65%)," +
        "radial-gradient(2px 2px at 72% 60%, rgba(255,255,255,0.3), transparent 65%)," +
        "radial-gradient(2.5px 2.5px at 44% 82%, rgba(253,224,71,0.4), transparent 65%)",
      backgroundSize: "220px 260px",
      backgroundRepeat: "repeat",
    },
    decor: [
      { kind: "icon", icon: "zap", t: "8%", l: "16%", s: 30, o: 0.3, rot: -15, color: "#fde047" },
      { kind: "icon", icon: "star", t: "24%", l: "82%", s: 26, o: 0.3, rot: 20, color: "#ffffff" },
      { kind: "icon", icon: "zap", t: "48%", l: "12%", s: 24, o: 0.25, rot: 10, color: "#fde047" },
      { kind: "icon", icon: "star", t: "70%", l: "86%", s: 30, o: 0.28, rot: -20, color: "#fbcfe8" },
    ],
  },

  /* ── PATTERN ───────────────────────────────────────────────────────── */
  {
    id: "fire-icons", label: "Fire pattern", category: "Pattern",
    env: { top: "#7f1d1d", mid: "#5c1010", edge: "#450a0a" },
    decor: [
      { kind: "icon", icon: "flame", t: "3%", l: "14%", s: 34, o: 0.3, rot: -10, color: "#fb923c" },
      { kind: "icon", icon: "flame", t: "10%", l: "82%", s: 26, o: 0.26, rot: 12, color: "#fdba74" },
      { kind: "icon", icon: "flame", t: "19%", l: "30%", s: 22, o: 0.22, rot: -6, color: "#f97316" },
      { kind: "icon", icon: "flame", t: "28%", l: "88%", s: 30, o: 0.28, rot: 8, color: "#fb923c" },
      { kind: "icon", icon: "flame", t: "38%", l: "10%", s: 24, o: 0.24, rot: 14, color: "#fdba74" },
      { kind: "icon", icon: "flame", t: "50%", l: "80%", s: 34, o: 0.3, rot: -12, color: "#f97316" },
      { kind: "icon", icon: "flame", t: "62%", l: "20%", s: 26, o: 0.24, rot: 6, color: "#fb923c" },
      { kind: "icon", icon: "flame", t: "74%", l: "86%", s: 24, o: 0.22, rot: -8, color: "#fdba74" },
      { kind: "icon", icon: "flame", t: "86%", l: "14%", s: 30, o: 0.26, rot: 10, color: "#f97316" },
    ],
  },
  {
    id: "star-field", label: "Stars", category: "Pattern",
    env: { top: "#1e2a5a", mid: "#16204a", edge: "#0d1430" },
    pattern: {
      backgroundImage:
        "radial-gradient(1.5px 1.5px at 24% 20%, rgba(255,255,255,0.55), transparent 65%)," +
        "radial-gradient(1px 1px at 68% 44%, rgba(255,255,255,0.4), transparent 65%)," +
        "radial-gradient(1.2px 1.2px at 40% 76%, rgba(255,255,255,0.35), transparent 65%)",
      backgroundSize: "240px 280px",
      backgroundRepeat: "repeat",
    },
    decor: [
      { kind: "icon", icon: "star", t: "5%", l: "18%", s: 32, o: 0.4, rot: -12, color: "#fde047" },
      { kind: "icon", icon: "star", t: "16%", l: "84%", s: 24, o: 0.35, rot: 18, color: "#ffffff" },
      { kind: "icon", icon: "star", t: "30%", l: "12%", s: 20, o: 0.3, rot: 8, color: "#fde047" },
      { kind: "icon", icon: "star", t: "46%", l: "86%", s: 30, o: 0.38, rot: -20, color: "#ffffff" },
      { kind: "icon", icon: "star", t: "62%", l: "22%", s: 24, o: 0.32, rot: 12, color: "#fde047" },
      { kind: "icon", icon: "star", t: "78%", l: "82%", s: 22, o: 0.3, rot: -8, color: "#ffffff" },
      { kind: "icon", icon: "star", t: "90%", l: "30%", s: 28, o: 0.34, rot: 15, color: "#fde047" },
    ],
  },
  {
    id: "sparkle-burst", label: "Sparkles", category: "Celebration",
    env: { top: "#4c1d95", mid: "#5b21b6", edge: "#2e1065" },
    pattern: {
      backgroundImage:
        "radial-gradient(1.8px 1.8px at 30% 24%, rgba(253,230,138,0.6), transparent 65%)," +
        "radial-gradient(1.2px 1.2px at 74% 58%, rgba(255,255,255,0.5), transparent 65%)," +
        "radial-gradient(1.5px 1.5px at 14% 80%, rgba(253,230,138,0.45), transparent 65%)",
      backgroundSize: "200px 240px",
      backgroundRepeat: "repeat",
    },
    decor: [
      { kind: "icon", icon: "sparkle", t: "8%", l: "16%", s: 28, o: 0.45, color: "#fde047" },
      { kind: "icon", icon: "sparkle", t: "26%", l: "84%", s: 22, o: 0.4, color: "#ffffff" },
      { kind: "icon", icon: "sparkle", t: "48%", l: "12%", s: 24, o: 0.4, color: "#fde047" },
      { kind: "icon", icon: "sparkle", t: "70%", l: "86%", s: 26, o: 0.42, color: "#ffffff" },
    ],
  },

  /* ── ATMOSPHERE ────────────────────────────────────────────────────── */
  {
    id: "bokeh", label: "Bokeh", category: "Atmosphere",
    env: { top: "#155e63", mid: "#173f56", edge: "#1e1b4b" },
    decor: [
      { kind: "circle", t: "4%", l: "16%", s: 80, o: 0.3, color: "#22d3ee", blur: 14 },
      { kind: "circle", t: "12%", l: "78%", s: 56, o: 0.28, color: "#f472b6", blur: 12 },
      { kind: "circle", t: "24%", l: "8%", s: 44, o: 0.24, color: "#fbbf24", blur: 10 },
      { kind: "circle", t: "36%", l: "84%", s: 70, o: 0.26, color: "#a78bfa", blur: 14 },
      { kind: "circle", t: "50%", l: "14%", s: 52, o: 0.22, color: "#34d399", blur: 12 },
      { kind: "circle", t: "64%", l: "80%", s: 60, o: 0.26, color: "#22d3ee", blur: 12 },
      { kind: "circle", t: "78%", l: "18%", s: 48, o: 0.22, color: "#f472b6", blur: 10 },
      { kind: "circle", t: "90%", l: "76%", s: 64, o: 0.24, color: "#fbbf24", blur: 14 },
    ],
  },
  {
    id: "dark-bokeh", label: "Dark bokeh", category: "Premium",
    env: { top: "#171310", mid: "#0f0d0b", edge: "#080706" },
    decor: [
      { kind: "circle", t: "6%", l: "20%", s: 70, o: 0.22, color: "#f59e0b", blur: 14 },
      { kind: "circle", t: "18%", l: "80%", s: 48, o: 0.2, color: "#fde68a", blur: 12 },
      { kind: "circle", t: "34%", l: "10%", s: 40, o: 0.16, color: "#fbbf24", blur: 10 },
      { kind: "circle", t: "52%", l: "84%", s: 60, o: 0.2, color: "#f59e0b", blur: 14 },
      { kind: "circle", t: "70%", l: "16%", s: 44, o: 0.16, color: "#fde68a", blur: 12 },
      { kind: "circle", t: "86%", l: "78%", s: 54, o: 0.18, color: "#fbbf24", blur: 12 },
    ],
  },
  {
    id: "cosmic", label: "Cosmic", category: "Cosmic",
    env: { top: "#312e81", mid: "#1e1b4b", edge: "#0f0c2e" },
    pattern: {
      backgroundImage:
        "radial-gradient(40% 30% at 20% 25%, rgba(236,72,153,0.18), transparent 70%)," +
        "radial-gradient(35% 28% at 80% 65%, rgba(34,211,238,0.16), transparent 70%)," +
        "radial-gradient(1.4px 1.4px at 30% 40%, rgba(255,255,255,0.6), transparent 65%)," +
        "radial-gradient(1px 1px at 70% 20%, rgba(255,255,255,0.45), transparent 65%)," +
        "radial-gradient(1.2px 1.2px at 50% 84%, rgba(255,255,255,0.4), transparent 65%)",
      backgroundSize: "100% 900px, 100% 900px, 260px 300px, 260px 300px, 260px 300px",
      backgroundRepeat: "repeat",
    },
    decor: [
      { kind: "icon", icon: "star", t: "10%", l: "84%", s: 22, o: 0.4, rot: 15, color: "#ffffff" },
      { kind: "circle", t: "40%", l: "12%", s: 66, o: 0.18, color: "#8b5cf6", blur: 16 },
      { kind: "icon", icon: "star", t: "68%", l: "80%", s: 26, o: 0.38, rot: -12, color: "#a5f3fc" },
    ],
  },

  /* ── CELEBRATION / LUXURY ──────────────────────────────────────────── */
  {
    id: "celebration", label: "Celebration", category: "Celebration",
    env: { top: "#6d28d9", mid: "#9333ea", edge: "#4c1d95" },
    pattern: {
      backgroundImage:
        "radial-gradient(1.6px 1.6px at 26% 30%, rgba(253,230,138,0.55), transparent 65%)," +
        "radial-gradient(1.2px 1.2px at 70% 66%, rgba(255,255,255,0.45), transparent 65%)",
      backgroundSize: "220px 260px",
      backgroundRepeat: "repeat",
    },
    decor: confettiField(0.5).slice(0, 10).concat([
      { kind: "icon", icon: "trophy", t: "6%", l: "82%", s: 26, o: 0.3, rot: 10, color: "#fde047" },
      { kind: "icon", icon: "sparkle", t: "56%", l: "14%", s: 24, o: 0.4, color: "#ffffff" },
    ] as StreakDecor[]),
  },
  {
    id: "luxe-gold", label: "Luxury", category: "Premium",
    env: { top: "#141210", mid: "#0d0c0a", edge: "#070606" },
    pattern: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(212,175,55,0.06) 0px, rgba(212,175,55,0.06) 1px, transparent 1px, transparent 46px)," +
        "repeating-linear-gradient(90deg, rgba(212,175,55,0.06) 0px, rgba(212,175,55,0.06) 1px, transparent 1px, transparent 46px)",
    },
    decor: [
      { kind: "icon", icon: "crown", t: "5%", l: "82%", s: 24, o: 0.28, rot: 8, color: "#d4af37" },
      { kind: "icon", icon: "sparkle", t: "24%", l: "14%", s: 20, o: 0.32, color: "#fde68a" },
      { kind: "icon", icon: "sparkle", t: "52%", l: "84%", s: 22, o: 0.3, color: "#d4af37" },
      { kind: "icon", icon: "sparkle", t: "78%", l: "18%", s: 18, o: 0.28, color: "#fde68a" },
    ],
  },
];

export function streakPageThemeById(id: string | null | undefined): StreakPageThemeDef | null {
  return STREAK_PAGE_THEMES.find(t => t.id === id) ?? null;
}

/* ── resolution ────────────────────────────────────────────────────────── */

export type ResolvedStreakPage = {
  env: StreakEnv;
  pattern: React.CSSProperties | null;
  decor: StreakDecor[] | null;
  /** When the "Use app theme" option is picked: the app's own background
   *  style (pattern + surface color) — the Shell paints this instead of a
   *  streak gradient. */
  appBg: React.CSSProperties | null;
};

type BizLike = {
  streak_page_theme?: string | null;
  streak_env_color?: string | null;
  streak_env_pattern?: string | null;
  background_pattern?: string | null;
  pattern_color?: string | null;
  surface_color?: string | null;
  logo_url?: string | null;
  brand_colors?: { primary: string; secondary: string; accent: string };
};

export function resolveStreakPage(b: BizLike): ResolvedStreakPage {
  const def = streakPageThemeById(b.streak_page_theme);

  if (def?.useAppBackground) {
    const surface = b.surface_color ?? null;
    const light = readableTextColor(surface) === "#18181b";
    const base = surface ?? "#fafafa";
    return {
      env: { top: base, mid: base, edge: base, light },
      pattern: null,
      decor: null,
      appBg: patternStyle(
        b.background_pattern,
        b.pattern_color ?? b.brand_colors?.primary ?? "#3b82f6",
        b.logo_url ?? null,
        b.brand_colors?.secondary ?? "#8b5cf6",
        b.brand_colors?.accent ?? "#f59e0b",
        surface,
      ) as React.CSSProperties,
    };
  }

  if (def) {
    let env = def.env;
    if (def.brandTint && b.brand_colors?.primary && /^#[0-9a-fA-F]{6}$/.test(b.brand_colors.primary)) {
      const p = b.brand_colors.primary;
      env = { top: lighten(p, 0.88), mid: lighten(p, 0.8), edge: lighten(p, 0.68), light: true };
    }
    return { env, pattern: def.pattern ?? null, decor: def.decor ?? null, appBg: null };
  }

  // Legacy / unset: exactly the pre-simplification behavior (ocean default,
  // or whatever env color + pattern the business had configured).
  const env = streakEnvColors(b.streak_env_color);
  return {
    env,
    pattern: streakEnvPatternCss(b.streak_env_pattern, !!env.light),
    decor: null,
    appBg: null,
  };
}

/* ── progress colors: default / brand / custom (#hex) ─────────────────── */

/**
 * businesses.streak_progress_mode:
 *   null/"default" → the streak theme's colors (classic fire by default)
 *   "brand"        → tonal range from the brand primary
 *   "#rrggbb"      → tonal range from a custom color, luminance-clamped so
 *                    a near-white or near-black pick still reads on the road
 */
export function resolveProgressTheme(
  mode: string | null | undefined,
  brandPrimary: string | null | undefined,
  fallback: StreakTheme,
): StreakTheme {
  if (mode === "brand") return resolveStreakTheme("brand", brandPrimary);
  if (mode && /^#[0-9a-fA-F]{6}$/.test(mode)) {
    let c = mode;
    let guard = 0;
    while (lum(c) > 0.72 && guard++ < 20) c = darken(c, 0.12);   // too light → darken
    while (lum(c) < 0.12 && guard++ < 20) c = lighten(c, 0.12);  // too dark → lift
    return resolveStreakTheme("brand", c);
  }
  return fallback;
}
