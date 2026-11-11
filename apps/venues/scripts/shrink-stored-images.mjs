/**
 * CP-241 — Shrink images already in Supabase Storage, in place.
 *
 * The apps used to resize every photo on the fly through Supabase's paid
 * image-transform endpoint (billed per origin image, 100 included on Pro).
 * Now they show the stored file as-is, so the stored file has to be small.
 * New uploads are shrunk in the browser (shrinkImage); this script does the
 * same for everything uploaded before that.
 *
 * Each image over --min-kb is downloaded, auto-rotated, fitted inside
 * 1600×1600 (logos 1024), re-encoded, and uploaded back to THE SAME PATH, so
 * every URL saved in the database keeps working. The original is saved to
 * --backup first. A file is only replaced when the new one is at least 20%
 * smaller. SVG / GIF / non-images are never touched.
 *
 * Run from apps/venues:
 *   node scripts/shrink-stored-images.mjs                      # dry run: list what would change
 *   node scripts/shrink-stored-images.mjs --sample=5           # dry run + really encode 5, report sizes (no upload)
 *   node scripts/shrink-stored-images.mjs --apply              # do it
 *   node scripts/shrink-stored-images.mjs --apply --bucket=reward-images
 * Options: --min-kb=400  --backup=./storage-backup  --env=path/to/.env.local
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env or .env.local).
 * Safe to re-run: already-small files fall under --min-kb and are skipped.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const APPLY = !!args.apply;
const SAMPLE = args.sample ? Number(args.sample) : 0;
const MIN_BYTES = Number(args["min-kb"] ?? 400) * 1024;
const BACKUP = path.resolve(String(args.backup ?? "./storage-backup"));
const ONLY = args.bucket ? String(args.bucket) : null;

const BUCKETS = {
  "reward-images": 1600, "offer-images": 1600, "membership-images": 1600,
  "news-images": 1600, "business-heroes": 1600, "folder-covers": 1600,
  "image-library": 1600, "site-reviews": 1800, "business-logos": 1024,
};

// ---------- tiny .env loader ----------
const envPath = path.resolve(String(args.env ?? ".env.local"));
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

async function listAll(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const e of data) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...await listAll(bucket, p));        // folder
      else out.push({ path: p, size: e.metadata?.size ?? 0, type: e.metadata?.mimetype ?? "" });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function encode(buf, maxEdge) {
  const img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const fitted = img.resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true });
  if (meta.format === "webp") return { out: await fitted.webp({ quality: 80 }).toBuffer(), type: "image/webp" };
  if (meta.hasAlpha) {
    const { isOpaque } = await sharp(buf).stats();
    if (!isOpaque) return { out: await fitted.png({ palette: true, quality: 85, compressionLevel: 9 }).toBuffer(), type: "image/png" };
  }
  // JPEG / opaque PNG / HEIC → JPEG. The path keeps its old extension; the
  // stored content-type is what browsers go by.
  return { out: await fitted.flatten({ background: "#ffffff" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer(), type: "image/jpeg" };
}

const kb = (n) => `${Math.round(n / 1024)} KB`;
let before = 0, after = 0, done = 0, skipped = 0, failed = 0, sampled = 0;

for (const [bucket, maxEdge] of Object.entries(BUCKETS)) {
  if (ONLY && bucket !== ONLY) continue;
  let objs;
  try { objs = await listAll(bucket); } catch (e) { console.warn(`! ${e.message}`); continue; }
  const todo = objs.filter((o) => o.size > MIN_BYTES && /^image\/(png|jpe?g|webp|heic|heif|avif)$/i.test(o.type));
  const mb = todo.reduce((s, o) => s + o.size, 0) / 1048576;
  console.log(`\n${bucket}: ${objs.length} files, ${todo.length} over ${kb(MIN_BYTES)} (${mb.toFixed(1)} MB)`);

  for (const o of todo) {
    if (!APPLY && sampled >= SAMPLE) { console.log(`  would shrink ${o.path} (${kb(o.size)})`); continue; }
    try {
      const { data, error } = await db.storage.from(bucket).download(o.path);
      if (error) throw new Error(error.message);
      const buf = Buffer.from(await data.arrayBuffer());
      const { out, type } = await encode(buf, maxEdge);
      if (out.length > buf.length * 0.8) { skipped++; console.log(`  skip ${o.path} (${kb(buf.length)} → ${kb(out.length)}, not worth it)`); continue; }
      if (!APPLY) { sampled++; before += buf.length; after += out.length; console.log(`  sample ${o.path}: ${kb(buf.length)} → ${kb(out.length)}`); continue; }
      const bp = path.join(BACKUP, bucket, o.path);
      mkdirSync(path.dirname(bp), { recursive: true });
      writeFileSync(bp, buf);
      const up = await db.storage.from(bucket).upload(o.path, out, { upsert: true, contentType: type, cacheControl: "31536000" });
      if (up.error) throw new Error(up.error.message);
      before += buf.length; after += out.length; done++;
      console.log(`  ✓ ${o.path}: ${kb(buf.length)} → ${kb(out.length)}`);
    } catch (e) {
      failed++; console.warn(`  ✗ ${o.path}: ${e.message}`);
    }
  }
}

console.log(`\n${APPLY ? "Shrunk" : "Sampled"} ${APPLY ? done : sampled}, skipped ${skipped}, failed ${failed}. ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
if (APPLY) console.log(`Originals backed up under ${BACKUP}`);
else console.log("Dry run — nothing uploaded. Add --apply to write.");
