/**
 * lib/machine-secret.js — CP-109
 *
 * The PURE half of the CP-88 machine-auth gate: no Next.js, no Supabase,
 * no side effects — so the fail-closed behavior is covered by plain
 * `node --test tests/` (tests/machine-secret.test.mjs) with zero extra
 * dependencies. Deliberately CommonJS JavaScript (+ .d.ts) so both the
 * Next bundler and raw Node can load the SAME file; lib/api-auth.ts
 * re-exports everything from here.
 */

/**
 * Length-checked, branch-free comparison. Not a true constant-time compare
 * (JS strings make that impossible) but it doesn't early-exit on the first
 * differing byte, which is the leak worth closing here.
 * @param {string} a  @param {string} b  @returns {boolean}
 */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The configured machine secret, or null when the deployment has none.
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
function machineSecret(env = process.env) {
  const s = (env.CRON_SECRET ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Does this request carry the machine secret in either accepted header?
 * @param {{ headers: { get(name: string): string | null } }} req
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function hasMachineSecret(req, env = process.env) {
  const secret = machineSecret(env);
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
 * @param {{ headers: { get(name: string): string | null } }} req
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true } | { ok: false; status: number; error: string }}
 */
function requireMachineSecret(req, env = process.env) {
  if (!machineSecret(env)) {
    return {
      ok: false,
      status: 503,
      error: "route disabled: CRON_SECRET is not configured on this deployment",
    };
  }
  if (!hasMachineSecret(req, env)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

module.exports = { safeEqual, machineSecret, hasMachineSecret, requireMachineSecret };
