"use client";
/**
 * lib/shared-rpc.ts — CP-211 · one launch request per question
 *
 * On a cold open several independent components ask Supabase the SAME
 * thing within a few hundred ms (featured_offer ×3, featured_raffle ×2,
 * get_streak_status ×2). sharedRpc() collapses those into one request:
 * the first caller fires it, everyone asking the same (name, args) within
 * `maxAgeMs` gets the same promise.
 *
 * Use it for the INITIAL load only. Realtime refreshes must call
 * supabase.rpc() directly — they exist precisely because the data changed.
 * Errors are never cached: a failed request is dropped so the next caller
 * retries (offline / flaky network behaviour is unchanged).
 */
import { createClient } from "@/lib/supabase/client";

type Res<T> = { data: T | null; error: { message: string } | null };
const entries = new Map<string, { at: number; p: Promise<Res<unknown>> }>();

export function sharedRpc<T = unknown>(name: string, args: Record<string, unknown>, maxAgeMs = 4000): Promise<Res<T>> {
  const key = `${name}:${JSON.stringify(args)}`;
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.p as Promise<Res<T>>;
  const p = (async () => {
    const r = await createClient().rpc(name, args);
    return { data: (r.data ?? null) as T | null, error: r.error ? { message: r.error.message } : null };
  })();
  entries.set(key, { at: Date.now(), p });
  p.then((r) => { if (r.error) entries.delete(key); }, () => entries.delete(key));
  return p as Promise<Res<T>>;
}
