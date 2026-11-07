/**
 * lib/preview/ip.ts — CP-232 · is this IP address on the public internet?
 *
 * Used by the SSRF guard (safe-fetch.ts) on every address a spa's hostname
 * resolves to, at connect time. Anything that isn't plainly public is blocked:
 * private, loopback, link-local (cloud metadata lives at 169.254.169.254),
 * CGNAT, multicast, reserved, documentation ranges, and IPv6 forms that embed
 * an IPv4 address (mapped, NAT64, 6to4) are judged by the IPv4 inside.
 */
import { isIP } from "node:net";

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** [network, prefix] pairs that are never public. */
const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];
const V4_RANGES = V4_BLOCKED.map(([net, bits]) => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (v4ToInt(net)! & mask) >>> 0, mask };
});

export function isPublicIPv4(ip: string): boolean {
  const n = v4ToInt(ip);
  if (n === null) return false;
  return !V4_RANGES.some((r) => ((n & r.mask) >>> 0) === r.base);
}

/** Expand an IPv6 address into 8 16-bit numbers (handles "::" and a dotted IPv4 tail). */
export function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // dotted IPv4 tail, e.g. ::ffff:10.0.0.1
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const n = v4ToInt(tail);
    if (n === null) return null;
    s = `${s.slice(0, lastColon + 1)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

export function isPublicIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return false;
  const allZeroTo = (k: number) => g.slice(0, k).every((x) => x === 0);
  if (allZeroTo(8)) return false; // ::
  if (allZeroTo(7) && g[7] === 1) return false; // ::1
  if (allZeroTo(5) && g[5] === 0xffff) return isPublicIPv4(v4From(g[6], g[7])); // ::ffff:a.b.c.d
  if (allZeroTo(6)) return isPublicIPv4(v4From(g[6], g[7])); // ::a.b.c.d (deprecated compat)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPublicIPv4(v4From(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPublicIPv4(v4From(g[1], g[2])); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return false; // Teredo
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard-only
  // Only global unicast (2000::/3) is public.
  return (g[0] & 0xe000) === 0x2000;
}

export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPublicIPv4(ip);
  if (kind === 6) return isPublicIPv6(ip);
  return false;
}
