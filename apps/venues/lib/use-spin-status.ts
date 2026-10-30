"use client";
/**
 * useSpinStatus — CP-221
 *
 * One read of the member's spin state for every wheel surface:
 *   • checkin_available — checked in today and today's visit spin is unused
 *   • home_available    — this week's free home spin is unused (entertainment apps)
 * Backed by the my_spin_status RPC. Returns null until loaded, and stays null
 * if the RPC isn't deployed (callers keep their pre-CP-221 behaviour).
 * Refreshes on focus, on a slow poll, and when a caller calls reload()
 * (e.g. after the wheel closes). No realtime channel — keeps the per-member
 * connection count where CP-88 left it.
 */
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { jitteredPollMs } from "@/lib/realtime-jitter";

export type SpinStatus = {
  checked_in_today: boolean;
  checkin_available: boolean;
  home_enabled: boolean;
  home_available: boolean;
  home_spun_at: string | null;
  home_resets_at: string | null;
};

export function useSpinStatus(businessId: string, membershipId: string | null | undefined) {
  const [status, setStatus] = useState<SpinStatus | null>(null);

  const load = useCallback(async () => {
    if (!membershipId) return;
    const { data, error } = await createClient().rpc("my_spin_status", {
      p_business_id: businessId, p_membership_id: membershipId,
    });
    if (error) return;
    const row = (Array.isArray(data) ? data[0] : data) as SpinStatus | null;
    setStatus(row ?? null);
  }, [businessId, membershipId]);

  useEffect(() => {
    if (!membershipId) return;
    load();
    const poll = setInterval(load, jitteredPollMs());
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [membershipId, load]);

  return { status, reload: load };
}
