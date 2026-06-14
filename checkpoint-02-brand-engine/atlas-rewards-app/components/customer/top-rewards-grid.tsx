"use client";
/**
 * TopRewardsGrid — CP-53
 *
 * The 4 "Top rewards" cards on the customer Home. Unlocked rewards link
 * straight to the Rewards tab with ?redeem= (auto-opens the redeem flow).
 * LOCKED rewards now open a detail popup right here on Home (image, cost,
 * progress, how far to go) instead of silently bouncing to the Rewards tab.
 */
import { useState } from "react";
import { Gift, Lock, X } from "lucide-react";

export type TopReward = { id: string; name: string; point_cost: number; image_url: string | null };

export function TopRewardsGrid({
  businessSlug, rewards, points, primary, secondary,
}: {
  businessSlug: string;
  rewards: TopReward[];
  points: number;
  primary: string;
  secondary: string;
}) {
  const [detail, setDetail] = useState<TopReward | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {rewards.map(r => {
          const pct = r.point_cost > 0 ? Math.min(100, (points / r.point_cost) * 100) : 100;
          const unlocked = points >= r.point_cost;
          const remaining = Math.max(0, r.point_cost - points);

          const inner = (
            <>
              {r.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={r.image_url} alt={r.name} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="aspect-[4/3] flex items-center justify-center" style={{ background: `${primary}15` }}>
                  <Gift className="h-8 w-8" style={{ color: primary }} />
                </div>
              )}
              <div className="p-2.5">
                <div className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: primary }}>
                  <Lock className="h-2.5 w-2.5" /> {r.point_cost.toLocaleString()} POINTS
                </div>
                <div className="text-xs font-bold mt-0.5">{r.name}</div>
                <div className="mt-1.5">
                  <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: unlocked
                          ? "linear-gradient(90deg, #10b981, #059669)"
                          : `linear-gradient(90deg, ${primary}, ${secondary})`,
                      }}
                    />
                  </div>
                  <div className={`text-[9px] font-bold mt-0.5 tabular-nums ${unlocked ? "text-emerald-600" : "text-zinc-500"}`}>
                    {unlocked
                      ? "Tap to redeem ✨"
                      : `${points.toLocaleString()} / ${r.point_cost.toLocaleString()} · ${remaining.toLocaleString()} to go`}
                  </div>
                </div>
              </div>
            </>
          );

          const cls = "rounded-xl border bg-white overflow-hidden block text-left w-full shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow";

          return unlocked ? (
            <a key={r.id} href={`/${businessSlug}/app/rewards?redeem=${r.id}`} className={cls}
              style={{ borderColor: `${primary}55` }}>
              {inner}
            </a>
          ) : (
            <button key={r.id} onClick={() => setDetail(r)} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>

      {detail && (
        <LockedRewardModal
          reward={detail}
          points={points}
          primary={primary}
          secondary={secondary}
          businessSlug={businessSlug}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function LockedRewardModal({
  reward, points, primary, secondary, businessSlug, onClose,
}: {
  reward: TopReward;
  points: number;
  primary: string;
  secondary: string;
  businessSlug: string;
  onClose: () => void;
}) {
  const pct = reward.point_cost > 0 ? Math.min(100, (points / reward.point_cost) * 100) : 100;
  const remaining = Math.max(0, reward.point_cost - points);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="relative">
          {reward.image_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={reward.image_url} alt={reward.name} className="h-44 w-full object-cover" />
          ) : (
            <div className="h-44 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
              <Gift className="h-14 w-14 text-white/80" />
            </div>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          <div className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full" style={{ background: `${primary}15`, color: primary }}>
            <Lock className="h-3 w-3" /> {reward.point_cost.toLocaleString()} POINTS
          </div>
          <h3 className="text-xl font-black leading-tight mt-2 text-zinc-900">{reward.name}</h3>

          <div className="mt-4">
            <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
            </div>
            <div className="text-xs font-bold mt-1.5 tabular-nums text-zinc-600">
              {points.toLocaleString()} / {reward.point_cost.toLocaleString()} · <span className="text-zinc-900">{remaining.toLocaleString()} to go</span>
            </div>
          </div>

          <p className="text-sm text-zinc-500 mt-3 leading-snug">
            Keep earning points to unlock this reward — check in, refer friends, and leave a review to get there faster.
          </p>

          <a
            href={`/${businessSlug}/app/rewards`}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-md active:scale-[0.99] transition"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 10px 22px -8px ${primary}aa` }}
          >
            See ways to earn
          </a>
        </div>
      </div>
    </div>
  );
}
