"use client";
/**
 * lib/automations/track.ts — CP-217 · fire-and-forget app events for the
 * automation engine (track_event RPC). Never throws, never blocks the UI.
 * Throttled per type+item for 10 minutes in this tab; the server dedupes too.
 */
import { createClient } from "@/lib/supabase/client";
import type { TrackEventType } from "./types";

const WINDOW_MS = 10 * 60 * 1000;
const last = new Map<string, number>();
const isLocal = () => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

export function track(businessId: string | null | undefined, type: TrackEventType, payload: Record<string, unknown> = {}): void {
  try {
    if (!businessId || typeof window === "undefined") return;
    const key = `${businessId}|${type}|${String(payload.item_id ?? "")}`;
    const now = Date.now();
    if ((last.get(key) ?? 0) > now - WINDOW_MS) return;
    last.set(key, now);
    if (isLocal()) return;
    void Promise.resolve(createClient().rpc("track_event", { p_business_id: businessId, p_type: type, p_payload: payload }))
      .then(() => undefined, () => undefined);
  } catch { /* tracking must never break the app */ }
}
