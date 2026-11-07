/**
 * lib/preview/safe-fetch.ts — CP-232 · the SSRF guard for fetching a spa's website.
 *
 * Every outbound request to a URL we didn't write ourselves (a spa's site, its
 * logo, a pasted logo URL) goes through safeFetch. Rules:
 *   · http/https only, ports 80/443 only, no user:pass@ in the URL;
 *   · the hostname is resolved and EVERY address must be public (lib/preview/ip.ts).
 *     The check runs inside the socket's own DNS lookup, so the address we check
 *     is the address we connect to (no DNS-rebinding gap between check and use);
 *   · 8 s for the whole thing including redirects, 3 MB max (counted after
 *     decompression, so a gzip bomb stops at 3 MB);
 *   · at most 3 redirects, each one re-checked from the top.
 * Fails closed: anything unexpected throws SafeFetchError.
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { isIP } from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { isPublicIp } from "./ip";

export class SafeFetchError extends Error {
  constructor(public code: "blocked" | "timeout" | "too_large" | "too_many_redirects" | "bad_status" | "network", message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export type SafeResponse = { url: string; status: number; contentType: string; body: Buffer; truncated: boolean };

type LookupAll = (host: string) => Promise<Array<{ address: string; family: number }>>;

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** "truncate" keeps the first maxBytes (HTML); "error" rejects (images). */
  onOverflow?: "truncate" | "error";
  accept?: string;
  /** Test seams. Production uses the defaults. */
  lookup?: LookupAll;
  isAllowedIp?: (ip: string) => boolean;
  allowedPorts?: number[];
};

export const SAFE_FETCH_DEFAULTS = { timeoutMs: 8000, maxBytes: 3 * 1024 * 1024, maxRedirects: 3 } as const;
const UA = "Mozilla/5.0 (compatible; AtlasPreview/1.0; +https://www.atlas-engine.app)";

const defaultLookup: LookupAll = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

/** Parses and checks a URL before any network activity. Throws SafeFetchError("blocked"). */
export function checkUrl(raw: string, allowedPorts: number[] = [80, 443], isAllowedIp: (ip: string) => boolean = isPublicIp): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SafeFetchError("blocked", "Not a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SafeFetchError("blocked", "Only http and https are allowed");
  if (u.username || u.password) throw new SafeFetchError("blocked", "Credentials in URLs are not allowed");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (!allowedPorts.includes(port)) throw new SafeFetchError("blocked", `Port ${port} is not allowed`);
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new SafeFetchError("blocked", "Missing host");
  if (isIP(host)) {
    if (!isAllowedIp(host)) throw new SafeFetchError("blocked", "That address is not public");
  } else if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new SafeFetchError("blocked", "That host is not public");
  }
  return u;
}

/** DNS lookup for the socket that refuses non-public answers. */
function guardedLookup(lookupAll: LookupAll, isAllowedIp: (ip: string) => boolean) {
  return (hostname: string, options: dns.LookupOptions, cb: (...args: unknown[]) => void) => {
    lookupAll(hostname)
      .then((addrs) => {
        if (!addrs.length) return cb(new SafeFetchError("blocked", "No address"));
        // Every answer must be public: a mixed answer is a rebinding trick.
        if (addrs.some((a) => !isAllowedIp(a.address))) return cb(new SafeFetchError("blocked", "That host resolves to a private address"));
        const wanted = typeof options === "object" && options?.family ? addrs.filter((a) => a.family === options.family) : addrs;
        const list = wanted.length ? wanted : addrs;
        if (typeof options === "object" && options?.all) cb(null, list);
        else cb(null, list[0].address, list[0].family);
      })
      .catch((e) => cb(e));
  };
}

function decoded(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase().trim();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function requestOnce(u: URL, o: Required<Pick<SafeFetchOptions, "maxBytes" | "onOverflow" | "accept" | "lookup" | "isAllowedIp">>, signal: AbortSignal):
  Promise<{ status: number; location: string | null; contentType: string; body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: o.accept, "Accept-Encoding": "gzip, deflate, br", "Accept-Language": "en-US,en;q=0.8" },
      lookup: guardedLookup(o.lookup, o.isAllowedIp) as unknown as typeof dns.lookup,
      signal,
      agent: false,
    }, (res) => {
      const status = res.statusCode ?? 0;
      const location = typeof res.headers.location === "string" ? res.headers.location : null;
      const contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (status >= 300 && status < 400 && location) {
        res.resume();
        return resolve({ status, location, contentType, body: Buffer.alloc(0), truncated: false });
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (o.onOverflow === "error" && declared > o.maxBytes) {
        res.destroy();
        return reject(new SafeFetchError("too_large", "Response is too large"));
      }
      const stream = decoded(res);
      const chunks: Buffer[] = [];
      let size = 0;
      let done = false;
      const finish = (truncated: boolean) => {
        if (done) return;
        done = true;
        resolve({ status, location: null, contentType, body: Buffer.concat(chunks).subarray(0, o.maxBytes), truncated });
      };
      stream.on("data", (c: Buffer) => {
        if (done) return;
        size += c.length;
        chunks.push(c);
        if (size > o.maxBytes) {
          res.destroy();
          stream.destroy();
          if (o.onOverflow === "truncate") finish(true);
          else { done = true; reject(new SafeFetchError("too_large", "Response is too large")); }
        }
      });
      stream.on("end", () => finish(false));
      stream.on("error", (e) => { if (!done) { done = true; reject(e); } });
      res.on("error", (e) => { if (!done) { done = true; reject(e); } });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const o = {
    timeoutMs: opts.timeoutMs ?? SAFE_FETCH_DEFAULTS.timeoutMs,
    maxBytes: opts.maxBytes ?? SAFE_FETCH_DEFAULTS.maxBytes,
    maxRedirects: opts.maxRedirects ?? SAFE_FETCH_DEFAULTS.maxRedirects,
    onOverflow: opts.onOverflow ?? "error",
    accept: opts.accept ?? "*/*",
    lookup: opts.lookup ?? defaultLookup,
    isAllowedIp: opts.isAllowedIp ?? isPublicIp,
    allowedPorts: opts.allowedPorts ?? [80, 443],
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs);
  try {
    let url = checkUrl(rawUrl, o.allowedPorts, o.isAllowedIp);
    for (let hop = 0; ; hop++) {
      const r = await requestOnce(url, o, ac.signal);
      if (r.location) {
        if (hop >= o.maxRedirects) throw new SafeFetchError("too_many_redirects", "Too many redirects");
        let next: string;
        try { next = new URL(r.location, url).toString(); } catch { throw new SafeFetchError("blocked", "Bad redirect"); }
        url = checkUrl(next, o.allowedPorts, o.isAllowedIp); // every hop is re-checked
        continue;
      }
      if (r.status < 200 || r.status >= 300) throw new SafeFetchError("bad_status", `HTTP ${r.status}`);
      return { url: url.toString(), status: r.status, contentType: r.contentType, body: r.body, truncated: r.truncated };
    }
  } catch (e) {
    if (e instanceof SafeFetchError) throw e;
    if (ac.signal.aborted) throw new SafeFetchError("timeout", "The site took too long to answer");
    throw new SafeFetchError("network", e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
  }
}
