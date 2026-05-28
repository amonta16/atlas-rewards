"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ConfettiCelebration } from "./confetti-celebration";

/**
 * Watches for:
 *   (a) ?celebrate=<amount> URL param  (signup welcome bonus)
 *   (b) Realtime points_ledger inserts on the current member's row (manager awards)
 * Both surface the same full-screen confetti celebration.
 */
export function CelebrateWatcher({
  businessName, primary, membershipId,
}: { businessName: string; primary: string; membershipId: string | null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [amount, setAmount] = useState<number | null>(null);

  // (a) URL param trigger
  useEffect(() => {
    const raw = sp.get("celebrate");
    if (raw && parseInt(raw, 10) > 0) setAmount(parseInt(raw, 10));
  }, [sp]);

  // (b) Realtime ledger insert trigger
  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`ledger-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "points_ledger", filter: `membership_id=eq.${membershipId}` },
        (payload) => {
          const row = payload.new as { delta: number; rule_type: string };
          // Skip the welcome bonus (already handled by URL param) and any negative entries (redemptions)
          if (row.delta > 0 && row.rule_type !== "first_visit_bonus") {
            setAmount(row.delta);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membershipId]);

  if (amount === null) return null;

  return (
    <ConfettiCelebration
      amount={amount}
      businessName={businessName}
      primary={primary}
      onDismiss={() => {
        setAmount(null);
        router.push("/app/rewards");
        router.refresh();
      }}
    />
  );
}
