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
      window.localStorage.setItem(
        `atlas-brand-${slug}`,
        JSON.stringify({ primary, name, logo_url: logoUrl ?? null }),
      );
    } catch {
      // Quota exceeded / Safari private mode — silently ignore.
    }
  }, [slug, primary, name, logoUrl]);
  return null;
}
