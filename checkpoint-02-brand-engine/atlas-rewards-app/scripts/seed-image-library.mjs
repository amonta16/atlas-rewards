/**
 * CP-64 — Seed the demo image library. NO API KEY NEEDED.
 *
 * Downloads the curated shot list (scripts/image-library-manifest.mjs) from
 * Openverse (openverse.org — CC-licensed images, anonymous API, no signup),
 * uploads every photo to the `image-library` Supabase bucket, and catalogs it
 * in the `image_library` table so the builder's "Choose from library" picker
 * can browse it.
 *
 * Run from the app root (checkpoint-02-brand-engine/atlas-rewards-app):
 *
 *   node scripts/seed-image-library.mjs                 # everything (~10-15 min)
 *   node scripts/seed-image-library.mjs --industry=medspa
 *   node scripts/seed-image-library.mjs --category=hero
 *   node scripts/seed-image-library.mjs --dry-run       # show the plan only
 *
 * Needs (read from .env.local — both already there):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Openverse allows 20 requests/min and 200/day anonymously; this script paces
 * itself under that and SKIPS categories that are already full, so re-running
 * is cheap and idempotent. If it ever stops early on rate limits, just run it
 * again later — it picks up where it left off. Licenses are filtered to
 * commercial-use-allowed (CC0 / PD / BY / BY-SA); each image's creator +
 * license is stored in `credit` (shown on hover in the picker).
 *
 * Bonus — local drop-ins (no internet needed at all): put your own images in
 *   scripts/library-local/<industry>/<category>/photo-name.jpg
 * (categories: hero | reward | offer) and they're uploaded too. Great for
 * client-specific shots or images a VA hand-picks.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MANIFEST } from "./image-library-manifest.mjs";

// ---------- tiny .env.local loader (no dotenv dependency) ----------
const envPath = path.join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- CLI flags ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const DRY = !!args["dry-run"];
const ONLY_INDUSTRY = args.industry || null;
const ONLY_CATEGORY = args.category || null;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BUCKET = "image-library";
const UA = "AtlasRewardsImageLibrarySeeder/1.0 (one-time demo-library setup)";
const SEARCH_PACE_MS = 3300;   // ≤ ~18 searches/min — under Openverse's 20/min
const DAILY_BUDGET = 190;      // stop before Openverse's 200/day anonymous cap
let searchesUsed = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titleCase = (s) =>
  s.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());

// ---------- Openverse (anonymous, keyless) ----------
async function openverseSearch(query) {
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
    `&license_type=commercial&category=photograph&aspect_ratio=wide` +
    `&filter_dead=true&per_page=20`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      console.warn("  … Openverse rate limit hit, waiting 65s");
      await sleep(65000);
      continue;
    }
    if (!res.ok) throw new Error(`Openverse search failed (${res.status}) for "${query}"`);
    searchesUsed++;
    return res.json();
  }
  throw new Error(`Openverse kept rate-limiting on "${query}" — re-run later; already-seeded images are skipped.`);
}

async function downloadImage(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`not an image (${type || "unknown type"})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 15 * 1024 * 1024) throw new Error("file too large (>15MB)");
  if (buffer.length < 20 * 1024) throw new Error("file suspiciously small");
  return { buffer, contentType: type.split(";")[0] };
}

function extFor(contentType, sourceUrl) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (/\.png(\?|$)/i.test(sourceUrl)) return "png";
  return "jpg";
}

// ---------- catalog helpers ----------
async function existingRows() {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("image_library")
      .select("storage_path, industry, category")
      .range(from, from + 999);
    if (error) throw new Error(`Reading image_library failed: ${error.message} — did you run cp64_image_library.sql?`);
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function storeImage({ buffer, contentType, storagePath, row }) {
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (upErr) throw new Error(`Upload failed for ${storagePath}: ${upErr.message}`);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const { error: dbErr } = await supabase
    .from("image_library")
    .upsert({ ...row, storage_path: storagePath, public_url: publicUrl }, { onConflict: "storage_path" });
  if (dbErr) throw new Error(`Catalog insert failed for ${storagePath}: ${dbErr.message}`);
}

// ---------- main ----------
async function main() {
  console.log(`\nAtlas image library seeder — Openverse edition (no API key) ${DRY ? "(dry run)" : ""}\n`);
  const rows = DRY ? [] : await existingRows();
  const seen = new Set(rows.map((r) => r.storage_path));
  const seenIds = new Set(
    [...seen].map((p) => (p.match(/openverse-([^.]+)\./) || [])[1]).filter(Boolean)
  );
  const countByCat = new Map();
  for (const r of rows) {
    const k = `${r.industry}/${r.category}`;
    countByCat.set(k, (countByCat.get(k) ?? 0) + 1);
  }

  const summary = [];
  let added = 0;

  outer:
  for (const [industry, def] of Object.entries(MANIFEST)) {
    if (ONLY_INDUSTRY && industry !== ONLY_INDUSTRY) continue;

    for (const category of ["hero", "reward", "offer"]) {
      if (ONLY_CATEGORY && category !== ONLY_CATEGORY) continue;
      const queries = def[category] ?? [];
      const target = queries.reduce((a, q) => a + q.n, 0);
      const already = countByCat.get(`${industry}/${category}`) ?? 0;

      if (!DRY && already >= target) {
        console.log(`  ✓ ${industry}/${category} already full (${already}/${target}) — skipping`);
        summary.push({ industry, category, images: already });
        continue;
      }

      let count = already;
      for (const { q, n, tags = [] } of queries) {
        if (count >= target) break;
        if (DRY) {
          console.log(`  [plan] ${industry}/${category}: "${q}" → ${n} photos`);
          count += n;
          continue;
        }
        if (searchesUsed >= DAILY_BUDGET) {
          console.warn("\n! Reached today's anonymous Openverse budget — run the script again tomorrow (or later today); it resumes automatically.");
          summary.push({ industry, category, images: count });
          break outer;
        }

        let result;
        try {
          result = await openverseSearch(q);
        } catch (e) {
          console.warn(`  ! search "${q}" failed: ${e.message}`);
          continue;
        }

        let taken = 0;
        for (const img of result.results ?? []) {
          if (taken >= n) break;
          if (!img.url || !img.id) continue;
          if (seenIds.has(String(img.id))) continue;            // used elsewhere already
          if (img.width && img.width < 1000) continue;          // too small for hero use
          try {
            const { buffer, contentType } = await downloadImage(img.url);
            const storagePath = `${industry}/${category}/openverse-${img.id}.${extFor(contentType, img.url)}`;
            if (seen.has(storagePath)) { taken++; continue; }
            const lic = [img.license?.toUpperCase(), img.license_version].filter(Boolean).join(" ");
            await storeImage({
              buffer,
              contentType,
              storagePath,
              row: {
                industry,
                category,
                title: titleCase(q),
                tags: [...new Set([...q.toLowerCase().split(/\s+/), ...tags.map((t) => t.toLowerCase())])],
                credit: `${img.creator || "Unknown creator"} · ${lic || "CC"} · Openverse`,
                source_url: img.foreign_landing_url ?? null,
                width: img.width ?? null,
                height: img.height ?? null,
                is_active: true,
                sort_order: count + taken,
              },
            });
            seen.add(storagePath);
            seenIds.add(String(img.id));
            taken++; added++; count++;
            process.stdout.write(`  + ${storagePath}\n`);
          } catch {
            // dead link / html page / giant tiff — just try the next result
          }
        }
        if (taken < n) console.warn(`  ! "${q}" only yielded ${taken}/${n} usable photos`);
        await sleep(SEARCH_PACE_MS);
      }
      summary.push({ industry, category, images: count });
    }
  }

  // ---------- local drop-in folder (works offline, no API at all) ----------
  const localRoot = path.join(process.cwd(), "scripts", "library-local");
  if (!DRY && existsSync(localRoot)) {
    for (const industry of readdirSync(localRoot)) {
      const indDir = path.join(localRoot, industry);
      if (!statSync(indDir).isDirectory()) continue;
      for (const category of readdirSync(indDir)) {
        if (!["hero", "reward", "offer"].includes(category)) continue;
        const catDir = path.join(indDir, category);
        if (!statSync(catDir).isDirectory()) continue;
        for (const file of readdirSync(catDir)) {
          const ext = path.extname(file).toLowerCase();
          if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) continue;
          const storagePath = `${industry}/${category}/local-${file}`;
          if (seen.has(storagePath)) continue;
          const contentType =
            ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
          await storeImage({
            buffer: readFileSync(path.join(catDir, file)),
            contentType,
            storagePath,
            row: {
              industry,
              category,
              title: titleCase(path.basename(file, ext)),
              tags: [industry, category, "local"],
              credit: "Your upload",
              source_url: null,
              width: null,
              height: null,
              is_active: true,
              sort_order: 0,
            },
          });
          seen.add(storagePath);
          added++;
          console.log(`  + ${storagePath} (local)`);
        }
      }
    }
  }

  console.log("\n── Summary ──────────────────────────────");
  for (const s of summary) console.log(`  ${s.industry.padEnd(14)} ${s.category.padEnd(7)} ${s.images}`);
  console.log(`\n${DRY ? "Planned" : "Added"} ${DRY ? summary.reduce((a, s) => a + s.images, 0) : added} images this run.`);
  if (!DRY) {
    console.log("Open the builder → any image field → “Choose from library” to browse them.");
    console.log("Not full yet? Just run the script again — it tops up only what's missing.\n");
  }
}

main().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
