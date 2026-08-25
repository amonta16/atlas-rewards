"use client";
import { usePathname } from "next/navigation";

/**
 * useAppBase — CP-106
 *
 * Every customer surface is reachable two ways, and this is the single thing
 * that kept getting hard-coded wrong:
 *
 *   path form        atlasrewards.app/<slug>/app/rewards
 *   subdomain / PWA  <slug>.atlasrewards.app/app/rewards   (middleware rewrites)
 *
 * `usePathname()` returns the BROWSER path, so on the installed app it is
 * `/app/...` with no slug in it. Components that hard-coded
 * `/${slug}/app/...` therefore threw PWA users into the *other* URL space
 * mid-session — the page reloaded, the branded splash appeared, and the app
 * came back at a different address. That is the "loading somewhere else, then
 * reroutes" Andrew reported.
 *
 * Same regex the bottom nav has used since CP-45 (`/app` anchored at a segment
 * boundary so a slug like "apple-spa" can't false-match). Pair it with
 * next/link — a plain <a> to an in-app route is a full document reload.
 */
export function useAppBase(slug?: string | null): string {
  const pathname = usePathname();
  const m = pathname?.match(/^(.*?\/app)(\/|$)/);
  if (m) return m[1];
  // Rendered outside the customer shell (rare) — fall back to the path form.
  return slug ? `/${slug}/app` : "/app";
}
