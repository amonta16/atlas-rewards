"use client";
/**
 * DailySpinButton — CP-42, revised CP-37
 *
 * Reusable wrapper around the "Daily Spin" CTA on Home + Rewards.
 *
 * CP-37 fix: before this revision the button ONLY tracked "checked in
 * today" — so after the customer actually spun, the card kept saying
 * "You're ready to spin!" even though the spin had already happened.
 * Tapping it then surfaced the "already spun, come back tomorrow"
 * modal — confusing UX.
 *
 * The fix is to ALSO subscribe to mystery_reward_status, which already
 * tells us is_available + next_spin_at. We now have three states:
 *
 *   • locked     — haven't checked in yet today → "Check in to unlock"
 *   • ready      — checked in AND is_available=true → bright SPIN
 *   • cooldown   — already spun → countdown to next spin
 *
 * Realtime: subscribes to BOTH check_in_events (unlock) and
 * mystery_reward_spins (lock + show countdown) so the card flips
 * the instant either event lands on the customer's account.
 *
 * Robust to mystery_reward_status not being deployed yet — if the
 * RPC errors, we silently fall back to the original check-in-only
 * behavior (same UI as before this fix).
 */
import { useEffect, useState } from "react";
import { Zap, Clock, Dices, Coins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DailyMysteryModal } from "./daily-mystery-modal";
// CP-68: game-aware labels + demo mode.
import { rewardGameMeta } from "@/lib/reward-games";
import type { Business } from "@/lib/types/database";

type SpinStatus = { is_available: boolean; next_spin_at: string | null };
// CP-71: what's up for grabs — lets the card say "Win up to 300 pts"
// instead of an emoji. Comes from the mystery_prize_peek RPC (max active
// point prize; 300 = the built-in default pool when none is configured).
type PrizePeek = { max_points: number | null; has_special: boolean | null };

export function DailySpinButton({
  business,
  membershipId,
  compact = false,
}: {
  business: Business;
  membershipId: string;
  /** CP-52: half-width vertical card for the side-by-side Home row. */
  compact?: boolean;
}) {
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [spinStatus, setSpinStatus] = useState<SpinStatus | null>(null);
  // CP-71: prize teaser ("Win up to 300 pts"). Null until loaded; stays
  // null (generic copy) if the RPC isn't deployed yet.
  const [peek, setPeek] = useState<PrizePeek | null>(null);
  // Tick once a second so the countdown ticks visibly without remounting.
  const [, forceRerender] = useState(0);
  const [spinOpen, setSpinOpen] = useState(false);
  // CP-68: game meta (slot/wheel/boxes) + demo mode (always playable).
  const gameMeta = rewardGameMeta(business.reward_game);
  const isDemo = !!business.is_demo;
  // CP-65.1/68: red "!" — reward ready and not yet opened today. Shares the
  // header pill's localStorage key so both badges clear together.
  const [nudgeSeen, setNudgeSeen] = useState(true);
  const nudgeKey = `atlas-spin-nudge-${membershipId}-${new Date().toISOString().slice(0, 10)}`;
  useEffect(() => {
    if (typeof window === "undefined" || !membershipId) return;
    try { setNudgeSeen(window.localStorage.getItem(nudgeKey) === "1"); } catch { /* ignore */ }
  }, [membershipId, nudgeKey]);
  function openGame() {
    try { window.localStorage.setItem(nudgeKey, "1"); } catch { /* ignore */ }
    setNudgeSeen(true);
    setSpinOpen(true);
  }

  // CP-71: load the prize teaser once. Errors (RPC not deployed) are
  // silently ignored — the card falls back to "Win points & prizes".
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("mystery_prize_peek", { p_business_id: business.id })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const row = (Array.isArray(data) ? data[0] : data) as PrizePeek | null;
        setPeek(row ?? null);
      });
    return () => { cancelled = true; };
  }, [business.id]);

  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();

    const load = async () => {
      // Check-in today (existing behavior, still authoritative for the
      // "locked" state).
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const { data: ci } = await supabase
        .from("check_in_events")
        .select("id")
        .eq("membership_id", membershipId)
        .gte("created_at", dayStart.toISOString())
        .limit(1);
      setCheckedInToday((ci?.length ?? 0) > 0);

      // Spin availability (CP-37). RPC may not exist on older deploys.
      const { data: st, error: stErr } = await supabase.rpc("mystery_reward_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      if (!stErr) {
        const row = (Array.isArray(st) ? st[0] : st) as SpinStatus | null;
        setSpinStatus(row);
      }
    };
    load();

    // Realtime: flip locked → ready when they check in.
    const ch1 = supabase
      .channel(`spin-button-checkin-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();
    // Realtime: flip ready → cooldown the moment a spin lands.
    const ch2 = supabase
      .channel(`spin-button-spins-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mystery_reward_spins", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();

    // Countdown tick.
    const tick = setInterval(() => forceRerender(t => t + 1), 1000);
    // Safety re-poll every 60s in case realtime drops.
    const poll = setInterval(load, 60_000);

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [business.id, membershipId]);

  // Derive the three states.
  // CP-43 fix: check-in is now a HARD prerequisite for "ready", on every
  // business. The old logic used mystery_reward_status.is_available alone
  // whenever the RPC returned a row — so a business whose spin cooldown had
  // elapsed showed "You're ready to spin!" even though the customer hadn't
  // checked in yet (the yogurt-shop bug), while a business where the RPC
  // returned no row correctly showed "Check in to unlock". Requiring
  // checkedInToday makes the lock state identical across all sub-accounts.
  //   • not checked in        → locked   (regardless of is_available)
  //   • checked in + available → ready
  //   • checked in + !available → cooldown (already spun today)
  const knownNotAvailable =
    spinStatus !== null && spinStatus.is_available === false;
  const cooldown =
    knownNotAvailable && checkedInToday && spinStatus?.next_spin_at != null;
  const ready =
    checkedInToday &&
    (spinStatus !== null ? !!spinStatus.is_available : true);

  const nextAt = spinStatus?.next_spin_at ? new Date(spinStatus.next_spin_at) : null;
  const msLeft = nextAt ? Math.max(0, nextAt.getTime() - Date.now()) : 0;
  const hh = Math.floor(msLeft / 3_600_000);
  const mm = Math.floor((msLeft % 3_600_000) / 60_000);
  const ss = Math.floor((msLeft % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const countdown = hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;

  // Visual state buckets. CP-68: demo apps are ALWAYS ready — the server
  // skips the check-in + cooldown gates for is_demo businesses, so the
  // owner can replay the reward moment during a pitch.
  const variant: "ready" | "cooldown" | "locked" =
    isDemo ? "ready" : ready ? "ready" : cooldown ? "cooldown" : "locked";
  // Show the "!" whenever the game is playable and unseen today.
  const showNudge = variant === "ready" && !nudgeSeen;

  // CP-71: the prize teaser line — real numbers instead of an emoji.
  const winLine =
    peek?.max_points && peek.max_points > 0
      ? `Win up to ${peek.max_points} pts`
      : peek?.has_special
        ? "Prizes up for grabs"
        : "Win points & prizes";

  // CP-52: compact half-width card for the side-by-side Home row.
  // CP-71 revamp: taller, bolder — big watermark dice, headline-size copy,
  // and a "Win up to X pts" chip (from the prize pool) instead of an emoji.
  if (compact) {
    const ready = variant === "ready";
    return (
      <>
        <button
          onClick={() => { if (ready) openGame(); }}
          disabled={!ready}
          className="w-full h-full min-h-[172px] rounded-3xl overflow-hidden text-left relative active:scale-[0.98] transition-transform disabled:cursor-default p-4 flex flex-col shadow-lg ring-1 ring-black/[0.07]"
          style={{
            background: ready
              ? `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)`
              : "rgb(244 244 245)",
          }}
        >
          {/* watermark art */}
          <Dices
            className="absolute -right-4 -bottom-5 h-28 w-28 -rotate-12 pointer-events-none"
            style={{ color: ready ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.05)" }}
          />
          <div className="flex items-center justify-between">
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 backdrop-blur-sm"
              style={{ background: ready ? "rgba(255,255,255,0.22)" : "rgb(228 228 231)" }}
            >
              {variant === "cooldown"
                ? <Clock className="h-5 w-5 text-zinc-500" />
                : <Dices className="h-6 w-6 drop-shadow" style={{ color: ready ? "#fff" : business.brand_colors.primary }} />}
            </div>
            {/* prize teaser chip */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold ${
                ready ? "bg-white/20 text-white backdrop-blur-sm" : "bg-zinc-200 text-zinc-500"
              }`}
            >
              <Coins className="h-3 w-3" />
              {variant === "cooldown" ? countdown : winLine}
            </span>
          </div>
          <div className={`text-[10px] font-extrabold uppercase tracking-widest mt-3 ${ready ? "text-white/80" : "text-zinc-400"}`}>
            {gameMeta.title}
          </div>
          <div className={`font-black text-lg leading-tight tracking-tight ${ready ? "text-white" : "text-zinc-500"}`}>
            {ready ? "Play now!" : variant === "cooldown" ? "Played today" : "Check in to unlock"}
          </div>
          {ready ? (
            <span className="mt-auto pt-3 inline-flex items-center justify-center gap-1.5 self-stretch px-3 py-2 rounded-xl text-xs font-black bg-white text-zinc-900 shadow-md">
              <Zap className="h-3.5 w-3.5" /> {gameMeta.cta}
            </span>
          ) : (
            <div className={`mt-auto pt-3 text-[11px] font-semibold ${ready ? "text-white/75" : "text-zinc-400"}`}>
              {variant === "cooldown" ? `Next play in ${countdown}` : "Check in at the counter to unlock"}
            </div>
          )}
          {/* CP-68: red "!" — your check-in reward is ready (same language
              as the Google-review nudge; clears when the game is opened). */}
          {showNudge && (
            <span className="absolute top-1.5 right-1.5 h-[18px] w-[18px] rounded-full bg-red-500 ring-2 ring-white flex items-center justify-center animate-bounce pointer-events-none">
              <span className="text-[11px] font-black text-white leading-none">!</span>
            </span>
          )}
        </button>
        {spinOpen && (
          <DailyMysteryModal
            business={business}
            membershipId={membershipId}
            checkedInToday={checkedInToday}
            onClose={() => setSpinOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="px-4 mt-5">
        <button
          onClick={() => {
            // Only the "ready" state actually opens the game.
            // Cooldown + locked are informational — tapping does nothing
            // so the customer isn't dropped into a modal that just says
            // "no spin available".
            if (variant === "ready") openGame();
          }}
          disabled={variant !== "ready"}
          className="w-full rounded-2xl overflow-hidden text-left relative active:scale-[0.99] transition-transform disabled:cursor-default shadow-sm ring-1 ring-black/5"
          style={{
            background:
              variant === "ready"
                ? `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)`
                : "rgb(244 244 245)",
          }}
        >
          <div className="p-4 flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: variant === "ready" ? "rgba(255,255,255,0.2)" : "rgb(228 228 231)",
              }}
            >
              {variant === "cooldown"
                ? <Clock className="h-7 w-7 text-zinc-500" />
                : <Dices className="h-7 w-7" style={{ color: variant === "ready" ? "#fff" : business.brand_colors.primary }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[11px] font-extrabold uppercase tracking-widest ${variant === "ready" ? "text-white/80" : "text-zinc-400"}`}
              >
                {gameMeta.title}
              </div>
              <div
                className={`font-extrabold text-base leading-tight mt-0.5 ${variant === "ready" ? "text-white" : "text-zinc-500"}`}
              >
                {variant === "ready"
                  ? "You're ready to play!"
                  : variant === "cooldown"
                    ? "Already played today"
                    : "Check in to unlock"}
              </div>
              <div className={`text-xs mt-0.5 ${variant === "ready" ? "text-white/75" : "text-zinc-400"}`}>
                {/* CP-71: real stakes instead of an emoji. */}
                {variant === "ready"
                  ? winLine
                  : variant === "cooldown"
                    ? `Next play in ${countdown}`
                    : "Visit the shop to get your play"}
              </div>
            </div>
            <div className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${
              variant === "ready" ? "bg-white text-zinc-900" : "bg-zinc-200 text-zinc-500"
            }`}>
              {variant === "ready" ? (
                <>
                  <Zap className="h-3 w-3" />
                  PLAY!
                </>
              ) : variant === "cooldown" ? (
                <span className="tabular-nums">{countdown}</span>
              ) : (
                <>
                  <Zap className="h-3 w-3" />
                  Locked
                </>
              )}
            </div>
          </div>
          {/* CP-71: emoji sparkle strip replaced with a watermark die. */}
          {variant === "ready" && (
            <Dices className="absolute -right-3 -bottom-4 h-20 w-20 -rotate-12 text-white/10 pointer-events-none" />
          )}
          {/* CP-68: red "!" — your check-in reward is ready. (Positioned
              inside the card — the button clips overflow.) */}
          {showNudge && (
            <span className="absolute top-2 right-2 h-[18px] w-[18px] rounded-full bg-red-500 ring-2 ring-white flex items-center justify-center animate-bounce pointer-events-none">
              <span className="text-[11px] font-black text-white leading-none">!</span>
            </span>
          )}
        </button>
      </div>

      {spinOpen && (
        <DailyMysteryModal
          business={business}
          membershipId={membershipId}
          checkedInToday={checkedInToday}
          onClose={() => setSpinOpen(false)}
        />
      )}
    </>
  );
}
