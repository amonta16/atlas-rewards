"use client";
/**
 * useDeskActions — CP-148 · "what needs a human" counts for the front desk
 *
 *   reviews      pending Google-review / IG / FB follow requests (customer
 *                tapped "I did it", staff must verify)  → Front desk tab
 *   bookings     booking requests from the app still 'pending' (upcoming) → Bookings tab
 *   memberships  passes bought in person / by link awaiting confirmation  → Front desk tab
 *
 * Polled (2 min + on window focus), never realtime — CP-85/88 taught us
 * what a router.refresh() stampede costs. All three RPCs are staff-gated
 * and return [] on a DB that predates them, so the badge simply stays off.
 */
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type DeskActions = { reviews: number; bookings: number; memberships: number; total: number };

const EMPTY: DeskActions = { reviews: 0, bookings: 0, memberships: 0, total: 0 };

export function useDeskActions(businessId: string, pollMs = 120_000): DeskActions & { refresh: () => void } {
  const [counts, setCounts] = useState<DeskActions>(EMPTY);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const now = new Date();
    const [rev, bk, mem] = await Promise.all([
      supabase.rpc("pending_reviews_for_business", { p_business_id: businessId }),
      supabase.rpc("list_resource_bookings", {
        p_business_id: businessId,
        p_from: new Date(now.getTime() - 86_400_000).toISOString(),
        p_to: new Date(now.getTime() + 60 * 86_400_000).toISOString(),
      }),
      supabase.rpc("list_pending_memberships", { p_business_id: businessId }),
    ]);
    const reviews = rev.error ? 0 : (rev.data ?? []).length;
    const bookings = bk.error ? 0 : ((bk.data ?? []) as { status: string; scheduled_end: string }[])
      .filter(b => b.status === "pending" && new Date(b.scheduled_end).getTime() > now.getTime()).length;
    const memberships = mem.error ? 0 : (mem.data ?? []).length;
    setCounts({ reviews, bookings, memberships, total: reviews + bookings + memberships });
  }, [businessId]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [refresh, pollMs]);

  return { ...counts, refresh };
}
