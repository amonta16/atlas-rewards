/**
 * CP-176 — Venue photos for the landing page (Pexels).
 *
 * Downloads one portrait photo per venue type into public/landing/venues/
 * and writes lib/landing/venue-photos.json, which the landing page's venue
 * gallery merges in automatically (lib/landing/venues.ts).
 *
 * Run from the app root (checkpoint-02-brand-engine/atlas-rewards-app):
 *
 *   node scripts/fetch-landing-photos.mjs                 # fetch every venue type
 *   node scripts/fetch-landing-photos.mjs --list=karts    # show 8 candidates for one type
 *   node scripts/fetch-landing-photos.mjs --pick=karts:3  # use candidate #3 instead
 *   node scripts/fetch-landing-photos.mjs --only=golfsim  # (re)fetch one type
 *
 * Needs PEXELS_API_KEY (already in .env.local — same key the CP-64 image
 * library seeder uses). Pexels photos are free for commercial use; we keep
 * the photographer credit in the JSON anyway.
 *
 * Look at the downloaded files before you deploy — if one is off, run
 * --list for that key, then --pick a better one.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.PEXELS_API_KEY;
if (!KEY) {
  console.error("✗ Missing PEXELS_API_KEY in .env.local");
  process.exit(1);
}

/** key → label on the site + Pexels search query. */
const VENUES = {
  cages: { label: "Batting cages", q: "batting cage baseball hitting" },
  karts: { label: "Go-karts", q: "go kart racing track" },
  minigolf: { label: "Mini golf", q: "mini golf putting" },
  trampoline: { label: "Trampoline parks", q: "trampoline park jumping" },
  golfsim: { label: "Golf simulators", q: "indoor golf simulator" },
  laser: { label: "Laser tag", q: "laser tag neon" },
  bowling: { label: "Bowling", q: "bowling alley friends" },
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const OUT_DIR = path.join(process.cwd(), "public", "landing", "venues");
const JSON_PATH = path.join(process.cwd(), "lib", "landing", "venue-photos.json");
mkdirSync(OUT_DIR, { recursive: true });
const current = existsSync(JSON_PATH) ? JSON.parse(readFileSync(JSON_PATH, "utf8")) : {};

async function search(q) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=portrait&per_page=8`;
  const r = await fetch(url, { headers: { Authorization: KEY } });
  if (r.status === 401) throw new Error("Pexels rejected the API key (401).");
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  return (await r.json()).photos ?? [];
}

async function save(key, photo) {
  const src = photo.src.portrait || photo.src.large;
  const r = await fetch(src);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const file = `${key}.jpg`;
  writeFileSync(path.join(OUT_DIR, file), Buffer.from(await r.arrayBuffer()));
  current[key] = { label: VENUES[key].label, src: `/landing/venues/${file}`, credit: `${photo.photographer} · Pexels`, pexels: photo.url };
  console.log(`✓ ${key.padEnd(11)} ${photo.alt || ""} — ${photo.photographer}`);
}

if (args.list) {
  const v = VENUES[args.list];
  if (!v) throw new Error(`Unknown key ${args.list}. Keys: ${Object.keys(VENUES).join(", ")}`);
  (await search(v.q)).forEach((p, i) => console.log(`${i}: ${p.alt || "(no alt)"} — ${p.url}`));
  process.exit(0);
}

if (args.pick) {
  const [key, n] = String(args.pick).split(":");
  const photos = await search(VENUES[key].q);
  await save(key, photos[Number(n) || 0]);
} else {
  const keys = args.only ? [args.only] : Object.keys(VENUES);
  for (const key of keys) {
    try {
      const photos = await search(VENUES[key].q);
      if (!photos.length) { console.log(`– ${key}: no results`); continue; }
      await save(key, photos[0]);
    } catch (e) {
      console.log(`✗ ${key}: ${e.message}`);
    }
  }
}
writeFileSync(JSON_PATH, JSON.stringify(current, null, 2) + "\n");
console.log(`\nWrote ${path.relative(process.cwd(), JSON_PATH)} — restart \`npm run dev\` to see them.`);
