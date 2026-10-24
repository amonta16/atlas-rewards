"use client";
/** CP-217 · emits app.opened once per browser session (feeds "New in the app" and win-back logic). */
import { useEffect } from "react";
import { track } from "@/lib/automations/track";

export function TrackOpen({ businessId, enabled }: { businessId: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    try {
      const k = `atlas.opened.${businessId}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch { /* private mode: fall through, the server dedupes */ }
    track(businessId, "app.opened", {});
  }, [businessId, enabled]);
  return null;
}
