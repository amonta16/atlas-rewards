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
import { NEUTRAL_PALETTE, cssBrandColors, dominantColors, paletteFromSeed, themeColorFromHtml, type PreviewColors } from "./colors";
import { findTags, imageCandidates, inlineCss, pageText, pickFont, serviceLinks, stylesheetLinks, teamLinks, absolutize, type ImageCandidate } from "./html";
import { fetchFirstLogo, logoCandidates, logoPixels } from "./logo";
import { extractSite, type TeamMember } from "./extract";
import { hostPhotos, type PhotoKind } from "./photos";
import { safeFetch } from "./safe-fetch";
import { previewDb, STALE_BUILD_MS, uploadLogo, uploadPhoto, type PreviewRow } from "./store";
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
  // Their own stylesheets, for the brand color when the logo and meta tags don't give one.
  const siteCss: Promise<string> = home
    ? Promise.allSettled(stylesheetLinks(home.html, home.url, 2).map((u) => safeFetch(u, { accept: "text/css,*/*;q=0.1", maxBytes: 1_500_000, onOverflow: "truncate" })))
        .then((rs) => rs.map((r) => (r.status === "fulfilled" ? r.value.body.toString("utf8") : "")).join("\n"))
    : Promise.resolve("");

  // Logo
  const candidates = ov.logoUrl ? [ov.logoUrl] : home ? logoCandidates(home.html, home.url) : [];
  const logo = candidates.length ? await fetchFirstLogo(candidates, { deadline: deadline - 120_000 }) : null;
  const logoUrl = logo && up.logo ? await up.logo(logo.png) : null;
  if (!logo) notes.push("logo: monogram");

  // Colors
  let logoSeeds: string[] = [];
  let mutedLogoSeeds: string[] = [];
  if (logo) {
    try {
      const px = await logoPixels(logo.colorPng);
      logoSeeds = dominantColors(px.data, px.channels, 2);
      // A sage/olive/taupe wordmark is still the brand: keep it as a fallback.
      if (!logoSeeds.length) mutedLogoSeeds = dominantColors(px.data, px.channels, 2, { minSaturation: 0.06 });
    } catch { /* ignore */ }
  }
  // Order: admin's pick → <meta theme-color> → the logo's colors → the logo's muted color
  // → colors the site's CSS names as its brand → neutral.
  const theme = home ? themeColorFromHtml(home.html) : null;
  let cssSeeds: string[] = [];
  if (!ov.primary && !theme && !logoSeeds.length && !mutedLogoSeeds.length && home) {
    cssSeeds = cssBrandColors(`${inlineCss(home.html)}\n${await siteCss}`, 2);
  }
  const seed = ov.primary || theme || logoSeeds[0] || mutedLogoSeeds[0] || cssSeeds[0] || null;
  const second = seed === logoSeeds[0] ? logoSeeds[1] : seed === mutedLogoSeeds[0] ? mutedLogoSeeds[1] : seed === cssSeeds[0] ? cssSeeds[1] : logoSeeds[0];
  // Muted colors are allowed only when they're clearly the site's own (logo or named CSS brand color).
  const allowMuted = !!seed && (seed === mutedLogoSeeds[0] || seed === cssSeeds[0]);
  const colors = paletteFromSeed(seed, ov.secondary || second || null, { allowMuted });
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
  const heroCandidates = pickHeroCandidates(site, images, home ? ogImage(home.html, home.url) : null);
  const wanted: Array<{ url: string; kind: PhotoKind }> = heroCandidates.map((url) => ({ url, kind: "hero" as const }));
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
  // First candidate that downloaded and passed the size/shape checks.
  const heroUrl = heroCandidates.map((u) => hosted.get(u)).find(Boolean) ?? null;
  if (!heroUrl) notes.push("hero: example");

  return { logoUrl, colors, treatments: finalTreatments, treatmentsAreExamples: examples, notes, heroUrl, font, team, about: site?.about ?? null };
}

/**
 * Banner photo candidates, best first: the model's pick, their share image, then
 * their biggest home-page photo. Never a team member's photo (a headshot makes a
 * bad banner and isn't what the app is about) and nothing from the team page.
 */
export function pickHeroCandidates(
  site: { heroSource: string | null; team: TeamMember[] } | null,
  images: ImageCandidate[],
  og: string | null,
): string[] {
  const banned = new Set<string>(site?.team.map((m) => m.photo_url).filter((u): u is string => !!u) ?? []);
  const names = (site?.team ?? []).map((m) => m.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !/^(dr|mr|mrs|ms)\.?$/.test(w))).flat();
  for (const im of images) {
    const text = `${im.alt} ${im.context} ${im.file}`.toLowerCase();
    if (im.page === "team" || /headshot|portrait|team|staff|provider|injector|\bdr\b|\bmd\b|\brn\b|np-?c/.test(text) || names.some((n) => text.includes(n))) banned.add(im.url);
  }
  const wide = images.filter((i) => i.page === "home" && (i.width ?? 0) >= 900).map((i) => i.url);
  const bg = images.filter((i) => i.page === "home" && i.alt === "background").map((i) => i.url);
  const out: string[] = [];
  for (const u of [site?.heroSource ?? null, og, ...bg, ...wide]) {
    if (u && !banned.has(u) && !out.includes(u)) out.push(u);
    if (out.length >= 3) break;
  }
  return out;
}

/** Builds the row and marks it ready. Never throws; never leaves a row "building". */
export async function buildPreview(id: string, ov: BuildOverrides = {}): Promise<void> {
  const db = previewDb();
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
  const { error } = await previewDb().from("app_previews").update({
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
