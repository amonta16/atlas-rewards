"use client";
/**
 * MedspaRewardsClient — CP-193. Redeeming, referring and reviews reuse the
 * shared flows (RedeemFlow, ReferFriendModal, ReviewSubmitModal,
 * RewardDetailModal); only the screen around them is med spa specific.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAppBase } from "@/lib/use-app-base";
import { cents } from "@/lib/medspa";
import type { Business, Membership } from "@/lib/types/database";
import type { MsReward } from "@/lib/medspa-app/data";
import { RedeemFlow } from "@/components/customer/redeem-flow";
import { ReferFriendModal } from "@/components/customer/refer-friend-modal";
import { ReviewSubmitModal } from "@/components/customer/review-submit-modal";
import { RewardDetailModal } from "@/components/customer/reward-detail-modal";
import { ActiveRedemptions, type ActiveRedemption } from "@/components/customer/active-redemptions";
import { MsTopBar } from "./chrome";
import { RewardTile } from "./reward-card";
import { IcChevronRight, IcQr, IcStar, IcUser, IcUsers } from "./icons";

export function MedspaRewardsClient({ business, membership, rewards, redemptions, fullName, profileIncomplete, memberLabel, creditCents, bagCount }: {
  business: Business; membership: Membership | null; rewards: MsReward[]; redemptions: ActiveRedemption[];
  fullName: string; profileIncomplete: boolean; memberLabel: string | null; creditCents: number | null; bagCount: number;
}) {
  const base = useAppBase(business.slug);
  const points = membership?.points_balance ?? 0;
  const rules = business.point_rules;
  const [all, setAll] = useState(false);
  const [redeem, setRedeem] = useState<MsReward | null>(null);
  const [detail, setDetail] = useState<MsReward | null>(null);
  const [refer, setRefer] = useState(false);
  const [review, setReview] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<"none" | "pending" | "verified" | "rejected">("none");
  const reviewsOn = !!business.widget_config.reviews && !!business.google_review_url && rules.review > 0;

  // ?redeem=<id> (from Home) opens the redeem flow straight away.
  useEffect(() => {
    const u = new URL(window.location.href);
    const want = u.searchParams.get("redeem");
    if (!want) return;
    const r = rewards.find((x) => x.id === want);
    if (r && r.point_cost <= points) setRedeem(r);
    u.searchParams.delete("redeem");
    window.history.replaceState({}, "", u.toString());
  }, [rewards, points]);

  useEffect(() => {
    if (!reviewsOn || !membership?.id) return;
    createClient().rpc("my_review_status", { p_business_id: business.id }).then(({ data }) => {
      const s = (Array.isArray(data) ? data[0]?.status : (data as { status?: string } | null)?.status) as typeof reviewStatus | undefined;
      if (s) setReviewStatus(s);
    });
  }, [reviewsOn, membership?.id, business.id]);

  const open = (r: MsReward) => (r.point_cost <= points ? setRedeem(r) : setDetail(r));
  const joined = membership?.joined_at ? new Date(membership.joined_at).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

  const earn: { key: string; icon: React.ReactNode; label: string; pts: number; onClick?: () => void; href?: string; note?: string }[] = [];
  if (business.widget_config.referrals && membership?.referral_code && rules.referral_referrer > 0) earn.push({ key: "refer", icon: <IcUsers className="h-[26px] w-[26px] shrink-0" />, label: "Refer a friend", pts: rules.referral_referrer, onClick: () => setRefer(true) });
  if (reviewsOn && reviewStatus !== "verified") earn.push({ key: "review", icon: <IcStar className="h-[26px] w-[26px] shrink-0" />, label: reviewStatus === "pending" ? "Review being checked" : "Review on Google", pts: rules.review, onClick: () => setReview(true) });
  if (rules.visit > 0) earn.push({ key: "visit", icon: <IcQr className="h-[26px] w-[26px] shrink-0" />, label: "Visit the clinic", pts: rules.visit, href: `${base}/scan` });
  if (profileIncomplete && rules.profile_complete > 0) earn.push({ key: "profile", icon: <IcUser className="h-[26px] w-[26px] shrink-0" />, label: "Finish your profile", pts: rules.profile_complete, href: `${base}/profile` });

  return (
    <div className="bg-[var(--ms-bg)] pb-4">
      <MsTopBar slug={business.slug} title="Rewards" bagCount={bagCount} />

      {/* Glass points card */}
      <div className="px-5 pt-7">
        <div className="relative overflow-hidden rounded-[22px] p-5 text-white"
          style={{
            background: "linear-gradient(125deg, color-mix(in srgb, var(--ms-p) 82%, #fff) 0%, var(--ms-p) 38%, color-mix(in srgb, var(--ms-p) 86%, #000) 62%, color-mix(in srgb, var(--ms-p) 70%, #fff) 100%)",
            boxShadow: "0 22px 44px -18px color-mix(in srgb, var(--ms-p) 70%, transparent), inset 0 0 0 1.5px rgba(255,255,255,.35)",
          }}>
          <span aria-hidden className="pointer-events-none absolute -inset-y-10 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" style={{ animation: "ms-sheen 5.5s ease-in-out 1s infinite" }} />
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[44px] font-medium leading-none tracking-[-0.02em] tabular-nums">{points.toLocaleString()}</div>
              <div className="mt-1.5 text-[14px] text-white/85">{business.name} points</div>
            </div>
            {memberLabel && <span className="mt-1 shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.06em] ring-1 ring-white/70">{memberLabel}</span>}
          </div>
          <div className="relative mt-12 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[19px] font-medium">{fullName}</div>
              {joined && <div className="text-[13px] text-white/70">Joined on {joined}</div>}
            </div>
            {creditCents != null && (
              <div className="shrink-0 text-right">
                <span className="inline-block rounded-full bg-white/90 px-3 py-1 text-[17px] font-semibold" style={{ color: "var(--ms-p)" }}>{cents(creditCents)}</span>
                <div className="mt-1 text-[15px] text-white/85">{business.name} credit</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rewards */}
      <section className="pt-9">
        <div className="flex items-baseline justify-between px-5">
          <h2 className="text-[28px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Rewards</h2>
          {rewards.length > 2 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="flex items-center gap-1 text-[18px]" style={{ color: "var(--ms-p)" }}>
              {all ? "Show less" : "See more"} <IcChevronRight className={`h-4 w-4 transition-transform ${all ? "rotate-90" : ""}`} strokeWidth={2.2} />
            </button>
          )}
        </div>
        {rewards.length === 0 ? (
          <p className="px-5 pt-3 text-[16px]" style={{ color: "var(--ms-sub)" }}>{business.name} is adding rewards. Keep collecting points.</p>
        ) : all ? (
          <div className="mt-4 grid grid-cols-2 gap-3 px-5">
            {rewards.map((r) => <button key={r.id} type="button" onClick={() => open(r)} className="text-left active:scale-[.98] transition"><RewardTile r={r} points={points} wide /></button>)}
          </div>
        ) : (
          <div className="ms-rail mt-4 flex gap-3 overflow-x-auto px-5 pb-1 scroll-px-5">
            {rewards.map((r) => <button key={r.id} type="button" onClick={() => open(r)} className="text-left active:scale-[.98] transition"><RewardTile r={r} points={points} /></button>)}
          </div>
        )}
      </section>

      {redemptions.length > 0 && (
        <section className="pt-8">
          <h2 className="px-5 text-[24px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ms-ink)" }}>Ready to use</h2>
          <ActiveRedemptions business={business} initialRedemptions={redemptions} membershipId={membership?.id ?? null} />
        </section>
      )}

      {/* Ways to earn */}
      {earn.length > 0 && (
        <section className="px-5 pt-10">
          <h2 className="text-[28px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Need more points?</h2>
          <div className="mt-4 space-y-3">
            {earn.map((e) => {
              const inner = (
                <>
                  <span style={{ color: "var(--ms-p)" }}>{e.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[17px]" style={{ color: "var(--ms-ink)" }}>{e.label}</span>
                  <span className="shrink-0 rounded-full px-3.5 py-[7px] text-[14px] font-bold text-white" style={{ background: "var(--ms-p)" }}>+{e.pts.toLocaleString()} points</span>
                </>
              );
              const cls = "flex w-full items-center gap-3.5 rounded-2xl bg-white px-4 py-[18px] text-left ring-1 ring-[var(--ms-line)] active:scale-[.99] transition";
              return e.href
                ? <Link key={e.key} href={e.href} className={cls}>{inner}</Link>
                : <button key={e.key} type="button" onClick={e.onClick} className={cls}>{inner}</button>;
            })}
          </div>
        </section>
      )}

      {detail && (
        <RewardDetailModal reward={detail} points={points} primary={business.brand_colors.primary} secondary={business.brand_colors.secondary}
          businessSlug={business.slug} businessFinePrint={business.reward_fine_print} onClose={() => setDetail(null)}
          onRedeem={detail.point_cost <= points ? () => { setRedeem(detail); setDetail(null); } : undefined} />
      )}
      {redeem && <RedeemFlow business={business} reward={redeem} currentPoints={points} onClose={() => setRedeem(null)} />}
      {refer && membership?.referral_code && <ReferFriendModal business={business} referralCode={membership.referral_code} onClose={() => setRefer(false)} />}
      {review && <ReviewSubmitModal business={business} points={rules.review} existingStatus={reviewStatus} onClose={() => setReview(false)} />}
    </div>
  );
}
