"use client";
import { useEffect, useState } from "react";
import { Sparkles, Gift, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type MysteryResult = {
  prize_name: string;
  prize_description: string | null;
  points_awarded: number | null;
  reward_id: string | null;
};

/**
 * Customer-facing Mystery Reward widget.
 *
 *   • Shows a wrapped "gift" until the member taps to spin.
 *   • Calls spin_mystery_reward (server-side weighted picker — lives in
 *     CP-04B's SQL). Returns either a points award or a redeemable reward.
 *   • Becomes available again after the cooldown the agency sets
 *     (configurable per-business; default = 1 spin per 24h).
 *
 * Falls back gracefully if the RPC isn't installed yet (server returns
 * "function not found" → we just keep the widget hidden).
 */
export function MysteryRewardCard({ business, membershipId }: { business: Business; membershipId: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [nextAt, setNextAt]       = useState<string | null>(null);
  const [spinning, setSpinning]   = useState(false);
  const [result, setResult]       = useState<MysteryResult | null>(null);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  // Probe availability on mount
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("mystery_reward_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      if (error) { setAvailable(false); return; }   // RPC not installed yet
      const row = Array.isArray(data) ? data[0] : data;
      setAvailable(!!row?.is_available);
      setNextAt(row?.next_spin_at ?? null);
    })();
  }, [business.id, membershipId]);

  async function spin() {
    if (!available || spinning) return;
    setSpinning(true);
    setResult(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("spin_mystery_reward", {
      p_business_id: business.id,
      p_membership_id: membershipId,
    });
    setSpinning(false);
    if (error) {
      // graceful — keep the card looking normal but mark unavailable
      setAvailable(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setResult(row as MysteryResult);
    setAvailable(false);
  }

  // If the RPC has never returned anything (un-installed or no pool), hide the card.
  if (available === null) return null;
  if (available === false && !result && !nextAt) return null;

  return (
    <div className="px-4 mt-5">
      <h2 className="text-base font-bold mb-2.5 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4" style={{ color: primary }} /> Mystery Reward
      </h2>

      <button
        onClick={spin}
        disabled={!available || spinning}
        className="w-full rounded-2xl overflow-hidden text-left active:scale-[0.98] transition shadow-lg disabled:active:scale-100"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
        }}
      >
        <div className="p-5 relative text-white">
          {/* Sparkle dots */}
          <Sparkles className="absolute top-3 right-3 h-4 w-4 opacity-60" />
          <Sparkles className="absolute bottom-3 left-5 h-3 w-3 opacity-40" />
          <Sparkles className="absolute top-10 left-10 h-2 w-2 opacity-30" />

          {result ? (
            // ============== POST-SPIN RESULT ==============
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm">
                <Check className="h-8 w-8" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider opacity-80 font-bold">You won</div>
                <div className="text-xl font-extrabold leading-tight mt-0.5 truncate">{result.prize_name}</div>
                {result.points_awarded != null && (
                  <div className="text-sm font-semibold mt-0.5">+{result.points_awarded.toLocaleString()} points</div>
                )}
              </div>
            </div>
          ) : available ? (
            // ============== READY TO SPIN ==============
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm">
                {spinning
                  ? <Loader2 className="h-8 w-8 animate-spin" />
                  : <Gift className="h-9 w-9" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider opacity-80 font-bold">Today's mystery</div>
                <div className="text-xl font-extrabold leading-tight mt-0.5">
                  {spinning ? "Spinning…" : "Tap to unwrap"}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">Could be points, a free item, or something rare ✨</div>
              </div>
            </div>
          ) : (
            // ============== COOLDOWN ==============
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <Gift className="h-8 w-8 opacity-60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider opacity-70 font-bold">Come back soon</div>
                <div className="text-base font-bold leading-tight mt-0.5">
                  {nextAt
                    ? `Next spin ${new Date(nextAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`
                    : "You already spun today"}
                </div>
              </div>
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
