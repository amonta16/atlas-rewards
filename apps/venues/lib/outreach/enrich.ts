/**
 * lib/outreach/enrich.ts — CP-250 · read a spa's own website: the email it publishes, and the text
 * the AI writes from. Free (no paid email finder): home page + up to 2 contact/about pages, through
 * the CP-232 SSRF guard (safeFetch: public hosts only, 8 s, 3 MB).
 *
 * Only addresses the spa itself publishes as a business contact are kept. CAN-SPAM's "harvesting"
 * clause is about sites that post a notice against collecting addresses, so a page with such a
 * notice is skipped. The email's domain must accept mail (MX record), a free sanity check.
 */
import dns from "node:dns";
import { safeFetch } from "@/lib/preview/safe-fetch";
import { absolutize, decodeEntities, findTags, pageText, pageTitle } from "@/lib/preview/html";
import { EMAIL_RE, hostOf } from "./shared";

export type SiteRead = {
  website: string;
  domain: string | null;
  emails: string[];          // ranked, best first
  best: string | null;
  mxOk: boolean | null;
  text: string;              // cleaned text of the pages read, for the AI
  title: string | null;
  pages: string[];
  blockedNotice: boolean;
};

const JUNK_EMAIL = /(\.(png|jpe?g|gif|webp|svg|css|js)$)|(^|@)(example|domain|email|yourdomain|sentry|wixpress|sentry-next|godaddy|squarespace|wordpress|schema|test)\./i;
const NO_HARVEST = /(do not|don't|may not)\s+(harvest|collect|scrape)|no\s+unsolicited|not\s+consent\s+to\s+(receive\s+)?unsolicited/i;
const ROLE_RANK = ["owner", "info", "hello", "contact", "office", "frontdesk", "front.desk", "appointments", "booking", "bookings", "admin", "concierge", "reception"];

/** Cloudflare "email protection" hides addresses as hex XOR-ed with the first byte. */
function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

export function emailsIn(html: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    const e = decodeEntities(raw).trim().replace(/^mailto:/i, "").split("?")[0].replace(/[.,;:]+$/, "").toLowerCase();
    if (EMAIL_RE.test(e) && e.length <= 120 && !JUNK_EMAIL.test(e) && !/^(no-?reply|donotreply|postmaster|abuse|privacy|webmaster)@/.test(e)) found.add(e);
  };
  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'>\s]+)/gi)) add(decodeURIComponent(m[1]));
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) { const d = decodeCfEmail(m[1]); if (d) add(d); }
  const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const m of decodeEntities(text).matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) add(m[0]);
  return Array.from(found);
}

/** Same-domain addresses first, then role addresses in a sensible order, then anything else. */
export function rankEmails(emails: string[], domain: string | null): string[] {
  const score = (e: string) => {
    const [local, host] = e.split("@");
    let s = 0;
    if (domain && (host === domain || host.endsWith(`.${domain}`))) s += 10;
    if (/^(gmail|yahoo|outlook|hotmail|icloud|aol)\./.test(host)) s += 2; // small spas often use these: still real
    const r = ROLE_RANK.findIndex((x) => local === x || local.startsWith(x));
    if (r >= 0) s += 6 - Math.min(5, r * 0.5);
    else if (/^[a-z]+(\.[a-z]+)?$/.test(local)) s += 4; // a person's name
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a));
}

function contactLinks(html: string, base: string, max = 2): string[] {
  const baseHost = hostOf(base);
  const scored: Array<{ url: string; score: number }> = [];
  for (const a of findTags(html, ["a"])) {
    const url = absolutize(a.attrs.href, base);
    if (!url || hostOf(url) !== baseHost) continue;
    const path = new URL(url).pathname.toLowerCase();
    const text = (a.attrs.title ?? "").toLowerCase();
    let score = 0;
    if (/contact|reach|location|visit/.test(path + text)) score += 3;
    if (/about|team|meet|our-?story|provider|staff/.test(path + text)) score += 2;
    if (score) scored.push({ url: url.split("#")[0], score });
  }
  const seen = new Set<string>([base.replace(/\/$/, "")]);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.url).filter((u) => (seen.has(u.replace(/\/$/, "")) ? false : (seen.add(u.replace(/\/$/, "")), true))).slice(0, max);
}

async function getHtml(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const r = await safeFetch(url, { accept: "text/html,application/xhtml+xml" });
    if (r.status >= 400 || !/html|text\/plain/i.test(r.contentType || "text/html")) return null;
    return { url: r.url, html: r.body.toString("utf8") };
  } catch {
    return null;
  }
}

export async function hasMx(domain: string): Promise<boolean | null> {
  try {
    const mx = await Promise.race([
      dns.promises.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    return mx.length > 0;
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}

export async function readSite(website: string): Promise<SiteRead | null> {
  const start = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const home = await getHtml(start);
  if (!home) return null;
  const domain = hostOf(home.url);
  const pages = [home];
  for (const link of contactLinks(home.html, home.url)) {
    const p = await getHtml(link);
    if (p) pages.push(p);
  }
  const blockedNotice = pages.some((p) => NO_HARVEST.test(pageText(p.html, 60_000)));
  const emails = blockedNotice ? [] : rankEmails(Array.from(new Set(pages.flatMap((p) => emailsIn(p.html)))), domain);
  const best = emails[0] ?? null;
  const mxOk = best ? await hasMx(best.split("@")[1]) : null;
  const text = pages.map((p) => `# ${p.url}\n${pageText(p.html, 6000)}`).join("\n\n").slice(0, 14_000);
  return { website: home.url, domain, emails: emails.slice(0, 8), best: mxOk === false ? null : best, mxOk, text, title: pageTitle(home.html), pages: pages.map((p) => p.url), blockedNotice };
}
