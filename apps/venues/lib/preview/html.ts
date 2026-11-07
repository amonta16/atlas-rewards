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
    let score = 0;
    if (/pric|menu|rates|cost/.test(path + " " + text)) score += 3;
    if (/service|treatment|procedure/.test(path + " " + text)) score += 2;
    if (/injectable|botox|filler|facial|laser/.test(path)) score += 1;
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
