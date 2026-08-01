/**
 * lib/api-auth.ts — CP-88
 *
 * Shared auth gates for machine-callable API routes (Vercel cron targets,
 * Supabase Database Webhooks, pg_net callers).
 *
 * Why this exists: three routes were reachable by anyone on the internet.
 * `/api/notifications/push-fanout` accepted `{record:{user_id,title,body}}`
 * from any caller and sent a phone push to that user via the service-role
 * client — arbitrary push-spoofing into a client's branded app, at
 * unbounded cost. `/api/raffles/sweep` ran a global service-role WRITE with
 * a header comment saying "No auth required." And
 * `/api/notifications/process-pending` had the classic fail-OPEN shape:
 *
 *     if (cronSecret && auth !== `Bearer ${cronSecret}`) return 401;
 *
 * — i.e. when `CRON_SECRET` is unset the check is skipped entirely, which
 * is exactly the deployment where you least want it skipped. These gates
 * fail CLOSED: no secret configured means the route refuses to run and says
 * so, rather than quietly serving the world.
 *
 * Two accepted credentials:
 *   • `Authorization: Bearer <CRON_SECRET>` — what Vercel Cron sends.
 *   • `x-atlas-secret: <CRON_SECRET>`       — for Supabase Database
 *     Webhooks, which let you set custom headers but not the Authorization
 *     header reliably.
 */
import { createClient as createServer } from "@/lib/supabase/server";

export type GateResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Length-checked, branch-free comparison. Not a true constant-time compare
 * (JS strings make that impossible) but it doesn't early-exit on the first
 * differing byte, which is the leak worth closing here.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The configured machine secret, or null when the deployment has none. */
export function machineSecret(): string | null {
  const s = (process.env.CRON_SECRET ?? "").trim();
  return s.length > 0 ? s : null;
}

/** Does this request carry the machine secret in either accepted header? */
export function hasMachineSecret(req: Request): boolean {
  const secret = machineSecret();
  if (!secret) return false;

  const auth = (req.headers.get("authorization") ?? "").trim();
  if (auth.startsWith("Bearer ") && safeEqual(auth.slice(7).trim(), secret)) return true;

  const custom = (req.headers.get("x-atlas-secret") ?? "").trim();
  return custom.length > 0 && safeEqual(custom, secret);
}

/**
 * Machine-only routes (cron targets, DB webhooks). Fails closed.
 *
 * Returns 503 rather than 401 when no secret is configured, so a
 * misconfigured deployment is loud and distinguishable from a caller
 * presenting the wrong credential.
 */
export function requireMachineSecret(req: Request): GateResult {
  if (!machineSecret()) {
    return {
      ok: false,
      status: 503,
      error: "route disabled: CRON_SECRET is not configured on this deployment",
    };
  }
  if (!hasMachineSecret(req)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

/**
 * Routes a machine calls on a schedule AND a signed-in staff member may
 * trigger by hand from the dashboard. Blocks anonymous callers, which is
 * the actual hole — an unauthenticated service-role write endpoint is
 * trivially DoS-able and can be used to drive push fan-out.
 */
export async function requireMachineSecretOrSession(req: Request): Promise<GateResult> {
  if (hasMachineSecret(req)) return { ok: true };
  try {
    const { data: { user } } = await createServer().auth.getUser();
    if (user) return { ok: true };
  } catch {
    /* fall through to unauthorized */
  }
  return { ok: false, status: 401, error: "unauthorized" };
}
