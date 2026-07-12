/**
 * CP-64 — Seed the demo image library (Pexels edition).
 *
 * Downloads the curated shot list (scripts/image-library-manifest.mjs) from
 * Pexels, uploads every photo to the `image-library` Supabase bucket, and
 * catalogs it in the `image_library` table so the builder's
 * "Choose from library" picker can browse it.
 *
 * Run from the app root (checkpoint-02-brand-engine/atlas-rewards-app):
 *
 *   node scripts/seed-image-library.mjs                 # everything (a few minutes)
 *   node scripts/seed-image-library.mjs --industry=medspa
 *   node scripts/seed-image-library.mjs --category=hero
 *   node scripts/seed-image-library.mjs --dry-run       # show the plan only
 *
 * Needs (read from .env.local or the environment):
 *   NEXT_PUBLIC_SUPABASE_URL      — already in .env.local
 *   SUPABASE_SERVICE_ROLE_KEY     — already in .env.local
 *   PEXELS_API_KEY                — free key from https://www.pexels.com/api/
 *
 * Idempotent + resumable: categories that are already full are skipped, and
 * photos already in the library are never duplicated — re-running after adding
 * manifest queries only fetches what's new. Pexels photos are free for
 * commercial use, no attribution required (we store credit anyway).
 *
 * Bonus — local drop-ins: put your own images in
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
const PEXELS_KEY = process.env.PEXELS_API_KEY;

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
if (!PEXELS_KEY && !DRY) {
  console.error(
    "✗ Missing PEXELS_API_KEY.\n" +
      "  Get a free key at https://www.pexels.com/api/ (sign up → Your API Key),\n" +
      "  then add this line to .env.local and re-run:\n" +
      "  PEXELS_API_KEY=your-key-here"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const BUCKET = "image-library";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const titleCase = (s) =>
  s.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());

// ---------- Pexels ----------
async function pexelsSearch(query, perPage) {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=${perPage}&orientation=landscape&size=large`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
    if (res.status === 429) {
      console.warn("  … Pexels rate limit hit, waiting 15s");
      await sleep(15000);
      continue;
    }
    if (res.status === 401) {
      throw new Error("Pexels rejected the API key (401). Double-check PEXELS_API_KEY in .env.local — no quotes, no spaces.");
    }
    if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}"`);
    return res.json();
  }
  throw new Error(`Pexels kept rate-limiting on "${query}" — re-run in a few minutes; it resumes where it left off.`);
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
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
  console.log(`\nAtlas image library seeder ${DRY ? "(dry run)" : ""}\n`);
  const rows = DRY ? [] : await existingRows();
  const seen = new Set(rows.map((r) => r.storage_path));
  const seenPhotoIds = new Set(
    [...seen].map((p) => (p.match(/pexels-(\d+)\./) || [])[1]).filter(Boolean)
  );
  const countByCat = new Map();
  for (const r of rows) {
    const k = `${r.industry}/${r.category}`;
    countByCat.set(k, (countByCat.get(k) ?? 0) + 1);
  }

  const summary = [];
  let added = 0;

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
        let result;
        try {
          result = await pexelsSearch(q, Math.min(n * 3, 30));
        } catch (e) {
          if (/401/.test(e.message)) throw e; // bad key — stop entirely, message is clear
          console.warn(`  ! search "${q}" failed: ${e.message}`);
          continue;
        }
        let taken = 0;
        for (const photo of result.photos ?? []) {
          if (taken >= n) break;
          const storagePath = `${industry}/${category}/pexels-${photo.id}.jpg`;
          if (seen.has(storagePath)) { taken++; continue; }      // already seeded by this query
          if (seenPhotoIds.has(String(photo.id))) continue;      // used elsewhere — pick a different one
          const src = photo.src?.large2x || photo.src?.large || photo.src?.original;
          if (!src) continue;
          try {
            const buffer = await downloadImage(src);
            await storeImage({
              buffer,
              contentType: "image/jpeg",
              storagePath,
              row: {
                industry,
                category,
                title: titleCase(q),
                tags: [...new Set([...q.toLowerCase().split(/\s+/), ...tags.map((t) => t.toLowerCase())])],
                credit: photo.photographer ? `Photo by ${photo.photographer} · Pexels` : "Pexels",
                source_url: photo.url ?? null,
                width: photo.width ?? null,
                height: photo.height ?? null,
                is_active: true,
                sort_order: count + taken,
              },
            });
            seen.add(storagePath);
            seenPhotoIds.add(String(photo.id));
            taken++; added++; count++;
            process.stdout.write(`  + ${storagePath}\n`);
          } catch (e) {
            console.warn(`  ! skipping one result for "${q}": ${e.message}`);
          }
        }
        if (taken < n) console.warn(`  ! "${q}" only yielded ${taken}/${n} usable photos`);
        await sleep(350); // stay well inside Pexels' free-tier rate limit
      }
      summary.push({ industry, category, images: count });
    }
  }

  // ---------- local drop-in folder ----------
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
