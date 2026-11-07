/**
 * lib/preview/html.ts — CP-232 · small, dependency-free HTML helpers for the
 * preview builder. Regex-based on purpose: we only read a few tags and the
 * visible text, the input is untrusted, and nothing here is rendered as HTML.
 */

export type Tag = { name: string; attrs: Record<string, string> };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", reg: "®", trade: "™", copy: "©", eacute: "é", egrave: "è" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Every <name ...> opening tag with its attributes (lower-cased names). */
export function findTags(html: string, names: string[]): Tag[] {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const out: Tag[] = [];
  const re = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = m[1].toLowerCase();
    if (!want.has(name)) continue;
    const attrs: Record<string, string> = {};
    const ar = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[2]))) {
      const k = a[1].toLowerCase();
      if (!(k in attrs)) attrs[k] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    }
    out.push({ name, attrs });
  }
  return out;
}

/** Absolute http(s) URL or null. */
export function absolutize(href: string | undefined, base: string): string | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("data:") || h.startsWith("javascript:")) return null;
  try {
    const u = new URL(h, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The page's visible text: no scripts, styles, svg, comments or tags; whitespace collapsed. */
export function pageText(html: string, maxChars = 40_000): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, maxChars);
}

/** The page <title>, if any. */
export function pageTitle(html: string): string | null {
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? decodeEntities(t).replace(/\s+/g, " ").trim().slice(0, 160) || null : null;
}

/**
 * Same-site links that probably list services and prices (/services, /treatments,
 * /menu, /pricing…), best first. Used to read a second page when the home page
 * has no menu on it.
 */
export function serviceLinks(html: string, base: string, max = 2): string[] {
  return rankedLinks(html, base, max, (path, text) => {
    let score = 0;
    if (/pric|menu|rates|cost/.test(path + " " + text)) score += 3;
    if (/service|treatment|procedure/.test(path + " " + text)) score += 2;
    if (/injectable|botox|filler|facial|laser/.test(path)) score += 1;
    return score;
  });
}

/** CP-233: same-site "about / meet the team / providers" pages, best first. */
export function teamLinks(html: string, base: string, max = 1): string[] {
  return rankedLinks(html, base, max, (path, text) => {
    let score = 0;
    if (/team|staff|provider|meet|injector|our-?people|doctor/.test(path + " " + text)) score += 3;
    if (/about/.test(path + " " + text)) score += 2;
    return score;
  });
}

function rankedLinks(html: string, base: string, max: number, scoreOf: (path: string, text: string) => number): string[] {
  let host: string;
  try { host = new URL(base).hostname.replace(/^www\./, ""); } catch { return []; }
  const scored: Array<{ url: string; score: number }> = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const url = absolutize(decodeEntities(href?.[1] ?? href?.[2] ?? href?.[3] ?? ""), base);
    if (!url) continue;
    let u: URL;
    try { u = new URL(url); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== host) continue;
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).toLowerCase();
    const path = u.pathname.toLowerCase();
    let score = scoreOf(path, text);
    if (/blog|news|career|privacy|terms|login|cart|account/.test(path)) score = 0;
    if (score > 0) {
      u.hash = "";
      scored.push({ url: u.toString(), score });
    }
  }
  const seen = new Set<string>([new URL(base).toString()]);
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
    .slice(0, max)
    .map((s) => s.url);
}

/* ───────────── CP-233: photos and fonts ───────────── */

export type ImageCandidate = { url: string; alt: string; file: string; width: number | null; context: string; page: string };

const JUNK_IMG = /(?:pixel|spacer|blank|tracking|facebook\.com\/tr|google-analytics|doubleclick|\/icons?\/|sprite|placeholder|loading|lazy\.gif|badge|payment|visa|mastercard|amex|paypal|star-rating|stars?\.(?:png|svg))/i;

function largestFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    const w = Number((size ?? "").replace(/[^\d.]/g, "")) || 1;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url ?? null;
}

/**
 * Content photos on a page (for the hero, treatments and team), with the
 * text around each so the model can match them. Skips logos, icons, SVGs,
 * tracking pixels and anything declared smaller than 200 px wide.
 */
export function imageCandidates(html: string, baseUrl: string, page: string, max = 40): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined, alt: string, width: number | null, at: number) => {
    const url = absolutize(raw ?? undefined, baseUrl);
    if (!url || seen.has(url)) return;
    const path = url.split("?")[0].toLowerCase();
    if (/\.(svg|ico|gif)$/.test(path) || /logo/.test(path + " " + alt.toLowerCase()) || JUNK_IMG.test(url)) return;
    if (width !== null && width < 200) return;
    seen.add(url);
    // The nearest heading before the image says what it's about.
    const before = html.slice(Math.max(0, at - 2500), at);
    const heads = [...before.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    const context = heads.length ? decodeEntities(heads[heads.length - 1][1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 80) : "";
    out.push({ url, alt: alt.replace(/\s+/g, " ").trim().slice(0, 100), file: path.split("/").pop()!.slice(0, 60), width, context, page });
  };

  const re = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < max) {
    const [tag] = findTags(m[0], ["img"]);
    if (!tag) continue;
    const a = tag.attrs;
    const src = largestFromSrcset(a.srcset) || largestFromSrcset(a["data-srcset"]) || a["data-src"] || a["data-lazy-src"] || a.src;
    const w = Number(a.width);
    add(src, a.alt ?? "", Number.isFinite(w) && w > 0 ? w : null, m.index);
  }
  // Hero sections often use a CSS background image.
  const bg = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  while ((m = bg.exec(html)) && out.length < max) add(decodeEntities(m[1]), "background", null, m.index);
  return out;
}

const SCRIPT_FONTS = /script|hand|brush|signature|dancing|pacifico|great vibes|allura|parisienne|sacramento|satisfy|tangerine|caveat|lobster|icons?|symbols|awesome/i;

/** Google Fonts families the site loads (link tags and @import), in order. */
export function googleFontFamilies(html: string): string[] {
  const out: string[] = [];
  const re = /fonts\.googleapis\.com\/css2?\?([^"'\s)>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const qs = decodeEntities(m[1]);
    for (const part of qs.split("&")) {
      const [k, v] = part.split("=");
      if (k !== "family" || !v) continue;
      for (const fam of decodeURIComponent(v.replace(/\+/g, " ")).split("|")) {
        const name = fam.split(":")[0].trim();
        if (/^[A-Za-z0-9 ]{2,40}$/.test(name) && !out.includes(name)) out.push(name);
      }
    }
  }
  return out;
}

/**
 * The one font the preview app uses: the site's body font if it's a Google
 * font we can see in its CSS, else its first non-script Google font. null = keep ours.
 */
export function pickFont(html: string): string | null {
  const fams = googleFontFamilies(html).filter((f) => !SCRIPT_FONTS.test(f));
  if (!fams.length) return null;
  const body = html.match(/body\s*\{[^}]*font-family\s*:\s*['"]?([^,'";}]+)/i)?.[1]?.trim();
  if (body) {
    const hit = fams.find((f) => f.toLowerCase() === body.toLowerCase());
    if (hit) return hit;
  }
  return fams[0];
}
