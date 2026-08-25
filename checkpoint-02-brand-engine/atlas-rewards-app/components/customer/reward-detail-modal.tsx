"use client";
import { Gift, Lock, X } from "lucide-react";
import { ImageCarousel, rewardGallery } from "@/components/customer/image-carousel";

/**
 * RewardDetailModal — CP-105
 *
 * Andrew: "you can't click on locked rewards, it doesn't allow to be clicked
 * thus not displaying the great description… It should still display lock but
 * that doesn't mean non clickable."
 *
 * On the Rewards tab every locked card was rendered as `disabled` — so the
 * photo, the description the business wrote, and the exact gap to unlocking
 * were all unreachable. A locked reward is the one you most want to read
 * about; that is the whole motivation loop.
 *
 * This is the single detail sheet for BOTH surfaces (Home's Top rewards and
 * the Rewards store), so the two can't drift:
 *   • the WHOLE photo, never cropped (object-contain on a tinted backdrop),
 *     swipeable when the reward has extra images
 *   • the lock stays visible — locked is a state, not a dead end
 *   • point cost, live progress, and "N to go"
 *   • the business's own description when it exists
 *
 * `description` is optional on purpose: the Rewards tab selects * and has it,
 * while Home comes from the `top_rewards_public` RPC which doesn't return it
 * yet. The block simply doesn't render there — no SQL needed to ship this.
 */

export type DetailReward = {
  id: string;
  name: string;
  point_cost: number;
  image_url: string | null;
  /** CP-99 gallery photos (cover = image_url). */
  images?: string[] | null;
  /** Present on the Rewards tab; absent from the Home RPC. */
  description?: string | null;
};

export function RewardDetailModal({
  reward, points, primary, secondary, businessSlug, onClose, onRedeem,
}: {
  reward: DetailReward;
  points: number;
  primary: string;
  secondary: string;
  businessSlug: string;
  onClose: () => void;
  /** Supplied when the viewer can already afford it. */
  onRedeem?: () => void;
}) {
  const locked = points < reward.point_cost;
  const pct = reward.point_cost > 0 ? Math.min(100, (points / reward.point_cost) * 100) : 100;
  const remaining = Math.max(0, reward.point_cost - points);
  const gallery = rewardGallery(reward.image_url, reward.images);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={reward.name}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl max-h-[86vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {gallery.length > 0 ? (
            // CP-105: object-CONTAIN on a tinted bed — Andrew asked to "see the
            // whole image", and a 4:3 crop was hiding half of some rewards.
            <div style={{ background: `linear-gradient(135deg, ${primary}12, ${secondary}22)` }}>
              <ImageCarousel
                images={gallery}
                alt={reward.name}
                imgClassName="h-56 w-full object-contain"
                /* CP-105: the close button owns the top-right corner here, so
                   the "2/5" counter moves left or the two collide. */
                counterAlign="left"
              />
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
              <Gift className="h-14 w-14 text-white/80" />
            </div>
          )}

          {/* The lock stays on the sheet — you can look, you just can't take it
              yet. Bottom-left keeps all four corners clear of each other:
              counter top-left, close top-right, dots bottom-center. */}
          {locked && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-sm px-2.5 py-1 text-[10px] font-black tracking-wide text-zinc-600 shadow-sm ring-1 ring-black/10">
              <Lock className="h-3 w-3" /> LOCKED
            </span>
          )}

          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm text-white flex items-center justify-center"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full"
            style={{ background: `${primary}15`, color: primary }}>
            {locked ? <Lock className="h-3 w-3" /> : <Gift className="h-3 w-3" />}
            {" "}{reward.point_cost.toLocaleString()} POINTS
          </div>
          <h3 className="text-xl font-black leading-tight mt-2 text-zinc-900">{reward.name}</h3>

          {/* The business's own copy — the thing that was unreachable before. */}
          {reward.description && (
            <p className="text-sm text-zinc-600 mt-2 leading-relaxed whitespace-pre-line">
              {reward.description}
            </p>
          )}

          <div className="mt-4">
            <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
            </div>
            <div className="text-xs font-bold mt-1.5 tabular-nums text-zinc-600">
              {points.toLocaleString()} / {reward.point_cost.toLocaleString()}
              {locked
                ? <> · <span className="text-zinc-900">{remaining.toLocaleString()} to go</span></>
                : <> · <span className="text-emerald-600">Ready to redeem</span></>}
            </div>
          </div>

          {locked ? (
            <>
              <p className="text-sm text-zinc-500 mt-3 leading-snug">
                Keep earning points to unlock this reward — check in, refer friends, and leave a review to get there faster.
              </p>
              {/* CP-80: land on the "Need more points?" earn section with the
                  same scroll+flash the review "!" uses — not just page top. */}
              <a
                href={`/${businessSlug}/app/rewards?focus=earn`}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-md active:scale-[0.99] transition"
                style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 10px 22px -8px ${primary}aa` }}
              >
                See ways to earn
              </a>
            </>
          ) : onRedeem ? (
            <button
              onClick={onRedeem}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-md active:scale-[0.99] transition"
              style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 10px 22px -8px ${primary}aa` }}
            >
              <Gift className="h-4 w-4" /> Redeem now
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
