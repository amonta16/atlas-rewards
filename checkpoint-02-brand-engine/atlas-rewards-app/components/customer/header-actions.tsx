"use client";
/**
 * HeaderActions — three smart icon buttons that live in the top-right of the
 * customer home page header.
 *
 *  [🎁 Mystery]  [👤/👑 Member]  [🔥 Streak]
 *
 * • Mystery gift: locked (with padlock badge) until checked in today.
 *   Once checked in, a red pulsing dot appears. Tap to open the daily spin.
 *
 * • Member crown/icon: golden crown if the customer is on a paid plan.
 *   Tapping scrolls to the membership section (free members) or does
 *   nothing visible (paid — icon is a status badge).
 *
 * • Streak flame: hidden when streaks are disabled.
 *   Red bubble shows streak count; orange urgency badge when streak > 0
 *   but not yet checked in today. Taps navigate to the Rewards tab.
 *
 * Data is fetched client-side so the server page stays fast.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Crown, Flame, Gift, Lock, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DailyMysteryModal } from "./daily-mystery-modal";
import { StreakWidget } from "./streak-widget";
import type { Business, Membership } from "@/lib/types/database";

type StreakSnap = {
  is_enabled: boolean;
  current_streak: number;
  checked_in_this_period: boolean;
};

// CP-36: matches member_checkin_status() RPC.
type CheckinStatus = {
  can_check_in_now: boolean;
  last_checkin_at: string | null;
  next_check_in_at: string | null;
  seconds_until_next: number;
  checked_in_today: boolean;
};

export function HeaderActions({
  business,
  membershipId,
  membership,
}: {
  business: Business;
  membershipId: string | null;
  membership: Membership | null;
}) {
  const router = useRouter();
  const [streak, setStreak] = useState<StreakSnap | null>(null);
  const [checkedInToday, setCheckedInToday] = useState(false);
  // CP-36: 12-hour cooldown countdown shown on the Check-in pill.
  // null means "no cooldown active" — pill renders the locked state.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [mysteryOpen, setMysteryOpen] = useState(false);
  // CP-24: open the streak widget MODAL directly when the flame icon is
  // tapped instead of navigating to /app/rewards (which Andrew reported as
  // "doesn't display the widget").
  const [streakOpen, setStreakOpen] = useState(false);
  // CP-25: a direct read of the business's streak_config row. This is the
  // single source of truth for "does the agency want streaks?". We use it
  // to render the flame icon even before the member has a member_streaks
  // row (which is what get_streak_status keys off — that RPC returns
  // is_enabled:false until the first check-in).
  const [streakConfigEnabled, setStreakConfigEnabled] = useState(false);

  const primary = business.brand_colors.primary;

  // ── CP-25: independent streak_config read — runs even without a membership
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const loadCfg = async () => {
      const { data } = await supabase
        .from("streak_config")
        .select("is_enabled")
        .eq("business_id", business.id)
        .maybeSingle();
      if (!cancelled) setStreakConfigEnabled(!!data?.is_enabled);
    };
    loadCfg();
    const ch = supabase
      .channel(`hdr-streak-cfg-${business.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "streak_config", filter: `business_id=eq.${business.id}` },
        loadCfg,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id]);

  // ── fetch streak + today's check-in on mount ──────────────────────────────
  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();

    const loadStreak = async () => {
      const { data: sd } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      const snap = (Array.isArray(sd) ? sd[0] : sd) as StreakSnap | null;
      setStreak(snap);

      // CP-36: prefer the server-computed cooldown so the "6 Hr" timer is
      // honest. Falls back to a simple "checked in today" calendar query
      // if the cp36 RPC isn't installed yet.
      const { data: cs, error: csErr } = await supabase.rpc("member_checkin_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      if (!csErr && cs) {
        const status = (Array.isArray(cs) ? cs[0] : cs) as CheckinStatus | null;
        if (status) {
          setCheckedInToday(!!status.checked_in_today);
          setSecondsLeft(status.can_check_in_now ? null : Math.max(0, Number(status.seconds_until_next || 0)));
          return;
        }
      }
      // Fallback path — legacy behavior.
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { data: checkins } = await supabase
        .from("check_in_events")
        .select("id")
        .eq("membership_id", membershipId)
        .gte("created_at", dayStart.toISOString())
        .limit(1);
      setCheckedInToday((checkins?.length ?? 0) > 0);
      setSecondsLeft(null);
    };
    loadStreak();

    // CP-36: tick the cooldown locally so the "6 Hr" label feels live
    // without hammering the RPC. We refetch on each check-in via realtime.
    const tick = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev == null) return prev;
        const next = prev - 30; // we tick every 30s
        return next <= 0 ? null : next;
      });
    }, 30_000);

    // CP-24-hotfix: realtime updates for streak_config + check_in_events
    // so the flame icon appears the moment the agency toggles streaks on,
    // and the counter ticks live as the member checks in.
    const ch = supabase
      .channel(`hdr-streak-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "streak_config", filter: `business_id=eq.${business.id}` },
        loadStreak,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        loadStreak,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_streaks", filter: `membership_id=eq.${membershipId}` },
        loadStreak,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); clearInterval(tick); };
  }, [business.id, membershipId]);

  // ── derived state ─────────────────────────────────────────────────────────
  // CP-25: show the icon when EITHER source says streaks are on. This unsticks
  // the case where streak_config exists but member_streaks doesn't yet (so
  // get_streak_status returns is_enabled:false even though the agency just
  // turned the feature on).
  const streakEnabled = (streak?.is_enabled ?? false) || streakConfigEnabled;
  const streakCount   = streak?.current_streak ?? 0;
  // Urgent = has a streak built up but hasn't checked in yet today
  const streakUrgent  = streakEnabled && streakCount > 0 && !(streak?.checked_in_this_period ?? false);

  // A member is "paid" if their tier carries a monthly price.
  const isPaid = !!(
    membership &&
    (business.tiers ?? []).find((t) => t.name === membership.tier)
      ?.monthly_price_cents
  );

  // ── handlers ──────────────────────────────────────────────────────────────
  function handleMemberClick() {
    if (!membership) {
      router.push(`/${business.slug}/signup`);
      return;
    }
    if (!isPaid) {
      document
        .getElementById("membership-benefits")
        ?.scrollIntoView({ behavior: "smooth" });
    }
    // Paid members → icon is a status badge; no action needed.
  }

  function handleStreakClick() {
    // CP-24: open the streak widget modal in place — no more navigating away.
    setStreakOpen(true);
  }

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* CP-28: further pill shrink — h-8→h-7, icon 15→13, text 11→10,
          gap 2→1.5. Matches the admin preview at phone width so the
          three pills always fit comfortably on a 320–360px header. */}
      <div className="flex items-center gap-1.5">

        {/* ── 🎁 Daily Check-in (CP-36: 12h cooldown w/ live timer) ────── */}
        {(() => {
          // Cooldown labels: "6 Hr" / "45 min" — matches Andrew's mock.
          // When the user is inside the 12-hour cooldown, we show the
          // remaining time on the pill instead of "Check in" so they
          // know exactly when they can next be scanned.
          const cooldown = secondsLeft != null && secondsLeft > 0;
          const cooldownLabel =
            cooldown
              ? (secondsLeft >= 3600
                  ? `${Math.ceil(secondsLeft / 3600)} Hr`
                  : `${Math.max(1, Math.ceil(secondsLeft / 60))} min`)
              : null;
          return (
            <button
              onClick={() => setMysteryOpen(true)}
              className="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full transition-all active:scale-95 shadow-md hover:shadow-lg ring-1 ring-black/5 select-none"
              style={{
                background: checkedInToday
                  ? `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`
                  : `linear-gradient(135deg, ${primary}33 0%, ${primary}1a 100%)`,
              }}
              aria-label={
                cooldown
                  ? `Next check-in in ${cooldownLabel}`
                  : checkedInToday
                    ? "Claim your daily spin!"
                    : "Check in to unlock daily spin"
              }
            >
              <Gift
                className="h-[13px] w-[13px] shrink-0"
                style={{ color: checkedInToday ? "#ffffff" : primary }}
              />
              <span
                className="text-[10px] font-extrabold leading-none whitespace-nowrap tabular-nums"
                style={{ color: checkedInToday ? "#ffffff" : primary }}
              >
                {cooldownLabel ?? "Check in"}
              </span>

              {/* Locked badge — only when they have NOT checked in today
                  AND there's no active cooldown countdown. */}
              {!checkedInToday && !cooldown && (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center pointer-events-none shadow">
                  <Lock className="h-1.5 w-1.5 text-zinc-500" />
                </span>
              )}
              {checkedInToday && !cooldown && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse pointer-events-none" />
              )}
            </button>
          );
        })()}

        {/* ── ⭐ Membership ────────────────────────────────────────────── */}
        {/* CP-26: replaces the old profile/user icon. The Profile tab lives
            in the bottom tab bar — this slot is dedicated to the membership
            CTA, so the icon is a Star and the label says "Member". */}
        <button
          onClick={handleMemberClick}
          className="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full transition-all active:scale-95 shadow-md hover:shadow-lg ring-1 ring-black/5 select-none"
          style={{
            background: isPaid
              ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
              : `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`,
          }}
          aria-label={isPaid ? "VIP member" : "Become a member"}
        >
          {isPaid ? (
            <Crown className="h-[13px] w-[13px] text-white fill-white shrink-0" />
          ) : (
            <Star className="h-[13px] w-[13px] text-white fill-white shrink-0" />
          )}
          <span className="text-[10px] font-extrabold leading-none whitespace-nowrap text-white">
            {isPaid ? "VIP" : "Member"}
          </span>
        </button>

        {/* ── 🔥 Streak ────────────────────────────────────────────────── */}
        {streakEnabled && (
          <button
            onClick={handleStreakClick}
            className="relative inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full transition-all active:scale-95 shadow-md hover:shadow-lg ring-1 ring-black/5 select-none"
            style={{
              background: "linear-gradient(135deg, #fb923c 0%, #ef4444 100%)",
            }}
            aria-label={
              streakUrgent ? "Streak expiring — come in today!" : `${streakCount} day streak`
            }
          >
            <Flame
              className={`h-[13px] w-[13px] text-white shrink-0 ${streakUrgent ? "animate-pulse" : ""}`}
            />
            <span className="text-[10px] font-extrabold leading-none whitespace-nowrap text-white">
              Streak
            </span>

            {/* Count bubble — matches Andrew's mock */}
            {streakCount > 0 && !streakUrgent && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] rounded-full bg-zinc-900 text-white text-[9px] font-extrabold flex items-center justify-center px-1 ring-2 ring-white leading-none"
                style={{ lineHeight: 1 }}
              >
                {streakCount > 99 ? "99+" : streakCount}
              </span>
            )}
            {streakUrgent && (
              <span className="absolute -top-1.5 -right-1.5 h-[16px] w-[16px] rounded-full bg-orange-500 ring-2 ring-white flex items-center justify-center animate-bounce pointer-events-none">
                <AlertTriangle className="h-2 w-2 text-white" />
              </span>
            )}
          </button>
        )}
      </div>

      {/* Mystery modal */}
      {mysteryOpen && (
        <DailyMysteryModal
          business={business}
          membershipId={membershipId}
          checkedInToday={checkedInToday}
          onClose={() => setMysteryOpen(false)}
        />
      )}

      {/* CP-24: Compact orange streak widget — opens from the flame icon. */}
      {streakOpen && membershipId && (
        <StreakWidget
          business={business}
          membershipId={membershipId}
          onClose={() => setStreakOpen(false)}
        />
      )}
    </>
  );
}
