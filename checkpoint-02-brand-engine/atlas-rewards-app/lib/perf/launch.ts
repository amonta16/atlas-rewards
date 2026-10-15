/**
 * lib/perf/launch.ts — CP-211 · server-side launch timing
 *
 * `timed("membership", promise)` records how long one launch step took and
 * when it started relative to the first timed step of this request, so the
 * Vercel logs show the real waterfall:
 *
 *   [launch] k3x9 /app  membership   start +71ms   took 69ms
 *
 * Off unless ATLAS_LAUNCH_TIMING=1 (set it in Vercel for a measurement
 * window, then remove). When off, `timed` is a pass-through.
 * Per-request state lives in React cache(), so concurrent requests never mix.
 */
import { cache } from "react";

const on = () => process.env.ATLAS_LAUNCH_TIMING === "1";

const store = cache(() => ({ id: Math.random().toString(36).slice(2, 6), t0: Date.now() }));

export function timed<T>(label: string, p: PromiseLike<T>): Promise<T> {
  if (!on()) return Promise.resolve(p);
  const s = store();
  const start = Date.now();
  return Promise.resolve(p).then(
    (v) => { console.info(`[launch] ${s.id} ${label.padEnd(22)} start +${String(start - s.t0).padStart(4)}ms  took ${String(Date.now() - start).padStart(4)}ms`); return v; },
    (e) => { console.info(`[launch] ${s.id} ${label.padEnd(22)} start +${start - s.t0}ms  FAILED after ${Date.now() - start}ms`); throw e; },
  );
}
