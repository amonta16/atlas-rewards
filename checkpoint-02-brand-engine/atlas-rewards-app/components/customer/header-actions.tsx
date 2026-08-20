"use client";
/**
 * HeaderActions — CP-99: the quick-action pills are GONE. The header now
 * shows a single hamburger button (cleaner look, Andrew's call); the menu
 * inside carries everything the pills did, plus Profile (which left the
 * bottom nav to make room for Streaks):
 *
 *   ☰ →  Daily check-in (spin, cooldown label, red "!" nudge)
 *        My streak      (→ /app/streaks, count / urgent state)
 *        VIP membership (crown when paid)
 *        Profile        (→ /app/profile)
 *
 * All nudge/cooldown/eligibility logic is unchanged — the hamburger shows
 * a red dot whenever anything inside wants attention.
 * Data is fetched client-side so the server page stays fast.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Crown, Flame, Gift, Lock, Menu, Star, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { jitteredPollMs } from "@/lib/realtime-jitter";
import { readableTextColor } from "@/lib/patterns";
import { resolveStreakTheme, streakGradient } from "@/lib/streak-themes";
import { DailyMysteryModal } from "./daily-mystery-modal";
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
  vipEnabled = true,
  headerColor,
}: {
  business: Business;
  membershipId: string | null;
  membership: Membership | null;
  /** CP-52: when the business hasn't turned on a paid membership, hide the
   *  VIP quick-action entirely (no point teasing a product that isn't live). */
  vipEnabled?: boolean;
  /** CP-55: the header bar color, so the pills can adapt their ring + the
   *  translucent check-in pill stays visible on a dark/custom header. */
  headerColor?: string | null;
}) {
  const router = useRouter();
  const [streak, setStreak] = useState<StreakSnap | null>(null);
  const [checkedInToday, setCheckedInToday] = useState(false);
  // CP-36: 12-hour cooldown countdown shown on the Check-in pill.
  // null means "no cooldown active" — pill renders the locked state.
  // CP-42: track absolute expiration time and force re-renders, so the
  // countdown doesn't drift / get stuck when realtime events are missed.
  // `secondsLeft` is derived from (expiresAt - now) at render time.
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [, setRenderTick] = useState(0);
  const secondsLeft: number | null = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    : null;
  const [mysteryOpen, setMysteryOpen] = useState(false);
  // CP-99: single hamburger replaces the quick-action pills.
  const [menuOpen, setMenuOpen] = useState(false);
  // CP-24 opened a modal here; CP-99 Phase 4 (#9) navigates to the
  // /app/streaks roadmap page instead (see handleStreakClick).
  // CP-25: a direct read of the business's streak_config row. This is the
  // single source of truth for "does the agency want streaks?". We use it
  // to render the flame icon even before the member has a member_streaks
  // row (which is what get_streak_status keys off — that RPC returns
  // is_enabled:false until the first check-in).
  const [streakConfigEnabled, setStreakConfigEnabled] = useState(false);
  // CP-65.1: red "!" nudges (same language as the Google-review badge).
  // After a check-in: the spin pill gets a "!" until the spin is opened
  // today, and the streak pill gets a "!" until they view their new streak
  // progress. Seen-state lives in localStorage so it survives reloads.
  // Default true (no badge) until we've read storage — avoids a flash.
  const [spinNudgeSeen, setSpinNudgeSeen] = useState(true);
  const [streakNudgeSeen, setStreakNudgeSeen] = useState(true);
  const todayKey = new Date().toISOString().slice(0, 10);
  const spinSeenKey = `atlas-spin-nudge-${membershipId ?? "anon"}-${todayKey}`;

  const primary = business.brand_colors.primary;
  // CP-55: adapt the pills to the (possibly dark/custom) header color so they
  // don't bleed into it. onDark → light ring + the translucent check-in pill
  // flips to a white treatment instead of faint-brand-on-dark (invisible).
  const onDark = readableTextColor(headerColor ?? "#fcfcfd") === "#f4f4f5";
  const ringCls = onDark ? "ring-white/30" : "ring-black/5";

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
          // CP-42: use the absolute timestamp the server returns so the
          // chip is drift-proof. Render-time secondsLeft = expiresAt - now.
          if (!status.can_check_in_now && status.next_check_in_at) {
            setExpiresAt(new Date(status.next_check_in_at));
          } else {
            setExpiresAt(null);
          }
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
      setExpiresAt(null);
    };
    loadStreak();

    // CP-42: bump a render counter every 15s so the wall-clock derived
    // secondsLeft refreshes. Replaces the old setSecondsLeft(prev - 30)
    // pattern which drifted when realtime events were missed.
    const tick = setInterval(() => setRenderTick(t => t + 1), 15_000);
    // CP-89: safety-net poll raised from 60s to ~5min. The realtime
    // subscription below + the visibilitychange refresh are the real
    // update paths; this only catches silently-missed events.
    const poll = setInterval(loadStreak, jitteredPollMs());
    // And refresh when the tab regains focus.
    const onVis = () => { if (document.visibilityState === "visible") loadStreak(); };
    document.addEventListener("visibilitychange", onVis);

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
    return () => {
      supabase.removeChannel(ch);
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
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
  // CP-65.1: streak "!" seen-state is keyed by the streak COUNT, so every new
  // check-in re-arms the badge until they open the panel and see it add up.
  const streakSeenKey = `atlas-streak-nudge-${membershipId ?? "anon"}-${streakCount}`;
  useEffect(() => {
    if (typeof window === "undefined" || !membershipId) return;
    try {
      setSpinNudgeSeen(window.localStorage.getItem(spinSeenKey) === "1");
      setStreakNudgeSeen(window.localStorage.getItem(streakSeenKey) === "1");
    } catch { /* private mode etc. — just skip the nudges */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipId, spinSeenKey, streakSeenKey]);
  // Spin reward ready = checked in today and hasn't opened the spin yet.
  const spinNudge = checkedInToday && !spinNudgeSeen;
  // Streak progress unseen = checked in this period, streak alive, panel not opened since.
  const streakNudge =
    streakEnabled && streakCount > 0 && (streak?.checked_in_this_period ?? false) && !streakNudgeSeen;

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
    // CP-65.1: opening the panel counts as "seen" — the red "!" clears.
    try { window.localStorage.setItem(streakSeenKey, "1"); } catch { /* ignore */ }
    setStreakNudgeSeen(true);
    // CP-99 Phase 4 (#9): the flame chip now opens the full-page streak
    // ROADMAP (/app/streaks) instead of the old modal — the page shows
    // everything the modal did, plus the battle-pass path.
    router.push(`/${business.slug}/app/streaks`);
  }

  function handleSpinClick() {
    // CP-65.1: opening the daily spin counts as "seen" — the red "!" clears.
    try { window.localStorage.setItem(spinSeenKey, "1"); } catch { /* ignore */ }
    setSpinNudgeSeen(true);
    setMysteryOpen(true);
  }

  // ─── render ──────────────────────────────────────────────────────────────

  const cooldown = secondsLeft != null && secondsLeft > 0;
  const cooldownLabel = cooldown
    ? (secondsLeft! >= 3600
        ? `${Math.ceil(secondsLeft! / 3600)} Hr`
        : `${Math.max(1, Math.ceil(secondsLeft! / 60))} min`)
    : null;
  // Anything in the menu wanting attention → red dot on the hamburger.
  const anyNudge = spinNudge || streakNudge || streakUrgent;

  const closeThen = (fn: () => void) => () => { setMenuOpen(false); fn(); };

  return (
    <>
      <div className="relative">
        {/* ── ☰ the one header control ── */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className={`relative h-9 w-9 rounded-full flex items-center justify-center transition active:scale-95 shadow-md ring-1 ${ringCls} select-none`}
          style={{ background: onDark ? "rgba(255,255,255,0.18)" : "#ffffff" }}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <Menu className="h-5 w-5" style={{ color: onDark ? "#ffffff" : "#334155" }} />
          {anyNudge && !menuOpen && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse pointer-events-none" />
          )}
        </button>

        {menuOpen && (
          <>
            {/* click-away layer */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 overflow-hidden">
              {/* Daily check-in / spin */}
              <button
                onClick={closeThen(handleSpinClick)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition"
              >
                <span className="relative h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: checkedInToday ? `linear-gradient(135deg, ${primary}, ${primary}cc)` : `${primary}15` }}>
                  <Gift className="h-[18px] w-[18px]" style={{ color: checkedInToday ? "#ffffff" : primary }} />
                  {!checkedInToday && !cooldown && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center shadow">
                      <Lock className="h-2 w-2 text-zinc-500" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-zinc-900">Daily check-in</span>
                  <span className="block text-[11px] font-semibold text-zinc-500 tabular-nums">
                    {cooldown ? `Next check-in in ${cooldownLabel}` : checkedInToday ? "Spin your reward!" : "Check in to unlock your spin"}
                  </span>
                </span>
                {spinNudge ? (
                  <span className="h-[18px] w-[18px] rounded-full bg-red-500 ring-2 ring-white flex items-center justify-center animate-bounce shrink-0">
                    <span className="text-[10px] font-black text-white leading-none">!</span>
                  </span>
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                )}
              </button>

              {/* My streak */}
              {streakEnabled && (
                <button
                  onClick={closeThen(handleStreakClick)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition"
                >
                  <span className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: streakGradient(resolveStreakTheme(business.streak_theme, primary)) }}>
                    <Flame className={`h-[18px] w-[18px] text-white ${streakUrgent ? "animate-pulse" : ""}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-zinc-900">My streak</span>
                    <span className={`block text-[11px] font-semibold tabular-nums ${streakUrgent ? "text-orange-600" : "text-zinc-500"}`}>
                      {streakUrgent
                        ? "Don't lose it — check in today!"
                        : streakCount > 0
                          ? `${streakCount} in a row`
                          : "Start your streak"}
                    </span>
                  </span>
                  {streakNudge && !streakUrgent ? (
                    <span className="h-[18px] w-[18px] rounded-full bg-red-500 ring-2 ring-white flex items-center justify-center animate-bounce shrink-0">
                      <span className="text-[10px] font-black text-white leading-none">!</span>
                    </span>
                  ) : streakUrgent ? (
                    <span className="h-[18px] w-[18px] rounded-full bg-orange-500 ring-2 ring-white flex items-center justify-center animate-bounce shrink-0">
                      <AlertTriangle className="h-2.5 w-2.5 text-white" />
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                  )}
                </button>
              )}

              {/* VIP membership */}
              {vipEnabled && (
                <button
                  onClick={closeThen(handleMemberClick)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition"
                >
                  <span className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: isPaid ? "linear-gradient(135deg, #f59e0b, #d97706)" : `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
                    {isPaid
                      ? <Crown className="h-[18px] w-[18px] text-white fill-white" />
                      : <Star className="h-[18px] w-[18px] text-white fill-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-zinc-900">VIP membership</span>
                    <span className="block text-[11px] font-semibold text-zinc-500">
                      {isPaid ? "Active VIP member" : "See VIP benefits"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                </button>
              )}

              <div className="h-px bg-zinc-100 mx-3.5" />

              {/* Profile — moved here from the bottom nav (CP-99). */}
              <button
                onClick={closeThen(() => router.push(`/${business.slug}/app/profile`))}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition"
              >
                <span className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                  <User className="h-[18px] w-[18px] text-zinc-600" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-zinc-900">Profile</span>
                  <span className="block text-[11px] font-semibold text-zinc-500">Account & settings</span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
              </button>
            </div>
          </>
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
    </>
  );
}
