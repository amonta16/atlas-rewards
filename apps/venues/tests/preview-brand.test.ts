/**
 * tests/preview-brand.test.ts — CP-232 · brand extraction for instant app previews:
 * logo candidates, logo decoding, colors + contrast, treatment parsing, page text,
 * and the "text me" SMS links. Fixture HTML in tests/fixtures/preview/.
 * Run: npm test
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { logoCandidates, normalizeLogo, initialsOf, logoPixels } from "../lib/preview/logo";
import {
  themeColorFromHtml, contrastRatio, ensureContrast, paletteFromSeed, paletteIsReadable, dominantColors, parseColor,
  isUsableSeed, NEUTRAL_PALETTE, rgbToHsl, hexToRgb,
} from "../lib/preview/colors";
import { normalizeTreatments, memberPriceCents, tidyText, EXAMPLE_TREATMENTS } from "../lib/preview/treatments";
import { pageText, pageTitle, serviceLinks, teamLinks, findTags, decodeEntities, imageCandidates, googleFontFamilies, pickFont } from "../lib/preview/html";
import { extractSite, normalizeSite, photoList } from "../lib/preview/extract";
import { normalizePhoto } from "../lib/preview/photos";
import { smsHref, smsMessage, smsQrPayload, detectPlatform, e164 } from "../lib/preview/sms";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", "preview", f), "utf8");
const HOME = fx("spa-home.html");
const MINIMAL = fx("spa-minimal.html");
const BASE = "https://glow.example/";

describe("logo candidates", () => {
  test("apple-touch-icon (largest first) → og:image → icons (largest, .ico last) → <img> logo", () => {
    assert.deepEqual(logoCandidates(HOME, BASE), [
      "https://glow.example/icons/apple-180.png",
      "https://glow.example/icons/apple-120.png",
      "https://cdn.glow.example/og/hero-photo.jpg",
      "https://glow.example/icons/favicon-192.png",
      "https://glow.example/icons/favicon-32.png",
      "https://glow.example/favicon.ico",
      "https://glow.example/images/glow-logo.svg",
    ]);
  });
  test("handles reversed attributes, data-src and protocol-relative URLs", () => {
    assert.deepEqual(logoCandidates(MINIMAL, "https://bella.example/"), [
      "https://bella.example/share.png",
      "https://bella.example/assets/bella_LOGO_final.png",
    ]);
  });
  test("ignores data:, javascript: and non-http candidates", () => {
    const html = `<link rel="apple-touch-icon" href="data:image/png;base64,AAAA"><img src="javascript:alert(1)" alt="logo"><img src="ftp://x.example/logo.png" alt="logo">`;
    assert.deepEqual(logoCandidates(html, BASE), []);
  });
  test("no logo anywhere → empty list (monogram fallback)", () => {
    assert.deepEqual(logoCandidates("<html><body><img src='/team.jpg' alt='team'></body></html>", BASE), []);
  });
});

describe("logo decoding", () => {
  test("a real PNG is normalized to PNG ≤ 512 px", async () => {
    const png = await sharp({ create: { width: 900, height: 300, channels: 4, background: { r: 181, g: 131, b: 141, alpha: 1 } } }).png().toBuffer();
    const logo = await normalizeLogo(png, "x");
    assert.ok(logo);
    assert.equal(logo!.width, 512);
    assert.equal((await sharp(logo!.png).metadata()).format, "png");
  });
  test("tiny icons and non-images are rejected", async () => {
    const tiny = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#ff0000" } }).png().toBuffer();
    assert.equal(await normalizeLogo(tiny, "x"), null);
    assert.equal(await normalizeLogo(Buffer.from("<html>not an image</html>"), "x"), null);
  });
  test("an SVG with a script becomes a plain PNG (script gone)", async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><script>alert(1)</script><rect width="120" height="60" fill="#2a6f97"/></svg>`);
    const logo = await normalizeLogo(svg, "x");
    assert.ok(logo);
    assert.equal(logo!.png.subarray(1, 4).toString(), "PNG");
    assert.ok(!logo!.png.toString("latin1").includes("<script"));
  });
  test("monogram initials", () => {
    assert.equal(initialsOf("Glow Aesthetics"), "GA");
    assert.equal(initialsOf("The Skin Spa & Med Co"), "SK");
    assert.equal(initialsOf("Élan"), "EL");
    assert.equal(initialsOf("<script>"), "SC");
    assert.equal(initialsOf("!!!"), "A");
  });
});

describe("colors", () => {
  test("theme-color is used when it is a real color", () => {
    assert.equal(themeColorFromHtml(HOME), "#B5838D");
  });
  test("white/grey theme-color is ignored", () => {
    assert.equal(themeColorFromHtml(MINIMAL), null);
    assert.equal(themeColorFromHtml(`<meta name="theme-color" content="#777777">`), null);
  });
  test("msapplication-TileColor and rgb() work", () => {
    assert.equal(themeColorFromHtml(`<meta name="msapplication-TileColor" content="rgb(42, 111, 151)">`), "#2A6F97");
  });
  test("parseColor", () => {
    assert.equal(parseColor("#abc"), "#aabbcc");
    assert.equal(parseColor("#AABBCCDD"), "#aabbcc");
    assert.equal(parseColor("red; background:url(x)"), null);
    assert.equal(parseColor("rgb(300,0,0)"), null);
  });
  test("ensureContrast darkens light brand colors until white text passes AA, keeping the hue", () => {
    for (const seed of ["#F4C2C2", "#B5838D", "#FFD700", "#7FDBFF", "#E0B0FF"]) {
      const out = ensureContrast(seed);
      assert.ok(contrastRatio(out, "#FFFFFF") >= 4.5, `${seed} → ${out}`);
      const h1 = rgbToHsl(...hexToRgb(seed))[0], h2 = rgbToHsl(...hexToRgb(out))[0];
      assert.ok(Math.abs(h1 - h2) < 6 || Math.abs(h1 - h2) > 354, `hue kept for ${seed}`);
    }
    assert.equal(ensureContrast("#1A1A40"), "#1A1A40"); // already dark enough
  });
  test("every palette is readable; bad seeds get the neutral palette", () => {
    for (const s of ["#B5838D", "#F4C2C2", "#00FF00", "#2A6F97"]) assert.ok(paletteIsReadable(paletteFromSeed(s)), s);
    assert.deepEqual(paletteFromSeed(null), NEUTRAL_PALETTE);
    assert.deepEqual(paletteFromSeed("#FFFFFF"), NEUTRAL_PALETTE);
    assert.deepEqual(paletteFromSeed("not-a-color"), NEUTRAL_PALETTE);
    assert.ok(paletteIsReadable(NEUTRAL_PALETTE));
  });
  test("dominant colors from a logo ignore the white background and transparency", async () => {
    // 100×100 white canvas with a 40×40 brand-teal mark and a transparent strip.
    const mark = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 42, g: 111, b: 151, alpha: 1 } } }).png().toBuffer();
    const clear = await sharp({ create: { width: 100, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{ input: mark, left: 30, top: 30 }, { input: clear, left: 0, top: 0 }]).png().toBuffer();
    const { data, channels } = await logoPixels(png);
    const colors = dominantColors(data, channels);
    assert.ok(colors.length >= 1);
    const [r, g, b] = hexToRgb(colors[0]);
    assert.ok(Math.abs(r - 42) < 12 && Math.abs(g - 111) < 12 && Math.abs(b - 151) < 12, colors[0]);
    assert.ok(isUsableSeed(colors[0]));
  });
  test("an all-white or greyscale logo has no usable colors", () => {
    const px = Buffer.alloc(64 * 4);
    for (let i = 0; i < 64; i++) px.set(i % 2 ? [255, 255, 255, 255] : [90, 90, 90, 255], i * 4);
    assert.deepEqual(dominantColors(px, 4), []);
  });
});

describe("page text and links", () => {
  test("drops scripts, styles, comments, svg and noscript; decodes entities", () => {
    const t = pageText(HOME);
    assert.match(t, /Botox – from \$12\/unit/);
    assert.match(t, /HydraFacial Signature — \$180/);
    for (const bad of ["do not read me", "Hidden comment", "svg text", "enable JavaScript", ".hero{"]) assert.ok(!t.includes(bad), bad);
  });
  test("title", () => {
    assert.equal(pageTitle(HOME), "Glow Aesthetics & Wellness | Med Spa in San Luis Obispo");
  });
  test("service links: same site only, pricing first, no blog", () => {
    assert.deepEqual(serviceLinks(HOME, BASE), ["https://glow.example/pricing", "https://glow.example/services/"]);
  });
  test("findTags + entities", () => {
    const [img] = findTags(`<IMG SRC="/a.png?x=1&amp;y=2" ALT='Logo'>`, ["img"]);
    assert.equal(img.attrs.src, "/a.png?x=1&y=2");
    assert.equal(img.attrs.alt, "Logo");
    assert.equal(decodeEntities("&#x41;&#66;&amp;&bogus;"), "AB&&bogus;");
  });
});

describe("treatment parsing", () => {
  const raw = JSON.parse(fx("claude-treatments.json"));
  const list = normalizeTreatments(raw);
  test("at most 12, deduped, junk and too-short names dropped", () => {
    assert.equal(list.length, 12);
    assert.deepEqual(list.map((t) => t.name), [
      "Botox", "HydraFacial Signature", "Lip Filler", "Morpheus8", "IV Hydration", "CoolSculpting", "Chemical Peel",
      "Laser Hair Removal", "Microneedling", "Sculptra", "Kybella", "Dysport",
    ]);
  });
  test("prices: dollars → cents; out-of-range prices become null; unknown categories → Skin", () => {
    const by = Object.fromEntries(list.map((t) => [t.name, t]));
    assert.equal(by["Botox"].price_cents, 1200);
    assert.equal(by["HydraFacial Signature"].price_cents, 18000);
    assert.equal(by["Morpheus8"].price_cents, null);
    assert.equal(by["IV Hydration"].price_cents, null);
    assert.equal(by["IV Hydration"].category, "Skin");
    assert.equal(by["Dysport"].price_cents, null);
    assert.equal(by["Laser Hair Removal"].member_price_cents, null);
  });
  test("member price is 15% off, rounded to $5, and always lower", () => {
    assert.equal(memberPriceCents(18000), 15500);
    assert.equal(memberPriceCents(65000), 55500);
    assert.equal(memberPriceCents(1200), 1000);
    assert.equal(memberPriceCents(null), null);
    assert.equal(memberPriceCents(500), null);
  });
  test("garbage input never throws", () => {
    for (const g of [null, undefined, "x", 42, {}, { treatments: "no" }, { treatments: [null, 1, "a", { name: 5 }] }]) assert.deepEqual(normalizeTreatments(g), []);
  });
  test("the example menu is valid and has member prices", () => {
    assert.ok(EXAMPLE_TREATMENTS.length >= 3);
    for (const t of EXAMPLE_TREATMENTS) assert.ok(t.member_price_cents! < t.price_cents!);
  });
  test("no API key → null (example menu fallback), no network call", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try { assert.equal(await extractSite(pageText(HOME), [], "Glow"), null); } finally { if (saved) process.env.ANTHROPIC_API_KEY = saved; }
  });
  test("descriptions are cleaned and photo numbers map to our own URLs only", () => {
    const list = normalizeTreatments({ treatments: [
      { name: "Botox", category: "Injectables", price: 12, description: "  Soften <b>frown</b> lines.  ", image: 1 },
      { name: "Filler", category: "Injectables", price: 650, description: "x", image: 7 },
    ] }, 12, ["https://glow.example/a.jpg", "https://glow.example/b.jpg"]);
    assert.equal(list[0].description, "Soften frown lines.");
    assert.equal(list[0].image_url, "https://glow.example/b.jpg");
    assert.equal(list[1].description, undefined);
    assert.equal(list[1].image_url, undefined);
  });
});

describe("text me my app", () => {
  const body = smsMessage("Glow Aesthetics", "pv-glow-aesthetics-k3x9q2");
  test("message", () => assert.equal(body, "Send my app for Glow Aesthetics (pv-glow-aesthetics-k3x9q2)"));
  test("iOS uses &body=, Android ?body=", () => {
    assert.equal(smsHref("+18055550142", body, "ios"), `sms:+18055550142&body=${encodeURIComponent(body)}`);
    assert.equal(smsHref("+18055550142", body, "android"), `sms:+18055550142?body=${encodeURIComponent(body)}`);
  });
  test("QR payload", () => assert.equal(smsQrPayload("+18055550142", body), `SMSTO:+18055550142:${body}`));
  test("platform detection", () => {
    assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "ios");
    assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)"), "android");
    assert.equal(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
  });
  test("e164", () => {
    assert.equal(e164("(805) 555-0142"), "+18055550142");
    assert.equal(e164("1-805-555-0142"), "+18055550142");
    assert.equal(e164("555-0142"), null);
  });
  test("newlines in a business name can't break the message", () => {
    assert.equal(smsMessage("Glow\nSpa", "pv-x-abc123"), "Send my app for Glow Spa (pv-x-abc123)");
  });
});

/* ───────────── CP-233: the deeper build ───────────── */

const SERVICES = fx("spa-services.html");
const SVC_BASE = "https://glow.example/services";

describe("photos on a page", () => {
  const imgs = imageCandidates(SERVICES, SVC_BASE, "services");
  test("keeps content photos (largest srcset, lazy data-src, CSS backgrounds); drops logos, pixels, icons, svg, thumbnails", () => {
    assert.deepEqual(imgs.map((i) => i.url), [
      "https://glow.example/uploads/botox-1200.jpg",
      "https://glow.example/uploads/hydrafacial.webp",
      "https://glow.example/uploads/hero-lobby.jpg",
    ]);
  });
  test("each photo carries the heading above it", () => {
    assert.equal(imgs[0].context, "BOTOX® Cosmetic");
    assert.equal(imgs[1].context, "HydraFacial");
    assert.equal(imgs[0].alt, "Botox injection");
  });
  test("the photo list for the model is numbered and has no raw URLs", () => {
    const list = photoList(imgs);
    assert.match(list, /^\[0\] file=botox-1200\.jpg alt="Botox injection" under="BOTOX® Cosmetic" page=services w=600$/m);
    assert.ok(!list.includes("https://"));
  });
});

describe("fonts", () => {
  test("Google font families in order", () => {
    assert.deepEqual(googleFontFamilies(SERVICES), ["Great Vibes", "Cormorant Garamond", "Lato"]);
  });
  test("prefers the body font; never a script font", () => {
    assert.equal(pickFont(SERVICES), "Lato");
    assert.equal(pickFont(`<link href="https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display">`), "Playfair Display");
    assert.equal(pickFont(`<link href="https://fonts.googleapis.com/css2?family=Dancing+Script">`), null);
    assert.equal(pickFont(HOME), null);
  });
  test("font names can never carry CSS: only letters, digits and spaces survive", () => {
    assert.deepEqual(googleFontFamilies(`<link href="https://fonts.googleapis.com/css2?family=Evil');}body{x:url(y">`), ["Evil"]);
    assert.deepEqual(googleFontFamilies(`<link href="https://fonts.googleapis.com/css2?family=Bad%3Bname">`), []);
  });
});

describe("team and about pages", () => {
  test("team/about links: same site, team first, careers skipped", () => {
    assert.deepEqual(teamLinks(SERVICES, SVC_BASE, 2), ["https://glow.example/meet-the-team", "https://glow.example/about-us"]);
  });
});

describe("reading the site (model answer → stored data)", () => {
  const imgs = imageCandidates(SERVICES, SVC_BASE, "services");
  const site = normalizeSite(JSON.parse(fx("claude-site.json")), imgs);
  test("treatments keep their own photo; out-of-range photo numbers are dropped", () => {
    assert.equal(site.treatments[0].name, "BOTOX® Cosmetic");
    assert.equal(site.treatments[0].image_url, "https://glow.example/uploads/hydrafacial.webp");
    assert.equal(site.treatments[1].image_url, undefined);
  });
  test("injected instructions never make it into a description", () => {
    assert.equal(site.treatments[1].description, undefined);
  });
  test("hero photo maps to our list", () => {
    assert.equal(site.heroSource, "https://glow.example/uploads/botox-1200.jpg");
  });
  test("team: deduped, junk and one-letter names dropped, bad photo numbers → null", () => {
    assert.deepEqual(site.team, [
      { name: "Dr. Maya Chen", title: "Medical Director, MD", photo_url: null },
      { name: "Jess Rivera", title: "Nurse Injector, RN", photo_url: null },
    ]);
  });
  test("about is capped at 300 characters", () => {
    assert.ok(site.about && site.about.length <= 301 && site.about.startsWith("Glow Aesthetics is a physician-led"));
  });
  test("garbage never throws", () => {
    for (const g of [null, 1, "x", { team: "no", treatments: 5, hero_image: "0" }]) {
      const r = normalizeSite(g, imgs);
      assert.deepEqual(r, { treatments: [], heroSource: null, team: [], about: null });
    }
  });
  test("tidyText", () => {
    assert.equal(tidyText("One. Two three four five.", 12), "One. Two…");
    assert.equal(tidyText("<script>x</script>", 50), null);
    assert.equal(tidyText(5, 50), null);
  });
});

describe("their photos", () => {
  const make = (w: number, h: number, alpha = false) =>
    sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 200, g: 100, b: 120, alpha: 0.5 } : { r: 200, g: 100, b: 120 } } }).png().toBuffer();
  test("a big landscape photo becomes a 1400 px JPEG hero", async () => {
    const out = await normalizePhoto(await make(2000, 1100), "hero");
    assert.ok(out);
    const meta = await sharp(out!).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.width, 1400);
  });
  test("a tall portrait is not a hero; small photos are dropped", async () => {
    assert.equal(await normalizePhoto(await make(800, 1200), "hero"), null);
    assert.equal(await normalizePhoto(await make(200, 200), "treatment"), null);
    assert.ok(await normalizePhoto(await make(300, 300), "team"));
  });
  test("transparent PNGs are flattened onto white; non-images rejected", async () => {
    const out = await normalizePhoto(await make(600, 400, true), "treatment");
    assert.equal((await sharp(out!).metadata()).hasAlpha, false);
    assert.equal(await normalizePhoto(Buffer.from("<svg onload=alert(1)>"), "hero"), null);
  });
});
