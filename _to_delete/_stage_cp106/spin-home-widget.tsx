"use client";
/**
 * SpinHomeWidget — CP-42
 *
 * Compact spin-availability card for the customer Home tab, lives
 * directly under the Featured Offer. Shows one of three states:
 *
 *   • Ready   — bright "Spin now" CTA (taps land them on /app/rewards
 *               where the existing MysteryRewardCard handles the
 *               actual spin animation + prize reveal)
 *   • Cooldown — disabled card with a live HH:MM:SS countdown to
 *                the next spin
 *   • Disabled — silently hides (business hasn't configured mystery)
 *
 * Drift-proof: countdown is derived from an absolute `nextAt` Date
 * each render, same pattern as the CP-42 check-in chip rewrite.
 *
 * Also pulls the prize pool count via mystery_reward_status so we can
 * pop "X possible prizes" copy that motivates the spin.
 */
import { useEffect, useState } from "react";
import { Sparkles, Clock, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { jitteredPollMs } from "@/lib/realtime-jitter";

type Status = {
  is_available: boolean;
  next_spin_at: string | null;
};

export function SpinHomeWidget({
  businessId,
  membershipId,
  businessSlug,
  primary,
  secondary,
}: {
  businessId: string;
  membershipId: string;
  businessSlug: string;
  primary: string;
  secondary?: string | null;
}) {
  const [status, setStatus] = useState<Status | null | "loading">("loading");
  const [, forceRerender] = useState(0);
  const sec = secondary || primary;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const { data, error } = await supabase.rpc("mystery_reward_status", {
        p_business_id: businessId,
        p_membership_id: membershipId,
      });
      if (cancelled) return;
      if (error) { setStatus(null); return; }
      const row = (Array.isArray(data) ? data[0] : data) as Status | null;
      setStatus(row);
    };
    load();

    // Re-render every second so the countdown ticks visibly.
    const tick = setInterval(() => forceRerender(t => t + 1), 1000);
    // CP-89: safety-net poll raised from 60s to ~5min (realtime + the
    // onVis refresh below are the real update paths).
    const poll = setInterval(load, jitteredPollMs());
    // Refresh on focus.
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);

    // Realtime: pick up a new spin landing on the customer's account.
    const ch = supabase
      .channel(`spin-home-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mystery_reward_spins", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
  }, [businessId, membershipId]);

  // Silently hide while loading + when mystery isn't configured.
  if (status === "loading" || status === null) return null;

  const ready = !!status.is_available;
  const nextAt = status.next_spin_at ? new Date(status.next_spin_at) : null;
  const msLeft = nextAt ? Math.max(0, nextAt.getTime() - Date.now()) : 0;
  const hh = Math.floor(msLeft / 3_600_000);
  const mm = Math.floor((msLeft % 3_600_000) / 60_000);
  const ss = Math.floor((msLeft % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const countdown = hh > 0
    ? `${hh}:${pad(mm)}:${pad(ss)}`
    : `${pad(mm)}:${pad(ss)}`;

  return (
    <div className="px-4 mt-4">
      {ready ? (
        <a
          href={`/${businessSlug}/app/rewards#mystery-reward`}
          className="block relative rounded-3xl overflow-hidden text-white shadow-xl active:scale-[0.98] transition-transform"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, ${sec} 60%, ${primary} 100%)`,
          }}
        >
          {/* shimmer + blob */}
          <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/15 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-8 w-52 h-52 rounded-full bg-black/10 blur-3xl pointer-events-none" />

          <div className="relative px-5 py-4 flex items-center gap-4">
            {/* Animated gift mark */}
            <div
              className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/40 flex items-center justify-center shrink-0"
              style={{ animation: "atlas-spin-wiggle 1.4s ease-in-out infinite" }}
            >
              <Gift className="h-7 w-7 text-white drop-shadow" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-extrabold bg-white/25 px-2 py-0.5 rounded-full mb-1">
                <Sparkles className="h-2.5 w-2.5" /> Mystery spin
              </div>
              <div className="text-lg font-black leading-tight drop-shadow">Your spin is ready</div>
              <div className="text-xs text-white/90 leading-tight">Tap to find out what you won</div>
            </div>
            <div className="text-white/80 text-2xl shrink-0">→</div>
          </div>

          <style>{`
            @keyframes atlas-spin-wiggle {
              0%, 100% { transform: rotate(0deg); }
              25% { transform: rotate(-6deg); }
              75% { transform: rotate(6deg); }
            }
          `}</style>
        </a>
      ) : (
        <div
          className="rounded-3xl overflow-hidden border bg-white shadow-sm"
          style={{ borderColor: `${primary}22` }}
        >
          <div className="px-5 py-4 flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${primary}12` }}
            >
              <Clock className="h-6 w-6" style={{ color: primary }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-extrabold text-zinc-500">
                Next mystery spin
              </div>
              <div className="text-lg font-black leading-tight tabular-nums" style={{ color: primary }}>
                {countdown}
              </div>
              <div className="text-[11px] text-zinc-500 leading-tight">We'll ping you when it's ready</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
