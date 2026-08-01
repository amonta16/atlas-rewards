"use client";
import { useEffect, useState } from "react";
import { Sparkles, Gift, Loader2, Check, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { jitteredPollMs } from "@/lib/realtime-jitter";
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
 *
 * CP-37.2 fix: now subscribes to mystery_reward_spins INSERTs + polls
 * mystery_reward_status on focus, so the card flips to "cooldown" the
 * moment a spin lands — same logic as the Home-tab DailySpinButton.
 * Before this, the Rewards-tab card kept saying "Tap to unwrap" after
 * the customer spun on Home, because nothing reloaded availability.
 */
export function MysteryRewardCard({ business, membershipId }: { business: Business; membershipId: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [nextAt, setNextAt]       = useState<string | null>(null);
  const [spinning, setSpinning]   = useState(false);
  const [result, setResult]       = useState<MysteryResult | null>(null);
  // CP-37.2: tick once a second so the countdown stays live.
  const [, forceRerender]         = useState(0);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  // Probe availability on mount + subscribe to spin events.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("mystery_reward_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      if (cancelled) return;
      if (error) { setAvailable(false); return; }   // RPC not installed yet
      const row = Array.isArray(data) ? data[0] : data;
      setAvailable(!!row?.is_available);
      setNextAt(row?.next_spin_at ?? null);
    };
    load();

    // Realtime: a spin landing in mystery_reward_spins flips the card
    // from "ready" → "cooldown" within a heartbeat.
    const ch = supabase
      .channel(`mystery-card-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mystery_reward_spins", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();

    // Re-poll when the tab regains focus — catches the case where the
    // customer spun on the Home tab and switched back here.
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);

    // Tick once a second so the relative-time copy stays fresh, plus a
    // 60s safety re-poll if realtime drops.
    const tick = setInterval(() => forceRerender(t => t + 1), 1000);
    // CP-89: safety-net poll raised from 60s to ~5min (realtime + onVis
    // above are the real update paths).
    const poll = setInterval(load, jitteredPollMs());

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(tick);
      clearInterval(poll);
    };
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
            // CP-37.2: business logo in the icon slot (when available)
            // so the reveal feels branded — Andrew called out the
            // generic Check / sparkle as off-brand.
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center shrink-0 backdrop-blur-sm overflow-hidden ring-2 ring-white/60">
                {business.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={business.logo_url} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Check className="h-8 w-8" style={{ color: primary }} />
                )}
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
            // CP-37.2: live HH:MM:SS countdown matching the Home-tab
            // DailySpinButton, instead of a static "Next spin Tue 9:00".
            (() => {
              const msLeft = nextAt ? Math.max(0, new Date(nextAt).getTime() - Date.now()) : 0;
              const hh = Math.floor(msLeft / 3_600_000);
              const mm = Math.floor((msLeft % 3_600_000) / 60_000);
              const ss = Math.floor((msLeft % 60_000) / 1000);
              const pad = (n: number) => String(n).padStart(2, "0");
              const countdown = hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
              return (
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                    <Clock className="h-8 w-8 opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wider opacity-70 font-bold">Already spun today</div>
                    <div className="text-2xl font-extrabold leading-tight mt-0.5 tabular-nums">
                      {nextAt ? countdown : "Come back tomorrow"}
                    </div>
                    {nextAt && (
                      <div className="text-[11px] opacity-80 mt-0.5">until your next spin</div>
                    )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </button>
    </div>
  );
}
