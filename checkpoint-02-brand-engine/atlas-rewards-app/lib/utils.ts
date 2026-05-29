import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Build a public-facing URL for a business sub-account.
 *
 * Handles both local dev (lvh.me:3000, http) and production (https, no
 * port). Pass the root domain (from NEXT_PUBLIC_ROOT_DOMAIN) and optional
 * slug + path. CP-36: extracted because :3000 was hardcoded all over.
 */
export function businessUrl(
  rootDomain: string,
  opts: { slug?: string; path?: string } = {},
): string {
  const isLocal = rootDomain.includes("lvh.me") || rootDomain.includes("localhost");
  const proto = isLocal ? "http" : "https";
  const port = isLocal ? ":3000" : "";
  const host = opts.slug ? `${opts.slug}.${rootDomain}` : rootDomain;
  const path = opts.path ?? "";
  return `${proto}://${host}${port}${path}`;
}

/** Convert a hex color (#rrggbb) to an "H S% L%" string Tailwind/CSS vars want. */
export function hexToHsl(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hh = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hh = (b - r) / d + 2; break;
      case b: hh = (r - g) / d + 4; break;
    }
    hh /= 6;
  }
  return `${Math.round(hh * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
