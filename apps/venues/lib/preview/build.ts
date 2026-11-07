/**
 * lib/preview/build.ts — CP-232 · build one preview (runs after the response, via waitUntil).
 *
 *   website HTML ─┬─ logo (apple-touch-icon → og:image → icon → <img logo>) → PNG → storage
 *                 ├─ colors (theme-color → logo's dominant colors) → AA-checked palette
 *                 └─ treatments (page text [+ a /services page] → Claude → zod)
 *
 * Every step is optional. Whatever fails falls back (monogram, neutral palette,
 * example menu) and the row ALWAYS ends "ready", so the visitor gets an app.
 * `build_error` keeps a short note of what fell back, for the admin page.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { NEUTRAL_PALETTE, dominantColors, paletteFromSeed, themeColorFromHtml, type PreviewColors } from "./colors";
import { pageText, serviceLinks } from "./html";
import { fetchFirstLogo, logoCandidates, logoPixels } from "./logo";
import { safeFetch } from "./safe-fetch";
import { STALE_BUILD_MS, uploadLogo, type PreviewRow } from "./store";
import { EXAMPLE_TREATMENTS, extractTreatments, type PreviewTreatment } from "./treatments";

export type BuildOverrides = {
  logoUrl?: string | null;
  primary?: string | null;
  secondary?: string | null;
  treatments?: PreviewTreatment[] | null;
};

const BUDGET_MS = 50_000;

async function fetchHtml(url: string): Promise<{ html: string; url: string } | null> {
  const r = await safeFetch(url, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", onOverflow: "truncate" });
  if (r.contentType && !/html|xml|text\/plain/.test(r.contentType)) return null;
  return { html: r.body.toString("utf8"), url: r.url };
}

/** The heavy lifting. Pure of DB writes so the admin preview and tests can reuse it. */
export async function computePreview(input: { businessName: string; website: string | null; slug: string }, ov: BuildOverrides = {}, opts: { upload?: (png: Buffer) => Promise<string | null> } = {}) {
  const deadline = Date.now() + BUDGET_MS;
  const notes: string[] = [];

  let page: { html: string; url: string } | null = null;
  if (input.website) {
    try { page = await fetchHtml(input.website); } catch (e) { notes.push(`site: ${e instanceof Error ? e.message : "failed"}`); }
    if (!page && !notes.length) notes.push("site: not html");
  } else notes.push("no website");

  // Logo
  const candidates = ov.logoUrl ? [ov.logoUrl] : page ? logoCandidates(page.html, page.url) : [];
  const logo = candidates.length ? await fetchFirstLogo(candidates, { deadline: deadline - 25_000 }) : null;
  let logoUrl: string | null = null;
  if (logo && opts.upload) logoUrl = await opts.upload(logo.png);
  if (!logo) notes.push("logo: monogram");

  // Colors
  let logoSeeds: string[] = [];
  if (logo) {
    try { const px = await logoPixels(logo.png); logoSeeds = dominantColors(px.data, px.channels, 2); } catch { /* ignore */ }
  }
  const seed = ov.primary || (page ? themeColorFromHtml(page.html) : null) || logoSeeds[0] || null;
  const colors: PreviewColors = paletteFromSeed(seed, ov.secondary || (seed === logoSeeds[0] ? logoSeeds[1] : logoSeeds[0]) || null);
  if (!seed || colors.primary === NEUTRAL_PALETTE.primary) notes.push("colors: neutral");

  // Treatments
  let treatments: PreviewTreatment[] | null = ov.treatments?.length ? ov.treatments : null;
  if (!treatments && page) {
    let text = pageText(page.html, 30_000);
    const links = serviceLinks(page.html, page.url, 2);
    if (links.length && Date.now() < deadline - 30_000) {
      const extra = await Promise.allSettled(links.map((l) => fetchHtml(l)));
      for (const r of extra) if (r.status === "fulfilled" && r.value) text += `\n\n${pageText(r.value.html, 20_000)}`;
    }
    const left = deadline - Date.now();
    if (left > 5000) treatments = await extractTreatments(text, input.businessName, { timeoutMs: Math.min(25_000, left - 2000) });
  }
  const examples = !treatments;
  if (examples) notes.push("treatments: examples");

  return { logoUrl, colors, treatments: treatments ?? EXAMPLE_TREATMENTS, treatmentsAreExamples: examples, notes };
}

/** Builds the row and marks it ready. Never throws; never leaves a row "building". */
export async function buildPreview(id: string, ov: BuildOverrides = {}): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from("app_previews").select("id, slug, business_name, website, status").eq("id", id).maybeSingle();
  const row = data as Pick<PreviewRow, "id" | "slug" | "business_name" | "website" | "status"> | null;
  if (!row) return;
  try {
    const r = await computePreview({ businessName: row.business_name, website: row.website, slug: row.slug }, ov, { upload: (png) => uploadLogo(row.slug, png) });
    const { error } = await db.from("app_previews").update({
      logo_url: r.logoUrl,
      logo_is_monogram: !r.logoUrl,
      colors: r.colors,
      treatments: r.treatments,
      treatments_are_examples: r.treatmentsAreExamples,
      status: "ready",
      built_at: new Date().toISOString(),
      build_error: r.notes.join("; ").slice(0, 500) || null,
    }).eq("id", id);
    if (error) throw error;
  } catch (e) {
    console.error("[preview] build failed", id, e);
    await finishWithFallbacks(id, e instanceof Error ? e.message : "build failed");
  }
}

/** Last resort: a usable preview from what we already know (name only). */
export async function finishWithFallbacks(id: string, reason: string): Promise<void> {
  const { error } = await createAdminClient().from("app_previews").update({
    logo_is_monogram: true,
    colors: NEUTRAL_PALETTE,
    treatments: EXAMPLE_TREATMENTS,
    treatments_are_examples: true,
    status: "ready",
    built_at: new Date().toISOString(),
    build_error: `fallback: ${reason}`.slice(0, 500),
  }).eq("id", id).eq("status", "building");
  if (error) console.error("[preview] fallback update failed", id, error.message);
}

export function isStale(row: Pick<PreviewRow, "status" | "updated_at">): boolean {
  return row.status === "building" && Date.now() - new Date(row.updated_at).getTime() > STALE_BUILD_MS;
}
