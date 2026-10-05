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
