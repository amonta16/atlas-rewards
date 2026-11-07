/**
 * tests/preview-ssrf.test.ts — CP-232 · the SSRF guard (lib/preview/ip.ts + safe-fetch.ts).
 * Run: npm test
 *
 * The network tests use a local server on 127.0.0.1. Production refuses
 * loopback, so those tests pass test-only `isAllowedIp` / `allowedPorts` /
 * `lookup` seams that allow exactly that server and nothing else.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { isPublicIp, expandIPv6 } from "../lib/preview/ip";
import { checkUrl, safeFetch, SafeFetchError } from "../lib/preview/safe-fetch";

describe("isPublicIp", () => {
  test("blocks private, loopback, link-local, CGNAT, reserved", () => {
    for (const ip of [
      "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255",
      "192.0.0.8", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.1", "240.0.0.1", "255.255.255.255",
    ]) assert.equal(isPublicIp(ip), false, ip);
  });
  test("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "93.184.216.34"]) assert.equal(isPublicIp(ip), true, ip);
  });
  test("blocks private IPv6 and IPv6 forms of private IPv4", () => {
    for (const ip of [
      "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
      "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "2002:c0a8:0101::1", "::127.0.0.1", "2001:0:4136:e378::1", "fec0::1",
    ]) assert.equal(isPublicIp(ip), false, ip);
  });
  test("allows global IPv6, and mapped public IPv4", () => {
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8"]) assert.equal(isPublicIp(ip), true, ip);
  });
  test("garbage is never public", () => {
    for (const ip of ["", "localhost", "999.1.1.1", "1.2.3", "::gg", "1::2::3"]) assert.equal(isPublicIp(ip), false, ip);
  });
  test("expandIPv6", () => {
    assert.deepEqual(expandIPv6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual(expandIPv6("::ffff:10.0.0.1"), [0, 0, 0, 0, 0, 0xffff, 0x0a00, 0x0001]);
    assert.equal(expandIPv6("1:2:3:4:5:6:7:8:9"), null);
  });
});

describe("checkUrl", () => {
  const blocked = (u: string) => assert.throws(() => checkUrl(u), (e: unknown) => e instanceof SafeFetchError && e.code === "blocked", u);
  test("only http and https", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", "data:text/html,hi", "not a url"]) blocked(u);
  });
  test("no credentials, only ports 80/443", () => {
    blocked("https://user:pass@example.com/");
    blocked("http://example.com:8080/");
    blocked("https://example.com:22/");
    assert.equal(checkUrl("https://example.com:443/x").hostname, "example.com");
  });
  test("no private literals or internal names", () => {
    for (const u of [
      "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://10.0.0.1/",
      "http://localhost/", "http://foo.localhost/", "http://printer.local/", "http://metadata.google.internal/", "http://intranet/",
    ]) blocked(u);
  });
  test("public URLs pass", () => {
    assert.equal(checkUrl("https://glow.example/services").pathname, "/services");
    assert.equal(checkUrl("http://8.8.8.8/").hostname, "8.8.8.8");
  });
});

describe("safeFetch: DNS answers", () => {
  test("a hostname resolving to a private address is blocked before connecting", async () => {
    await assert.rejects(
      safeFetch("http://evil.example/", { lookup: async () => [{ address: "10.0.0.5", family: 4 }] }),
      (e: unknown) => e instanceof SafeFetchError && e.code === "blocked",
    );
  });
  test("cloud metadata via DNS is blocked", async () => {
    await assert.rejects(
      safeFetch("http://meta.example/", { lookup: async () => [{ address: "169.254.169.254", family: 4 }] }),
      (e: unknown) => e instanceof SafeFetchError && e.code === "blocked",
    );
  });
  test("a mixed public/private answer (rebinding) is blocked", async () => {
    await assert.rejects(
      safeFetch("http://rebind.example/", { lookup: async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] }),
      (e: unknown) => e instanceof SafeFetchError && e.code === "blocked",
    );
  });
});

describe("safeFetch: against a local server", () => {
  let server: http.Server;
  let port = 0;
  const big = Buffer.alloc(200_000, 97);
  const bomb = zlib.gzipSync(Buffer.alloc(5_000_000, 0));

  before(async () => {
    server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://x");
      switch (u.pathname) {
        case "/ok": res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end("<h1>hello</h1>"); break;
        case "/to-private": res.writeHead(302, { Location: `http://private.test:${port}/ok` }); res.end(); break;
        case "/to-file": res.writeHead(301, { Location: "file:///etc/passwd" }); res.end(); break;
        case "/to-metadata": res.writeHead(307, { Location: "http://169.254.169.254/latest/meta-data/" }); res.end(); break;
        case "/hop": {
          const n = Number(u.searchParams.get("n") ?? 0);
          res.writeHead(302, { Location: n > 0 ? `/hop?n=${n - 1}` : "/ok" }); res.end(); break;
        }
        case "/big": res.writeHead(200, { "Content-Type": "text/html" }); res.end(big); break;
        case "/bomb": res.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip" }); res.end(bomb); break;
        case "/slow": setTimeout(() => { res.writeHead(200); res.end("late"); }, 2000); break;
        case "/404": res.writeHead(404); res.end("nope"); break;
        default: res.writeHead(500); res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  // Only the test server is allowed; "private.test" resolves to a private address.
  const seams = () => ({
    allowedPorts: [80, 443, port],
    isAllowedIp: (ip: string) => ip === "127.0.0.1" || isPublicIp(ip),
    lookup: async (host: string) => (host === "good.test" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.9.9.9", family: 4 }]),
  });
  const url = (p: string) => `http://good.test:${port}${p}`;

  test("fetches an allowed page", async () => {
    const r = await safeFetch(url("/ok"), seams());
    assert.equal(r.status, 200);
    assert.equal(r.contentType, "text/html");
    assert.equal(r.body.toString(), "<h1>hello</h1>");
  });
  test("a redirect to a private host is re-checked and blocked", async () => {
    await assert.rejects(safeFetch(url("/to-private"), seams()), (e: unknown) => e instanceof SafeFetchError && e.code === "blocked");
  });
  test("a redirect to file:// is blocked", async () => {
    await assert.rejects(safeFetch(url("/to-file"), seams()), (e: unknown) => e instanceof SafeFetchError && e.code === "blocked");
  });
  test("a redirect to the metadata IP is blocked", async () => {
    await assert.rejects(safeFetch(url("/to-metadata"), seams()), (e: unknown) => e instanceof SafeFetchError && e.code === "blocked");
  });
  test("3 redirects are fine, 4 are too many", async () => {
    const ok = await safeFetch(url("/hop?n=2"), seams()); // hop → hop → hop → ok = 3 redirects
    assert.equal(ok.body.toString(), "<h1>hello</h1>");
    await assert.rejects(safeFetch(url("/hop?n=3"), seams()), (e: unknown) => e instanceof SafeFetchError && e.code === "too_many_redirects");
  });
  test("bodies over the cap are rejected, or truncated when asked", async () => {
    await assert.rejects(safeFetch(url("/big"), { ...seams(), maxBytes: 50_000 }), (e: unknown) => e instanceof SafeFetchError && e.code === "too_large");
    const t = await safeFetch(url("/big"), { ...seams(), maxBytes: 50_000, onOverflow: "truncate" });
    assert.equal(t.truncated, true);
    assert.equal(t.body.length, 50_000);
  });
  test("the cap counts decompressed bytes (gzip bomb)", async () => {
    await assert.rejects(safeFetch(url("/bomb"), { ...seams(), maxBytes: 1_000_000 }), (e: unknown) => e instanceof SafeFetchError && e.code === "too_large");
  });
  test("slow servers time out", async () => {
    await assert.rejects(safeFetch(url("/slow"), { ...seams(), timeoutMs: 300 }), (e: unknown) => e instanceof SafeFetchError && e.code === "timeout");
  });
  test("non-2xx is an error", async () => {
    await assert.rejects(safeFetch(url("/404"), seams()), (e: unknown) => e instanceof SafeFetchError && e.code === "bad_status");
  });
  test("defaults refuse the local server outright", async () => {
    await assert.rejects(safeFetch(`http://127.0.0.1:${port}/ok`), (e: unknown) => e instanceof SafeFetchError && e.code === "blocked");
  });
});
