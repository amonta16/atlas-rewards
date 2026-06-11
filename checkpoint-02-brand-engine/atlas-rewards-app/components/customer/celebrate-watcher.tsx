"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ConfettiCelebration } from "./confetti-celebration";
// CP-46: queue behind the notification onboarding + any other overlay so
// the confetti never lands on top of the bell spotlight or a gift reveal.
import { claimPopup, releasePopup, useActivePopup, PopupPriority } from "@/lib/popup-coordinator";
import { isBellOnboardDone } from "./enable-push-nudge";

/**
 * Watches for:
 *   (a) ?celebrate=<amount> URL param  (signup welcome bonus)
 *   (b) Realtime points_ledger inserts on the current member's row (manager awards)
 * Both surface the same full-screen confetti celebration.
 */
export function CelebrateWatcher({
  businessName, primary, membershipId, businessId,
}: { businessName: string; primary: string; membershipId: string | null; businessId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  // CP-45: same slug-aware base as the app shell — a hard "/app/rewards"
  // push 404s when the app is accessed path-based (/<slug>/app).
  const basePath = pathname?.match(/^(.*?\/app)(\/|$)/)?.[1] ?? "/app";
  const [amount, setAmount] = useState<number | null>(null);
  // CP-46: bell-onboarding gate so confetti waits for the notification ask.
  const [bellReady, setBellReady] = useState(false);
  const active = useActivePopup();

  // (a) URL param trigger
  // CP-32 go-live: read from window.location instead of useSearchParams()
  // — that hook bails out of static prerender and breaks our prod build.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("celebrate");
    if (raw && parseInt(raw, 10) > 0) setAmount(parseInt(raw, 10));
  }, []);

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
          // Skip the welcome bonus (handled by URL param) and the welcome
          // GIFT credit (CP-46: rule_type 'signup_bonus' — the gift reveal
          // popup owns that moment, so we don't also fire confetti for it),
          // plus any negative entries (redemptions).
          if (row.delta > 0
              && row.rule_type !== "first_visit_bonus"
              && row.rule_type !== "signup_bonus") {
            setAmount(row.delta);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membershipId]);

  // CP-46: claim the screen when we have a celebration, and poll the bell
  // gate so we don't pop over the notification onboarding.
  useEffect(() => {
    if (amount === null) return;
    claimPopup("celebrate", PopupPriority.celebrate);
    const tick = () => setBellReady(isBellOnboardDone(businessId));
    tick();
    const iv = window.setInterval(tick, 400);
    return () => { window.clearInterval(iv); releasePopup("celebrate"); };
  }, [amount, businessId]);

  // Render only once we own the screen AND the bell moment is finished.
  if (amount === null || !bellReady || active !== "celebrate") return null;

  return (
    <ConfettiCelebration
      amount={amount}
      businessName={businessName}
      primary={primary}
      onDismiss={() => {
        releasePopup("celebrate");
        setAmount(null);
        router.push(`${basePath}/rewards`);
        router.refresh();
      }}
    />
  );
}
