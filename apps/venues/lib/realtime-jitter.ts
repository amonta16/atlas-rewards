"use client";
/**
 * lib/realtime-jitter.ts — CP-88
 *
 * Spreads out realtime-triggered reloads so N connected customers don't all
 * hit the server in the same instant.
 *
 * The problem this solves: a per-business Realtime topic delivers one
 * message to every connected customer simultaneously. If each of them
 * responds by immediately re-querying, one manager action becomes N
 * concurrent requests — the same burst shape as the July 25 auth storm,
 * except triggered by someone doing their job. With 1,000 connected
 * customers and Supabase Pro's 500 messages/second ceiling, lockstep
 * responses also blow straight through the Realtime quota.
 *
 * Two behaviours, both needed:
 *   • JITTER — each client waits a random slice of `maxDelayMs` before
 *     acting, turning a spike into a ramp.
 *   • COALESCE — while a reload is already scheduled, further events are
 *     dropped rather than queued. A manager dragging a slider can emit
 *     dozens of row updates in a second; the client only needs the final
 *     state, and one fetch gets it.
 *
 * `minGapMs` additionally floors the time between two executions, so a
 * steady drip of updates can't turn into a steady drip of fetches.
 *
 * Usage inside an effect:
 *
 *     const { handler, cancel } = createJitteredHandler(load);
 *     const ch = supabase.channel(...).on("postgres_changes", {...}, handler).subscribe();
 *     return () => { cancel(); supabase.removeChannel(ch); };
 *
 * Always call `cancel()` in cleanup — otherwise a pending timer can fire
 * after unmount and call setState on a dead component.
 */

export type JitterOptions = {
  /** Upper bound of the random delay. Default 4000ms. */
  maxDelayMs?: number;
  /** Minimum time between two executions. Default 1000ms. */
  minGapMs?: number;
};

export type JitteredHandler = {
  /** Pass this as the realtime callback. */
  handler: () => void;
  /** Call in effect cleanup. Drops any pending run. */
  cancel: () => void;
};

/**
 * CP-89: interval for "safety net" polls that back up a realtime
 * subscription.
 *
 * Six customer components used to re-poll every 60 seconds "in case
 * realtime drops" — even though each already had (a) a realtime
 * subscription on the same data and, in most cases, (b) a visibilitychange
 * refresh. That redundancy cost ~240 requests/hour PER CUSTOMER sitting
 * idle on Home; at 200 concurrent sessions, ~48k requests/hour of pure
 * insurance.
 *
 * A safety net only has to catch the rare case where a realtime event was
 * silently missed while the tab stayed focused. Every 5-ish minutes is
 * plenty for that; the visibilitychange handler covers the common "user
 * came back to the tab" case instantly. The random spread stops all of a
 * business's customers from polling on the same tick.
 *
 * Do NOT quietly put a 60s interval back — if a surface really needs
 * fresher data than this, it needs a realtime subscription (or to fix the
 * one it has), not a faster poll.
 */
export function jitteredPollMs(baseMs = 300_000, spreadMs = 120_000): number {
  return baseMs + Math.floor(Math.random() * spreadMs);
}

export function createJitteredHandler(
  fn: () => void,
  options: JitterOptions = {},
): JitteredHandler {
  const maxDelayMs = Math.max(0, options.maxDelayMs ?? 4000);
  const minGapMs = Math.max(0, options.minGapMs ?? 1000);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRunAt = 0;
  let cancelled = false;

  function handler(): void {
    // Already scheduled → this event is covered by the pending run.
    if (cancelled || timer !== null) return;

    const sinceLastRun = Date.now() - lastRunAt;
    const gapWait = lastRunAt === 0 ? 0 : Math.max(0, minGapMs - sinceLastRun);
    const jitter = Math.floor(Math.random() * (maxDelayMs + 1));

    timer = setTimeout(() => {
      timer = null;
      if (cancelled) return;
      lastRunAt = Date.now();
      fn();
    }, gapWait + jitter);
  }

  function cancel(): void {
    cancelled = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { handler, cancel };
}
