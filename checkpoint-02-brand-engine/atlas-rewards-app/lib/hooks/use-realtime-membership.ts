"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MembershipLite = {
  id: string;
  points_balance: number;
  tier: string;
  lifetime_points_earned: number;
};

/**
 * Subscribes to a customer's own membership row + their ledger inserts.
 * Returns a live `membership` object and a `lastEarn` event (so the UI
 * can show confetti when positive ledger entries arrive in real time).
 *
 * RLS guarantees the customer only receives events for their own rows.
 */
export function useRealtimeMembership(initial: MembershipLite | null) {
  const [membership, setMembership] = useState<MembershipLite | null>(initial);
  const [lastEarn, setLastEarn] = useState<{ delta: number; rule_type: string; created_at: string } | null>(null);

  useEffect(() => {
    if (!initial?.id) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`membership-${initial.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "business_memberships", filter: `id=eq.${initial.id}` },
        (payload) => {
          const next = payload.new as MembershipLite;
          setMembership(prev => ({ ...(prev ?? next), ...next }));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "points_ledger", filter: `membership_id=eq.${initial.id}` },
        (payload) => {
          const row = payload.new as { delta: number; rule_type: string; created_at: string };
          if (row.delta > 0) setLastEarn(row);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initial?.id]);

  return { membership, lastEarn, clearLastEarn: () => setLastEarn(null) };
}
