/**
 * lib/preview/build.ts — CP-232/233 · build one preview (runs after the response, via waitUntil).
 *
 *   home page ─┬─ logo (apple-touch-icon → og:image → icon → <img logo>) → PNG → storage
 *              ├─ colors (theme-color → logo's dominant colors) → AA-checked palette
 *              ├─ font (the Google font their site loads)
 *              └─ + up to 2 service/pricing pages + 1 team/about page
 *                   → text + numbered photo list → Claude → treatments (with descriptions
 *                     and photos), hero photo, team, about → their photos re-hosted
 *
 * Every step is optional. Whatever fails falls back (monogram, neutral palette,
 * example menu, our photos) and the row ALWAYS ends "ready", so the visitor gets
 * an app. `build_error` keeps a short note of what fell back, for the admin page.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { NEUTRAL_PALETTE, dominantColors, paletteFromSeed, themeColorFromHtml, type PreviewColors } from "./colors";
import { findTags, imageCandidates, pageText, pickFont, serviceLinks, teamLinks, absolutize, type ImageCandidate } from "./html";
import { fetchFirstLogo, logoCandidates, logoPixels } from "./logo";
import { extractSite, type TeamMember } from "./extract";
import { hostPhotos, type PhotoKind } from "./photos";
import { safeFetch } from "./safe-fetch";
import { STALE_BUILD_MS, uploadLogo, uploadPhoto, type PreviewRow } from "./store";
import { EXAMPLE_TREATMENTS, type PreviewTreatment } from "./treatments";

export type BuildOverrides = {
  logoUrl?: string | null;
  primary?: string | null;
  secondary?: string | null;
  treatments?: PreviewTreatment[] | null;
};

/** Whole build, including the model call and photo uploads. Inside the route's 300 s limit with room to spare. */
const BUDGET_MS = 150_000;

async function fetchHtml(url: string): Promise<{ html: string; url: string } | null> {
  const r = await safeFetch(url, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", onOverflow: "truncate" });
  if (r.contentType && !/html|xml|text\/plain/.test(r.contentType)) return null;
  return { html: r.body.toString("utf8"), url: r.url };
}

function ogImage(html: string, base: string): string | null {
  const t = findTags(html, ["meta"]).find((m) => ["og:image", "og:image:url", "og:image:secure_url"].includes((m.attrs.property ?? m.attrs.name ?? "").toLowerCase()));
  return absolutize(t?.attrs.content, base);
}

export type ComputedPreview = {
  logoUrl: string | null; colors: PreviewColors; treatments: PreviewTreatment[]; treatmentsAreExamples: boolean; notes: string[];
  heroUrl: string | null; font: string | null; team: TeamMember[]; about: string | null;
};

type Uploaders = {
  logo?: (png: Buffer) => Promise<string | null>;
  photo?: (jpeg: Buffer, kind: PhotoKind) => Promise<string | null>;
};

/** The heavy lifting. No DB writes, so the admin route and tests can reuse it. */
export async function computePreview(input: { businessName: string; website: string | null; slug: string }, ov: BuildOverrides = {}, up: Uploaders = {}): Promise<ComputedPreview> {
  const deadline = Date.now() + BUDGET_MS;
  const notes: string[] = [];

  let home: { html: string; url: string } | null = null;
  if (input.website) {
    try { home = await fetchHtml(input.website); } catch (e) { notes.push(`site: ${e instanceof Error ? e.message : "failed"}`); }
    if (!home && !notes.length) notes.push("site: not html");
  } else notes.push("no website");

  // More pages, fetched while the logo is processed.
  const morePages: Promise<Array<{ html: string; url: string; label: string }>> = home
    ? Promise.allSettled([
        ...serviceLinks(home.html, home.url, 2).map((u) => fetchHtml(u).then((p) => (p ? { ...p, label: "services" } : null))),
        ...teamLinks(home.html, home.url, 1).map((u) => fetchHtml(u).then((p) => (p ? { ...p, label: "team" } : null))),
      ]).then((rs) => rs.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])))
    : Promise.resolve([]);

  // Logo
  const candidates = ov.logoUrl ? [ov.logoUrl] : home ? logoCandidates(home.html, home.url) : [];
  const logo = candidates.length ? await fetchFirstLogo(candidates, { deadline: deadline - 120_000 }) : null;
  const logoUrl = logo && up.logo ? await up.logo(logo.png) : null;
  if (!logo) notes.push("logo: monogram");

  // Colors
  let logoSeeds: string[] = [];
  if (logo) {
    try { const px = await logoPixels(logo.png); logoSeeds = dominantColors(px.data, px.channels, 2); } catch { /* ignore */ }
  }
  const seed = ov.primary || (home ? themeColorFromHtml(home.html) : null) || logoSeeds[0] || null;
  const colors = paletteFromSeed(seed, ov.secondary || (seed === logoSeeds[0] ? logoSeeds[1] : logoSeeds[0]) || null);
  if (!seed || colors.primary === NEUTRAL_PALETTE.primary) notes.push("colors: neutral");

  // Font
  const font = home ? pickFont(home.html) : null;

  // Read the site
  const pages = home ? [{ ...home, label: "home" }, ...(await morePages)] : [];
  let text = "";
  const images: ImageCandidate[] = [];
  for (const p of pages) {
    text += `\n\n=== page: ${p.label} (${p.url}) ===\n${pageText(p.html, p.label === "home" ? 20_000 : 15_000)}`;
    for (const im of imageCandidates(p.html, p.url, p.label, p.label === "home" ? 25 : 15)) {
      if (images.length < 50 && !images.some((x) => x.url === im.url)) images.push(im);
    }
  }
  const left = deadline - Date.now();
  const site = pages.length && left > 20_000 ? await extractSite(text, images, input.businessName, { timeoutMs: Math.min(70_000, left - 15_000) }) : null;
  if (pages.length && !site) notes.push("site read: none");

  let treatments: PreviewTreatment[] | null = ov.treatments?.length ? ov.treatments : site?.treatments.length ? site.treatments : null;
  const examples = !treatments;
  if (examples) { treatments = EXAMPLE_TREATMENTS; notes.push("treatments: examples"); }

  // Their photos → our storage
  const heroSource = site?.heroSource ?? (home ? ogImage(home.html, home.url) : null);
  const wanted: Array<{ url: string; kind: PhotoKind }> = [];
  if (heroSource) wanted.push({ url: heroSource, kind: "hero" });
  for (const t of treatments!.slice(0, 10)) if (t.image_url) wanted.push({ url: t.image_url, kind: "treatment" });
  for (const m of site?.team ?? []) if (m.photo_url) wanted.push({ url: m.photo_url, kind: "team" });
  const hosted = up.photo && wanted.length && Date.now() < deadline - 5000
    ? await hostPhotos(wanted, up.photo, { deadline: deadline - 5000 })
    : new Map<string, string>();

  const finalTreatments = treatments!.map((t) => {
    const { image_url, ...rest } = t;
    const h = image_url ? hosted.get(image_url) : undefined;
    return h ? { ...rest, image_url: h } : rest;
  });
  const team = (site?.team ?? []).map((m) => ({ ...m, photo_url: m.photo_url ? hosted.get(m.photo_url) ?? null : null }));
  const heroUrl = heroSource ? hosted.get(heroSource) ?? null : null;
  if (!heroUrl) notes.push("hero: example");

  return { logoUrl, colors, treatments: finalTreatments, treatmentsAreExamples: examples, notes, heroUrl, font, team, about: site?.about ?? null };
}

/** Builds the row and marks it ready. Never throws; never leaves a row "building". */
export async function buildPreview(id: string, ov: BuildOverrides = {}): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from("app_previews").select("id, slug, business_name, website, status").eq("id", id).maybeSingle();
  const row = data as Pick<PreviewRow, "id" | "slug" | "business_name" | "website" | "status"> | null;
  if (!row) return;
  try {
    const r = await computePreview({ businessName: row.business_name, website: row.website, slug: row.slug }, ov, {
      logo: (png) => uploadLogo(row.slug, png),
      photo: (jpeg, kind) => uploadPhoto(row.slug, jpeg, kind),
    });
    const { error } = await db.from("app_previews").update({
      logo_url: r.logoUrl,
      logo_is_monogram: !r.logoUrl,
      colors: r.colors,
      treatments: r.treatments,
      treatments_are_examples: r.treatmentsAreExamples,
      hero_url: r.heroUrl,
      font_family: r.font,
      team: r.team,
      about: r.about,
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
