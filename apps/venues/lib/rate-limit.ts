/**
 * rate-limit — CP-44
 *
 * A tiny, dependency-free rate limiter for the public API routes.
 *
 *  • If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, it uses
 *    Upstash Redis (atomic INCR + EXPIRE over their REST API) — shared
 *    across every Vercel region, survives deploys. This is the real one.
 *  • Otherwise it falls back to an in-memory counter per server instance
 *    (resets on deploy, not shared across regions) — weaker, but means
 *    rate limiting works the moment you deploy, with zero setup, and
 *    auto-upgrades to the strong version once you add the Upstash keys.
 *
 * Usage in a route handler:
 *   const rl = await rateLimit(clientKey(req, "webhook"), 30, 60);
 *   if (!rl.ok) return tooMany(rl.retryAfter);
 */

type Result = { ok: boolean; remaining: number; limit: number; retryAfter: number };

const mem = new Map<string, { count: number; reset: number }>();

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<Result> {
  const bucket = `rl:${key}`;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const incr = await fetch(`${url}/incr/${encodeURIComponent(bucket)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).then((r) => r.json());
      const n = Number(incr?.result ?? 0);
      if (n === 1) {
        await fetch(`${url}/expire/${encodeURIComponent(bucket)}/${windowSec}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
      }
      return { ok: n <= limit, remaining: Math.max(0, limit - n), limit, retryAfter: windowSec };
    } catch {
      // Upstash unreachable → fall through to in-memory so we never hard-fail open.
    }
  }

  // In-memory fallback.
  const now = Date.now();
  const e = mem.get(bucket);
  if (!e || e.reset < now) {
    mem.set(bucket, { count: 1, reset: now + windowSec * 1000 });
    // Opportunistic cleanup so the map doesn't grow unbounded.
    if (mem.size > 5000) for (const [k, v] of mem) if (v.reset < now) mem.delete(k);
    return { ok: true, remaining: limit - 1, limit, retryAfter: windowSec };
  }
  e.count++;
  return {
    ok: e.count <= limit,
    remaining: Math.max(0, limit - e.count),
    limit,
    retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)),
  };
}

/** Build a per-caller key from the request IP (+ an optional namespace). */
export function clientKey(req: Request, namespace = ""): string {
  const xff = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const ip = xff.split(",")[0].trim() || "unknown";
  return `${namespace}:${ip}`;
}

/** Standard 429 response. */
export function tooMany(retryAfterSec = 60): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests — please slow down and try again shortly." }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSec) },
    },
  );
}
