"use client";
/**
 * TopRewardsGrid — CP-53
 *
 * The 4 "Top rewards" cards on the customer Home. Unlocked rewards link
 * straight to the Rewards tab with ?redeem= (auto-opens the redeem flow).
 * LOCKED rewards now open a detail popup right here on Home (image, cost,
 * progress, how far to go) instead of silently bouncing to the Rewards tab.
 *
 * CP-94: claimable treatment. When the customer can afford a reward, the
 * card stops whispering ("Tap to redeem ✨" in 9px text) and pops:
 *   • a breathing brand-colored glow around the whole card
 *   • a "READY" ribbon on the photo
 *   • a full-width gradient "Redeem now" button where the progress
 *     numbers used to be
 * No emoji anywhere — brand colors + lucide icons only.
 */
import { useState } from "react";
import { Gift, Lock, Zap } from "lucide-react";
import Link from "next/link";
import { useAppBase } from "@/lib/use-app-base";
import { RewardDetailModal } from "@/components/customer/reward-detail-modal";
import { rewardCardChrome, rewardCardMeta } from "@/lib/reward-card-styles";
import { rewardsLayout } from "@/lib/section-layouts";
import { ChevronRight } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";

export type TopReward = {
  id: string; name: string; point_cost: number; image_url: string | null;
  /** CP-99: additional gallery photos (cover = image_url). */
  images?: string[] | null;
  /** CP-105: shown in the detail sheet. The `top_rewards_public` RPC does not
   *  return it today, so it is optional and the block just doesn't render;
   *  add it to the RPC and descriptions appear on Home for free. */
  description?: string | null;
};

export function TopRewardsGrid({
  businessSlug, rewards, points, primary, secondary, cardStyle, layout,
}: {
  businessSlug: string;
  rewards: TopReward[];
  points: number;
  primary: string;
  secondary: string;
  /** CP-99 3b.1: the business's reward-panel preset (businesses.reward_card_style)
   *  so Home's "Top rewards" cards match the Rewards tab. NULL = classic = unchanged. */
  cardStyle?: string | null;
  /** CP-99: Home top-rewards layout (businesses.home_rewards_layout) —
   *  same shapes as the store: grid (default) / list / carousel / spotlight. */
  layout?: string | null;
}) {
  // CP-106: base-aware in-app hrefs + <Link> — these tiles were plain
  // anchors, so every "tap a reward" on Home was a full page reload.
  const appBase = useAppBase(businessSlug);
  const [detail, setDetail] = useState<TopReward | null>(null);
  const rcMeta = rewardCardMeta(cardStyle);
  const rcDark = rcMeta.dark;
  const rcClassic = rcMeta.id === "classic";
  const lay = rewardsLayout(layout);

  // One card, reused by every layout. `big` = spotlight hero treatment.
  const renderCard = (r: TopReward, big = false) => {
          const pct = r.point_cost > 0 ? Math.min(100, (points / r.point_cost) * 100) : 100;
          const unlocked = points >= r.point_cost;
          const remaining = Math.max(0, r.point_cost - points);

          const inner = (
            <>
              <div className="relative">
                {r.image_url ? (
                  <SmartImage src={r.image_url} alt={r.name} tint={primary} eager className={`${big ? "aspect-video" : "aspect-[4/3]"} w-full object-cover`} />
                ) : (
                  <div className={`${big ? "aspect-video" : "aspect-[4/3]"} flex items-center justify-center`} style={{ background: `${primary}15` }}>
                    <Gift className="h-8 w-8" style={{ color: primary }} />
                  </div>
                )}
                {/* CP-94: claimable ribbon on the photo. */}
                {unlocked && (
                  <span
                    className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider text-white shadow-md"
                    style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}
                  >
                    <Zap className="h-2.5 w-2.5" /> READY
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <div className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color: rcDark ? "#ffffff" : primary }}>
                  {unlocked
                    ? <Zap className="h-2.5 w-2.5" />
                    : <Lock className="h-2.5 w-2.5" />} {r.point_cost.toLocaleString()} POINTS
                </div>
                <div className={`text-xs font-bold mt-0.5 ${rcDark ? "text-white" : ""}`}>{r.name}</div>
                <div className="mt-1.5">
                  {unlocked ? (
                    // CP-94: a real call-to-action instead of 9px whisper text.
                    <span
                      className="flex items-center justify-center gap-1 w-full rounded-lg py-1.5 text-[10px] font-black tracking-wide text-white"
                      style={{
                        background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                        boxShadow: `0 4px 12px -4px ${primary}`,
                      }}
                    >
                      <Gift className="h-3 w-3" /> REDEEM NOW
                    </span>
                  ) : (
                    <>
                      <div className={`h-1.5 rounded-full overflow-hidden ${rcDark ? "bg-white/15" : "bg-zinc-100"}`}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                          }}
                        />
                      </div>
                      <div className={`text-[9px] font-bold mt-0.5 tabular-nums ${rcDark ? "text-white/60" : "text-zinc-500"}`}>
                        {`${points.toLocaleString()} / ${r.point_cost.toLocaleString()} · ${remaining.toLocaleString()} to go`}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          );

          const cls = "rounded-xl border bg-white overflow-hidden block text-left w-full shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow";

          /* CP-99 3b.1: shell chrome from the business preset. Classic keeps
             the exact CP-94 look (borderColor + breathing claim pulse); the
             other presets use their own ready treatment — the pulse keyframes
             would clobber a preset's box-shadow ring (e.g. luxe's gold rim). */
          const readyStyle: React.CSSProperties = rcClassic
            ? { borderColor: `${primary}55`, animation: "atlasClaimPulse 2.2s ease-in-out infinite" }
            : rewardCardChrome(cardStyle, primary, secondary, false);

          return unlocked ? (
            <Link key={r.id} href={`${appBase}/rewards?redeem=${r.id}`} className={`${cls} ${big ? "col-span-2" : ""}`}
              style={readyStyle}>
              {inner}
            </Link>
          ) : (
            <button key={r.id} onClick={() => setDetail(r)} className={`${cls} ${big ? "col-span-2" : ""}`}
              style={rewardCardChrome(cardStyle, primary, secondary, true)}>
              {inner}
            </button>
          );
  };

  // Compact row for the "list" layout — image left, progress right.
  const renderRow = (r: TopReward) => {
    const unlocked = points >= r.point_cost;
    const pct = r.point_cost > 0 ? Math.min(100, (points / r.point_cost) * 100) : 100;
    const rowInner = (
      <>
        <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-zinc-100 flex items-center justify-center">
          {r.image_url ? (
            <SmartImage src={r.image_url} alt={r.name} tint={primary} eager className="h-full w-full object-cover" />
          ) : (
            <Gift className="h-6 w-6" style={{ color: primary }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-bold leading-tight truncate ${rcDark ? "text-white" : "text-zinc-900"}`}>{r.name}</div>
          <div className="text-[10px] font-bold mt-0.5" style={{ color: rcDark ? "#ffffff" : primary }}>
            {r.point_cost.toLocaleString()} POINTS
          </div>
          {!unlocked && (
            <div className={`mt-1 h-1 rounded-full overflow-hidden ${rcDark ? "bg-white/15" : "bg-zinc-100"}`}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
            </div>
          )}
        </div>
        {unlocked ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black text-white rounded-full px-2.5 py-1"
            style={{ background: `linear-gradient(90deg, ${primary}, ${secondary})` }}>
            <Gift className="h-3 w-3" /> REDEEM
          </span>
        ) : (
          <ChevronRight className={`h-4 w-4 shrink-0 ${rcDark ? "text-white/40" : "text-zinc-300"}`} />
        )}
      </>
    );
    const rowCls = "w-full flex items-center gap-2.5 rounded-xl border bg-white p-2 text-left shadow-sm ring-1 ring-black/5";
    return unlocked ? (
      <Link key={r.id} href={`${appBase}/rewards?redeem=${r.id}`} className={rowCls}
        style={rcClassic ? { borderColor: `${primary}55` } : rewardCardChrome(cardStyle, primary, secondary, false)}>
        {rowInner}
      </Link>
    ) : (
      <button key={r.id} onClick={() => setDetail(r)} className={rowCls}
        style={rewardCardChrome(cardStyle, primary, secondary, true)}>
        {rowInner}
      </button>
    );
  };

  return (
    <>
      {lay === "list" ? (
        <div className="space-y-2">{rewards.map(r => renderRow(r))}</div>
      ) : lay === "carousel" ? (
        <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory -mx-4 px-4">
          {rewards.map(r => (
            <div key={r.id} className="w-36 shrink-0 snap-start">{renderCard(r)}</div>
          ))}
        </div>
      ) : lay === "spotlight" ? (
        <div className="grid grid-cols-2 gap-2">
          {rewards.map((r, i) => renderCard(r, i === 0))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">{rewards.map(r => renderCard(r))}</div>
      )}

      {/* CP-94: breathing glow for claimable cards — brand-tinted, subtle,
          and CSS-only (no re-renders). */}
      <style>{`
        @keyframes atlasClaimPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${primary}00, 0 1px 3px rgba(0,0,0,0.06); }
          50%      { box-shadow: 0 0 0 4px ${primary}26, 0 8px 20px -6px ${primary}66; }
        }
      `}</style>

      {detail && (
        <RewardDetailModal
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
