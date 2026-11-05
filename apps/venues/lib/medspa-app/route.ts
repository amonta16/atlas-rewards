/**
 * CP-193 · the one test every route uses to hand a med spa to its own screens
 * (components/medspa-app). Keep it the only branch point: a page that serves
 * med spas starts with `if (isMedspaApp(business)) return <MedspaX … />`.
 */
import { resolvePreset } from "@/lib/layout-presets";
import type { Business } from "@/lib/types/database";

export function isMedspaApp(b: Pick<Business, "layout_preset">): boolean {
  return resolvePreset(b.layout_preset) === "medspa";
}

/**
 * One med spa guest app: the one at med.atlas-engine.app (apps/medspa). When
 * this returns a URL the venue app sends the visitor there. The session cookie
 * is shared across *.atlas-engine.app, so signed-in patients stay signed in.
 * Set NEXT_PUBLIC_MEDSPA_LIVE=0 to fall back to the old screens.
 */
export function medspaAppUrl(b: Pick<Business, "layout_preset">, slug: string, path = ""): string | null {
  if (!isMedspaApp(b) || process.env.NEXT_PUBLIC_MEDSPA_LIVE === "0") return null;
  const host = (process.env.NEXT_PUBLIC_MEDSPA_HOST ?? "med.atlas-engine.app").replace(/^https?:\/\//, "");
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}/${slug}${path}`;
}
