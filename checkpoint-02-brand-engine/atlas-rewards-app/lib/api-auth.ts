/**
 * lib/api-auth.ts — CP-88, split in CP-109
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
 *
 * CP-109: the pure logic moved to lib/machine-secret.ts so `node --test`
 * can verify the fail-closed behavior without a Next.js runtime. This
 * module keeps the same public API (plus the session-aware gate, which
 * needs the Supabase server client and so stays here).
 */
import { createClient as createServer } from "@/lib/supabase/server";
import {
  machineSecret, hasMachineSecret, requireMachineSecret, safeEqual,
  type GateResult,
} from "@/lib/machine-secret";

export { machineSecret, hasMachineSecret, requireMachineSecret, safeEqual };
export type { GateResult };

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
