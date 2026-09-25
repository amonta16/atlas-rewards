"use client";
/**
 * WheelPreviewCard — CP-152 · the Daily Spin you can't miss
 *
 * Full-width Home card with a LIVE miniature of the prize wheel — the real
 * segments from mystery_wheel_segments (same source the spin modal draws),
 * slowly turning — next to the state: "Spin now" (pulsing) · "Check in to
 * unlock" · "Next spin in 5h 12m". Tapping opens the same DailyMysteryModal
 * the Check-in tab uses, so nothing about the game changes; it just stops
 * hiding.
 *
 * Presets that already show the compact spin+streak row (custom / smoke /
 * food) don't render this; entertainment gets it under the points card.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Clock, Lock, Coins, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { jitteredPollMs } from "@/lib/realtime-jitter";
import { DailyMysteryModal } from "./daily-mystery-modal";
import { rewardGameMeta } from "@/lib/reward-games";
import type { Business } from "@/lib/types/database";

type Seg = { kind: "points" | "reward"; label: string; image: string | null };
type SpinStatus = { is_available: boolean; next_spin_at: string | null };

const DEFAULT: Seg[] = [
  { kind: "points", label: "50", image: null },
  { kind: "points", label: "100", image: null },
  { kind: "points", label: "300", image: null },
];

function fmtLeft(ms: number) {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60_000), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export function WheelPreviewCard({ business, membershipId }: { business: Business; membershipId: string }) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const isDemo = !!business.is_demo;
  const meta = rewardGameMeta(business.reward_game);
  const [pool, setPool] = useState<Seg[]>(DEFAULT);
  const [checkedIn, setCheckedIn] = useState(false);
  const [status, setStatus] = useState<SpinStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    createClient().rpc("mystery_wheel_segments", { p_business_id: business.id }).then(({ data, error }) => {
      if (cancelled || error) return;
      const rows = (data ?? []) as { kind: string; label: string | null; points_amount: number | null; image_url?: string | null }[];
      if (rows.length) setPool(rows.map(r => r.kind === "points"
        ? { kind: "points", label: String(r.points_amount ?? 0), image: r.image_url ?? null }
        : { kind: "reward", label: (r.label ?? "Prize").slice(0, 10), image: r.image_url ?? null }));
    });
    return () => { cancelled = true; };
  }, [business.id]);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const [{ data: ci }, st] = await Promise.all([
        supabase.from("check_in_events").select("id").eq("membership_id", membershipId).gte("created_at", dayStart.toISOString()).limit(1),
        supabase.rpc("mystery_reward_status", { p_business_id: business.id, p_membership_id: membershipId }),
      ]);
      setCheckedIn((ci?.length ?? 0) > 0);
      if (!st.error) setStatus(((Array.isArray(st.data) ? st.data[0] : st.data) as SpinStatus | null) ?? null);
    };
    load();
    const poll = setInterval(load, jitteredPollMs());
    const t = setInterval(() => tick(x => x + 1), 30_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(poll); clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [business.id, membershipId]);

  const count = Math.max(8, Math.min(16, pool.length));
  const segs = useMemo(() => Array.from({ length: count }, (_, i) => pool[i % pool.length]), [pool, count]);
  const angle = 360 / count;
  const maxPts = Math.max(0, ...pool.filter(s => s.kind === "points").map(s => parseInt(s.label, 10) || 0));
  const hasPrize = pool.some(s => s.kind === "reward");

  const knownNo = status !== null && status.is_available === false;
  const cooldown = !isDemo && knownNo && checkedIn && !!status?.next_spin_at;
  const ready = isDemo || (checkedIn && (status ? !!status.is_available : true));
  const leftMs = status?.next_spin_at ? new Date(status.next_spin_at).getTime() - Date.now() : 0;

  return (
    <>
      <div className="px-4 mt-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-3xl overflow-hidden text-left shadow-[0_18px_44px_-24px_rgba(15,23,42,0.5)] ring-1 ring-black/5 active:scale-[0.99] transition relative"
          style={{ background: `linear-gradient(120deg, #0f1026 0%, #181830 55%, ${primary}55 100%)` }}
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl pointer-events-none" style={{ background: `${secondary}55` }} />
          <div className="relative p-4 flex items-center gap-4">
            {/* mini wheel */}
            <div className="relative shrink-0" style={{ width: 112, height: 112 }}>
              <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 h-0 w-0 border-l-[7px] border-r-[7px] border-t-[12px] border-l-transparent border-r-transparent border-t-yellow-300 drop-shadow" />
              <div
                className="h-full w-full rounded-full animate-[wheelspin_28s_linear_infinite]"
                style={{
                  background: `conic-gradient(${segs.map((_, i) => `${i % 2 ? `${primary}dd` : "#23244a"} ${i * angle}deg ${(i + 1) * angle}deg`).join(", ")})`,
                  border: "3px solid #facc15",
                  boxShadow: `0 0 24px ${primary}66, inset 0 0 18px rgba(0,0,0,0.5)`,
                }}
              >
                {segs.map((s, i) => (
                  <div key={i} className="absolute inset-0 pointer-events-none" style={{ transform: `rotate(${i * angle + angle / 2}deg)` }}>
                    {/* CP-152.1: icon-only wedges — labels were unreadable at this size */}
                    <div className="absolute left-1/2 -translate-x-1/2 top-2 flex items-center justify-center text-white">
                      {s.image
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={s.image} alt="" className="h-6 w-6 rounded-full object-cover ring-2 ring-white/80 shadow" />
                        : s.kind === "points"
                          ? <span className="h-6 w-6 rounded-full bg-yellow-300 flex items-center justify-center shadow"><Coins className="h-3.5 w-3.5 text-zinc-900" /></span>
                          : <span className="h-6 w-6 rounded-full bg-white flex items-center justify-center shadow"><Gift className="h-3.5 w-3.5" style={{ color: primary }} /></span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 m-auto h-6 w-6 rounded-full bg-white shadow flex items-center justify-center">
                <Sparkles className="h-3 w-3" style={{ color: primary }} />
              </div>
            </div>

            {/* copy + state */}
            <div className="flex-1 min-w-0 text-white">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">{meta.title ?? "Daily spin"}</div>
              <div className="text-lg font-black leading-tight mt-0.5">
                {maxPts > 0 ? <>Win up to {maxPts.toLocaleString()} pts</> : "Win points & prizes"}
                {hasPrize && <span className="text-yellow-300"> + prizes</span>}
              </div>
              <div className="text-[11px] text-white/75 mt-0.5">One free spin every visit.</div>

              <div className="mt-3">
                {ready ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-extrabold text-zinc-900 bg-yellow-300 shadow-[0_0_0_0_rgba(250,204,21,0.7)] animate-[pulsering_1.6s_ease-out_infinite]">
                    <Sparkles className="h-4 w-4" /> Spin now
                  </span>
                ) : cooldown ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-bold bg-white/10 ring-1 ring-white/20">
                    <Clock className="h-3.5 w-3.5" /> Next spin in {fmtLeft(leftMs)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-bold bg-white/10 ring-1 ring-white/20">
                    <Lock className="h-3.5 w-3.5" /> Check in to unlock
                  </span>
                )}
              </div>
            </div>
          </div>
          <style>{`
            @keyframes wheelspin { to { transform: rotate(360deg); } }
            @keyframes pulsering { 0% { box-shadow: 0 0 0 0 rgba(250,204,21,0.7); } 100% { box-shadow: 0 0 0 14px rgba(250,204,21,0); } }
          `}</style>
        </button>
      </div>
      {open && (
        <DailyMysteryModal business={business} membershipId={membershipId} checkedInToday={checkedIn} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
