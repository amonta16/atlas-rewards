"use client";
/**
 * BrandCacheWriter — CP-42
 *
 * Tiny effect-only client component that writes the current business's
 * brand color + name into localStorage on every render. Read back by
 * <BrandedLoading /> so loading.tsx files can theme themselves.
 *
 * No DOM output. Mount this from the per-business server layout.
 */
import { useEffect } from "react";

export function BrandCacheWriter({
  slug,
  primary,
  name,
  logoUrl,
}: {
  slug: string;
  primary: string;
  name: string;
  logoUrl?: string | null;
}) {
  useEffect(() => {
    try {
      const payload = JSON.stringify({ primary, name, logo_url: logoUrl ?? null });
      window.localStorage.setItem(`atlas-brand-${slug}`, payload);
      // CP-53: also cache under a slug-agnostic key. On the installed PWA /
      // subdomain (e.g. starbucks.atlas-engine.app), the loading screen sees
      // a path of /app/... with no slug, so the per-slug lookup misses and it
      // fell back to the generic Atlas screen. This "last business" key lets
      // BrandedLoading theme correctly regardless of how the URL is shaped.
      window.localStorage.setItem("atlas-brand-last", payload);
    } catch {
      // Quota exceeded / Safari private mode — silently ignore.
    }
  }, [slug, primary, name, logoUrl]);
  return null;
}
