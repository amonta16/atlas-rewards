"use client";
/**
 * BrandedLoading — CP-42
 *
 * Client-side loading screen that picks up the per-business brand color
 * from localStorage (cached by the customer layout). This lets the
 * Next.js loading.tsx convention render a THEMED loading screen even
 * though the file itself is a server component with no access to URL
 * params or the business record.
 *
 * Cache shape:
 *   localStorage["atlas-brand-<slug>"] = JSON.stringify({
 *     primary:  "#0a3d62",
 *     name:     "Demo Rewards Co.",
 *     logo_url: "https://…/logo.png" | null,
 *   })
 *
 * The layout writes this on every render (cheap). First-time visitors
 * see the Atlas default for a frame; everyone else (PWA users, repeat
 * visitors) sees the right brand instantly.
 */
import { useEffect, useState } from "react";
import { AtlasLoading } from "./atlas-loading";

type CachedBrand = { primary?: string; name?: string; logo_url?: string | null };

function readCachedBrand(): CachedBrand | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  // Match the first non-empty path segment as the business slug.
  // e.g. /demo, /demo/app/rewards, /frozen-yogurt/manage
  const m = path.match(/^\/([^\/]+)/);
  if (!m) return null;
  const slug = m[1];
  // Reserved subdomains / non-business routes — skip the cache lookup.
  const RESERVED = new Set([
    "agency", "admin", "api", "login", "signup", "accept-invitation",
    "qr", "_next", "favicon.ico", "manifest.json",
  ]);
  if (RESERVED.has(slug)) return null;
  try {
    const raw = window.localStorage.getItem(`atlas-brand-${slug}`);
    return raw ? (JSON.parse(raw) as CachedBrand) : null;
  } catch {
    return null;
  }
}

export function BrandedLoading({
  title = "One sec…",
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  // Hydrate brand on the very next tick so the first paint is consistent
  // (server render has no localStorage). Avoids a flash from default to
  // brand color.
  const [brand, setBrand] = useState<CachedBrand | null>(null);
  useEffect(() => {
    setBrand(readCachedBrand());
  }, []);

  return (
    <AtlasLoading
      primary={brand?.primary}
      title={brand?.name ? `Loading ${brand.name}` : title}
      subtitle={subtitle}
    />
  );
}
