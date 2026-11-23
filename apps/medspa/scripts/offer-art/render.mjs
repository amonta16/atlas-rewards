// CP-262 · Renders art.html into public/offer-art/<slug>.jpg (1000×600) with headless Chrome + ffmpeg.
//   node apps/medspa/scripts/offer-art/render.mjs            (all occasions)
//   node apps/medspa/scripts/offer-art/render.mjs birthday   (one)
// Set CHROME=/path/to/chrome if Chrome isn't in the usual place.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../public/offer-art");
const page = pathToFileURL(join(here, "art.html")).href;
const SLUGS = [
  "birthday", "welcome", "anniversary", "comeback", "custom_occasion", "black_friday", "christmas", "easter",
  "fourth_of_july", "halloween", "labor_day", "memorial_day", "new_years", "st_patricks", "valentines", "summer_kickoff",
];
const chrome = process.env.CHROME ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find(existsSync);
if (!chrome) throw new Error("Chrome not found; set CHROME=");

mkdirSync(out, { recursive: true });
for (const slug of process.argv.slice(2).length ? process.argv.slice(2) : SLUGS) {
  const png = join(tmpdir(), `offer-art-${slug}.png`);
  spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1000,600", `--screenshot=${png}`, `${page}?slug=${slug}`], { stdio: "ignore" });
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-q:v", "3", join(out, `${slug}.jpg`)], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${slug}`);
  rmSync(png, { force: true });
  console.log(`✓ ${slug}`);
}
