"use client";
/**
 * DailyMysteryModal — the check-in PRIZE WHEEL.
 *
 * CP-72: wheel-only. The slot machine + mystery boxes games were removed —
 * every business plays the wheel (Andrew: "spin is suitable for every
 * business"). The emoji segments are gone too: the wheel now shows the
 * business's REAL prizes — point amounts, free rewards, coupons — loaded
 * from mystery_wheel_segments (labels only; weights/odds stay server-side).
 * Odds are configured per-prize on the builder's Rewards tab.
 *
 * Unlocked when the member has a check-in today (checked_in_today = true).
 * Claim state is persisted in localStorage (key: mystery_{businessId}_{date})
 * so it survives page refreshes but resets daily. The prize itself is picked
 * and awarded SERVER-side (spin_daily_reward) — the wheel is pure theater,
 * and it lands on the segment matching whatever the server awarded.
 */

import { useEffect, useRef, useState } from "react";
import { X, Lock, Zap, RotateCcw, Coins, Gift, PartyPopper } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { rewardGameMeta } from "@/lib/reward-games";
import type { Business } from "@/lib/types/database";

// ─── prizes ──────────────────────────────────────────────────────────────────

type Prize = {
  label: string;
  points: number;
  tier: "jackpot" | "lucky" | "nice";
  // CP-44: server-decided prize details (the client no longer chooses these).
  // CP-73: coupons removed — kinds are points | reward only.
  kind?: string;
  image?: string | null;
};

// CP-72: a wheel segment — mirrors one prize from the pool. `big` is the
// headline text on the wedge ("50", "Free Latte"), `small` the qualifier
// ("PTS" / "REWARD"). CP-73: `image` shows the prize's photo on the wedge.
type WheelSeg = {
  prizeId: string | null;
  kind: string;
  points: number | null;
  big: string;
  small: string;
  image: string | null;
};

// Built-in fallback — matches spin_daily_reward's default pool when the
// business hasn't configured prizes (or the RPC isn't deployed yet).
const DEFAULT_SEGS: WheelSeg[] = [
  { prizeId: null, kind: "points", points: 50,  big: "50",  small: "PTS", image: null },
  { prizeId: null, kind: "points", points: 100, big: "100", small: "PTS", image: null },
  { prizeId: null, kind: "points", points: 300, big: "300", small: "PTS", image: null },
];

// CP-133: the wheel used to be a fixed 8 wedges, so a pool with 10 prizes
// silently dropped two of them. Now: up to 8 prizes → 8 wedges (short pools
// repeat to fill); 9–16 prizes → one wedge per prize; beyond 16 the wheel
// stays at 16 (wedges below ~22° are unreadable on a phone). Text scales
// down as wedges get thinner.
const MIN_SEGMENTS = 8;
const MAX_SEGMENTS = 16;
function segmentCountFor(poolLen: number): number {
  return Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, poolLen));
}

function shortLabel(name: string): string {
  const clean = (name ?? "").trim();
  return clean.length > 12 ? `${clean.slice(0, 11)}…` : clean || "Prize";
}

function toSeg(row: { id: string | null; kind: string; label: string | null; points_amount: number | null; image_url?: string | null }): WheelSeg {
  if (row.kind === "points") {
    return {
      prizeId: row.id, kind: "points", points: row.points_amount ?? 0,
      big: String(row.points_amount ?? 0), small: "PTS",
      image: row.image_url ?? null,
    };
  }
  // CP-73: coupons are gone — anything non-points renders as a reward wedge.
  return {
    prizeId: row.id, kind: "reward", points: null,
    big: shortLabel(row.label ?? "Reward"), small: "REWARD",
    image: row.image_url ?? null,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

type Phase = "locked" | "ready" | "spinning" | "revealed" | "claimed";

export function DailyMysteryModal({
  business,
  membershipId,
  checkedInToday,
  onClose,
}: {
  business: Business;
  membershipId: string | null;
  checkedInToday: boolean;
  onClose: () => void;
}) {
  const todayKey   = `mystery_${business.id}_${new Date().toDateString()}`;
  const prizeKey   = `mystery_prize_${business.id}_${new Date().toDateString()}`;

  const storedPrize: Prize | null =
    typeof window !== "undefined"
      ? (() => { try { return JSON.parse(localStorage.getItem(prizeKey) ?? "null"); } catch { return null; } })()
      : null;

  const alreadyClaimed = typeof window !== "undefined" && !!localStorage.getItem(todayKey);

  const gameMeta = rewardGameMeta(business.reward_game);
  const isDemo = !!business.is_demo;

  const [phase, setPhase] = useState<Phase>(() => {
    // Demo apps are always playable — the server skips the check-in +
    // cooldown gates for is_demo businesses (cp68 SQL), so the owner can
    // watch the reward moment as many times as the pitch needs.
    if (isDemo) return "ready";
    if (!checkedInToday) return "locked";
    if (alreadyClaimed) return "claimed";
    return "ready";
  });

  const [prize, setPrize] = useState<Prize | null>(storedPrize);
  // White-flash overlay
  const [flash, setFlash] = useState(false);
  // CP-44: spin error (cooldown / not checked in / disabled).
  const [err, setErr] = useState<string | null>(null);
  // Wheel state — accumulated rotation + transition duration.
  const [wheelRot, setWheelRot] = useState(0);
  const [wheelMs, setWheelMs] = useState(0);
  // CP-72: the real prize pool, mirrored onto the wheel. Starts with the
  // built-in defaults; replaced once mystery_wheel_segments answers.
  const [pool, setPool] = useState<WheelSeg[]>(DEFAULT_SEGS);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const primary = business.brand_colors.primary;

  // CP-72: load the segment labels (no weights/odds — those stay server-side).
  useEffect(() => {
    let cancelled = false;
    createClient()
      .rpc("mystery_wheel_segments", { p_business_id: business.id })
      .then(({ data, error }) => {
        if (cancelled || error) return; // RPC missing → keep defaults
        const rows = (data ?? []) as { id: string | null; kind: string; label: string | null; points_amount: number | null; image_url?: string | null }[];
        if (rows.length > 0) setPool(rows.map(toSeg));
      });
    return () => { cancelled = true; };
  }, [business.id]);

  // The pool repeats around the wheel so short pools still fill 8 wedges;
  // bigger pools get a wedge each (CP-133), up to 16.
  const SEGMENT_COUNT = segmentCountFor(pool.length);
  const segments: WheelSeg[] = Array.from(
    { length: SEGMENT_COUNT },
    (_, i) => pool[i % pool.length],
  );
  const segAngle = 360 / SEGMENT_COUNT;
  // Density tier drives label sizing on the wedges.
  const dense = SEGMENT_COUNT > 12 ? 2 : SEGMENT_COUNT > 8 ? 1 : 0;

  // Which wedge should the pointer land on for the awarded prize?
  function segmentForPrize(p: Prize, awardedId: string | null): number {
    // Prefer exact prize-id matches; else match point amounts; else any.
    const byId = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => awardedId !== null && s.prizeId === awardedId);
    if (byId.length > 0) return byId[Math.floor(Math.random() * byId.length)].i;
    const byPoints = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.kind === "points" && p.points > 0 && s.points === p.points);
    if (byPoints.length > 0) return byPoints[Math.floor(Math.random() * byPoints.length)].i;
    return Math.floor(Math.random() * SEGMENT_COUNT);
  }

  // CP-68: demo replay — wipe local claim state and re-arm the game.
  function demoReplay() {
    try {
      localStorage.removeItem(todayKey);
      localStorage.removeItem(prizeKey);
    } catch { /* ignore */ }
    timeouts.current.forEach(clearTimeout);
    setPrize(null); setFlash(false); setErr(null);
    setWheelMs(0);
    setPhase("ready");
  }

  // ── cleanup on unmount
  useEffect(() => () => timeouts.current.forEach(clearTimeout), []);

  // ── spin (CP-44: server-authoritative)
  async function handleSpin() {
    if (phase !== "ready" || !membershipId) return;
    setErr(null);
    setPhase("spinning");

    // Long lazy spin while we wait; overridden with the precise landing
    // rotation once the server answers.
    setWheelMs(9000);
    setWheelRot((r) => r + 1440);

    // Ask the server to pick + award the prize. The client cannot influence
    // the amount, can only spin for itself, and the cooldown is enforced here
    // (both gates are skipped server-side for is_demo businesses — CP-68).
    const { data, error } = await createClient().rpc("spin_daily_reward", {
      p_business_id: business.id,
      p_membership_id: membershipId,
    });

    if (error || !data) {
      setWheelMs(0);
      const msg = error?.message ?? "Couldn't spin — please try again.";
      // Already spun / cooldown → show the "already spun" state.
      if (/already spun|cooldown/i.test(msg)) {
        localStorage.setItem(todayKey, "1");
        setPhase("claimed");
      } else {
        setErr(msg);
        setPhase("ready");
      }
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as {
      prize_id: string | null;
      prize_name: string | null; prize_description: string | null;
      prize_image_url: string | null; kind: string | null;
      points_amount: number | null; coupon_code: string | null;
    };
    const pts = Number(row.points_amount ?? 0);
    const tier: Prize["tier"] = pts >= 200 ? "jackpot" : pts >= 100 ? "lucky" : "nice";
    const p: Prize = {
      label: row.prize_name || (tier === "jackpot" ? "JACKPOT!" : tier === "lucky" ? "LUCKY!" : "Nice spin!"),
      points: pts,
      tier,
      kind: row.kind ?? "points",
      image: row.prize_image_url,
    };
    setPrize(p);

    // Land the pointer on the wedge showing the awarded prize: two more
    // full turns, easing out onto the target.
    const segIdx = segmentForPrize(p, row.prize_id ?? null);
    setWheelMs(3000);
    setWheelRot((r) => {
      const base = Math.ceil(r / 360) * 360;
      return base + 720 + (360 - (segIdx * segAngle + segAngle / 2));
    });

    // White flash → reveal. (Demo apps skip the localStorage claim so the
    // game re-arms instantly on replay.)
    timeouts.current.push(setTimeout(() => {
      setFlash(true);
      timeouts.current.push(setTimeout(() => setFlash(false), 350));
      timeouts.current.push(setTimeout(() => {
        setPhase("revealed");
        if (!isDemo) {
          localStorage.setItem(todayKey, "1");
          localStorage.setItem(prizeKey, JSON.stringify(p));
        }
        // Points/prize were already awarded server-side — nothing to do.
      }, 200));
    }, 3150));
  }

  // ── prize colour palette
  const prizeColor =
    prize?.tier === "jackpot"
      ? "#facc15"
      : prize?.tier === "lucky"
        ? "#c084fc"
        : "#ffffff";

  const prizeGlow =
    prize?.tier === "jackpot"
      ? "0 0 40px rgba(250,204,21,0.8)"
      : prize?.tier === "lucky"
        ? "0 0 30px rgba(192,132,252,0.7)"
        : "0 0 20px rgba(255,255,255,0.4)";

  // ─── render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/75"
        onClick={phase === "spinning" ? undefined : onClose}
      />

      {/* Phone-width casino panel — uses business brand colors with dark overlay */}
      <div
        className="relative w-full max-w-md h-full flex flex-col items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${primary}22 0%, #050510 30%, #050510 70%, ${primary}18 100%)`,
        }}
      >
        {/* ── brand-tinted atmospheric glow ── */}
        <div
          className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${primary}35 0%, transparent 70%)`,
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 100%, ${primary}25 0%, transparent 70%)`,
          }}
        />
        {/* ── neon grid lines tinted to brand color ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.07,
            backgroundImage: `linear-gradient(${primary} 1px, transparent 1px), linear-gradient(90deg, ${primary} 1px, transparent 1px)`,
            backgroundSize: "44px 44px",
          }}
        />

        {/* ── scanline overlay for CRT vibe ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
          }}
        />

        {/* ── white-flash ── */}
        {flash && (
          <div className="absolute inset-0 bg-white z-30 pointer-events-none" />
        )}

        {/* ── close btn ── */}
        {phase !== "spinning" && (
          <button
            onClick={onClose}
            className="absolute top-12 right-5 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center z-20 hover:bg-white/20 transition"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        )}

        {/* ── neon header — CP-72: no emoji, just the neon title ── */}
        <div className="text-center mb-5 z-10 select-none">
          <h2
            className="text-white text-2xl font-extrabold tracking-[0.25em] uppercase"
            style={{ textShadow: `0 0 15px ${primary}, 0 0 35px ${primary}88` }}
          >
            {gameMeta.title}
          </h2>
          <p className="text-[11px] mt-1 tracking-widest uppercase"
            style={{ color: `${primary}cc` }}>
            {isDemo ? "Demo mode — unlimited plays" : "One spin per day"}
          </p>
        </div>

        {/* ── the prize wheel — CP-72: wedges show the REAL prizes ── */}
        {/* CP-125: the wheel now renders in the LOCKED phase too — the
            prize pool loads regardless, so customers browsing from home
            can see exactly what a visit could win. Spinning stays gated. */}
        {phase !== "claimed" && (
          <div className="relative mb-6 z-10">
            {/* pointer */}
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 text-4xl"
              style={{ color: "#facc15", textShadow: "0 0 10px rgba(250,204,21,0.8)" }}
            >
              ▼
            </div>
            {/* CP-133: bigger wheel — fills the phone width (capped so it
                still fits above the spin button on short screens). */}
            <div
              className="relative rounded-full"
              style={{
                width: "min(88vw, 46vh, 360px)",
                height: "min(88vw, 46vh, 360px)",
                transform: `rotate(${wheelRot}deg)`,
                transition: wheelMs ? `transform ${wheelMs}ms cubic-bezier(0.12, 0.8, 0.22, 1)` : "none",
                background: `conic-gradient(${segments.map(
                  (_, i) => `${i % 2 ? `${primary}cc` : "#181830"} ${i * segAngle}deg ${(i + 1) * segAngle}deg`,
                ).join(", ")})`,
                border: "4px solid #facc15",
                boxShadow: `0 0 35px ${primary}55, inset 0 0 25px rgba(0,0,0,0.45)`,
              }}
            >
              {segments.map((s, i) => (
                <div
                  key={i}
                  className="absolute inset-0 pointer-events-none"
                  style={{ transform: `rotate(${i * segAngle + segAngle / 2}deg)` }}
                >
                  {/* CP-73: visual wedges — prize photo for rewards, coin
                      icon for point amounts. */}
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 text-center flex flex-col items-center ${
                      dense === 2 ? "top-2 w-12" : dense === 1 ? "top-2.5 w-16" : "top-3 w-20"
                    }`}
                  >
                    {s.kind === "points" ? (
                      <>
                        <Coins className={`text-amber-300 drop-shadow mb-0.5 ${dense === 2 ? "h-3 w-3" : "h-4 w-4"}`} />
                        <div className={`font-black text-white drop-shadow leading-none ${
                          dense === 2 ? "text-xs" : dense === 1 ? "text-base" : "text-xl"
                        }`}>{s.big}</div>
                      </>
                    ) : s.image ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.image}
                          alt={s.big}
                          className={`rounded-full object-cover ring-1 ring-white/80 shadow mb-0.5 ${
                            dense === 2 ? "h-6 w-6" : dense === 1 ? "h-8 w-8" : "h-10 w-10"
                          }`}
                        />
                        <div className={`font-black text-white drop-shadow leading-tight ${
                          dense === 2 ? "text-[8px]" : dense === 1 ? "text-[10px]" : "text-[11px]"
                        }`}>{s.big}</div>
                      </>
                    ) : (
                      <>
                        <Gift className={`text-white drop-shadow mb-0.5 ${dense === 2 ? "h-3 w-3" : "h-4 w-4"}`} />
                        <div className={`font-black text-white drop-shadow leading-tight ${
                          dense === 2 ? "text-[8px]" : dense === 1 ? "text-[10px]" : "text-[11px]"
                        }`}>{s.big}</div>
                      </>
                    )}
                    {dense < 2 && (
                      <div className="text-[7px] font-extrabold tracking-[0.18em] text-white/75 mt-0.5">
                        {s.small}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* hub — business logo when there is one */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-16 w-16 rounded-full bg-white flex items-center justify-center shadow-xl ring-2 ring-black/10 overflow-hidden">
                {business.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={business.logo_url} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Zap className="h-6 w-6" style={{ color: primary }} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── state-specific content ── */}
        <div className="z-10 text-center px-8 w-full max-w-xs">

          {/* LOCKED */}
          {/* CP-125: compact lock panel — the wheel is visible above as a
              prize preview, so this is a nudge, not a wall. */}
          {phase === "locked" && (
            <div className="flex flex-col items-center">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-3"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                <Lock className="h-4 w-4 text-zinc-400" />
                <span className="text-zinc-300 text-xs font-bold uppercase tracking-widest">Spin locked</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                These prizes are up for grabs — visit the shop and get
                checked in to take your spin!
              </p>
              <div
                className="mt-4 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full"
                style={{
                  color: primary,
                  border: `1px solid ${primary}44`,
                  background: `${primary}10`,
                }}
              >
                Come in to unlock
              </div>
            </div>
          )}

          {/* READY */}
          {phase === "ready" && (
            <>
              <button
                onClick={handleSpin}
                className="w-full h-16 rounded-2xl font-extrabold text-xl uppercase tracking-widest text-black transition-all active:scale-95 hover:brightness-110"
                style={{
                  background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                  boxShadow:
                    "0 0 35px rgba(251,191,36,0.55), 0 8px 24px -4px rgba(245,158,11,0.45)",
                }}
              >
                {gameMeta.cta}
              </button>
              {err && <p className="text-rose-300 text-xs mt-3">{err}</p>}
            </>
          )}

          {/* SPINNING */}
          {phase === "spinning" && (
            <div
              className="text-sm font-extrabold tracking-[0.3em] uppercase"
              style={{
                color: primary,
                textShadow: `0 0 12px ${primary}`,
                animation: "pulse 0.8s ease-in-out infinite",
              }}
            >
              Spinning…
            </div>
          )}

          {/* REVEALED */}
          {phase === "revealed" && prize && (
            <div
              style={{
                animation: "bounceIn 0.45s cubic-bezier(0.36,0.07,0.19,0.97)",
              }}
            >
              {/* CP-37.2: business logo replaces the generic sparkle on
                  the reveal frame — Andrew wanted the celebration tied
                  to the local brand. Falls back to the celebratory emoji
                  only when the business hasn't uploaded a logo yet. */}
              <div className="flex justify-center mb-3">
                {/* CP-44: prefer the won prize's own image; else business logo; else emoji. */}
                {(prize.image || business.logo_url) ? (
                  <div
                    className="h-20 w-20 rounded-2xl bg-white flex items-center justify-center shadow-xl ring-2 overflow-hidden"
                    style={{ borderColor: primary }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prize.image || business.logo_url || ""}
                      alt={prize.label}
                      className={`h-full w-full ${prize.image ? "object-cover" : "object-contain p-2"}`}
                    />
                  </div>
                ) : (
                  /* CP-94: emoji fallback replaced with a tier-tinted icon
                     tile — matches the branded frame used when a logo or
                     prize photo exists, so no path looks "stock". */
                  <div
                    className="h-20 w-20 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: `2px solid ${prizeColor}`,
                      boxShadow: prizeGlow,
                    }}
                  >
                    <PartyPopper className="h-10 w-10" style={{ color: prizeColor }} />
                  </div>
                )}
              </div>

              <div
                className="text-4xl font-extrabold mb-1"
                style={{ color: prizeColor, textShadow: prizeGlow }}
              >
                {prize.label}
              </div>

              {/* CP-44: reveal copy depends on what the server awarded. */}
              {/* CP-73: coupons removed — points or a free reward. */}
              {prize.points > 0 ? (
                <>
                  <div className="text-white/80 text-lg font-semibold mb-1">
                    +{prize.points} bonus points
                  </div>
                  <div className="text-zinc-500 text-xs mb-6">
                    Added to your balance automatically
                  </div>
                </>
              ) : (
                <div className="text-white/80 text-sm mb-6 px-4">
                  Added to your rewards — show it at the counter to claim.
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full h-12 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95"
                style={{
                  background: `${primary}22`,
                  color: primary,
                  border: `1px solid ${primary}44`,
                }}
              >
                <Zap className="h-3.5 w-3.5 inline mr-1.5" />
                Awesome — close
              </button>

              {/* CP-68: demo apps replay the reward moment endlessly. */}
              {isDemo && (
                <button
                  onClick={demoReplay}
                  className="w-full h-11 mt-2 rounded-xl font-bold text-xs tracking-widest uppercase text-white/80 bg-white/10 hover:bg-white/15 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5 inline mr-1.5" />
                  Demo: play again
                </button>
              )}
            </div>
          )}

          {/* CLAIMED — CP-94: the green ✅ emoji is gone. The prize they
              already won IS the visual now: its photo (or the business
              logo) in the same branded frame the reveal uses, with the
              prize name as the headline. Falls back to a brand-ringed
              gift icon when nothing is stored (spun on another device). */}
          {phase === "claimed" && (
            <div className="flex flex-col items-center w-full">
              <div
                className="text-[10px] uppercase tracking-[0.25em] font-extrabold mb-4"
                style={{ color: `${primary}cc` }}
              >
                Already spun today
              </div>

              {storedPrize ? (
                <>
                  <div
                    className="h-20 w-20 rounded-2xl bg-white flex items-center justify-center overflow-hidden mb-3"
                    style={{
                      border: `2px solid ${primary}`,
                      boxShadow: `0 0 30px ${primary}55`,
                    }}
                  >
                    {(storedPrize.image || business.logo_url) ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={storedPrize.image || business.logo_url || ""}
                        alt={storedPrize.label}
                        className={`h-full w-full ${storedPrize.image ? "object-cover" : "object-contain p-2"}`}
                      />
                    ) : (
                      <Gift className="h-9 w-9" style={{ color: primary }} />
                    )}
                  </div>
                  <div className="text-white/60 text-xs font-bold uppercase tracking-wider mb-1">
                    You won
                  </div>
                  <div
                    className="text-3xl font-extrabold leading-tight mb-1"
                    style={{ color: "#fff", textShadow: `0 0 24px ${primary}88` }}
                  >
                    {storedPrize.label}
                  </div>
                  {storedPrize.points > 0 && (
                    <div className="text-white/70 text-sm font-semibold">
                      +{storedPrize.points} bonus points
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div
                    className="h-20 w-20 rounded-full flex items-center justify-center mb-3"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: `2px solid ${primary}66`,
                    }}
                  >
                    <Gift className="h-9 w-9" style={{ color: primary }} />
                  </div>
                  <h3 className="text-white text-xl font-bold mb-1">
                    Today&apos;s spin is done
                  </h3>
                </>
              )}

              <p className="text-zinc-500 text-xs mb-5 mt-3">
                Check in tomorrow for a fresh spin.
              </p>
              {/* CP-68: demo apps replay the reward moment endlessly. */}
              {isDemo && (
                <button
                  onClick={demoReplay}
                  className="h-11 px-8 mb-2 rounded-xl font-bold text-xs tracking-widest uppercase text-white/80 bg-white/10 hover:bg-white/15 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5 inline mr-1.5" />
                  Demo: play again
                </button>
              )}
              <button
                onClick={onClose}
                className="h-11 px-8 rounded-xl font-semibold text-sm text-white/70 bg-white/10 hover:bg-white/15 transition"
              >
                Got it
              </button>
            </div>
          )}
        </div>

        {/* ── keyframe animations injected inline ── */}
        <style>{`
          @keyframes bounceIn {
            0%   { opacity: 0; transform: scale(0.3); }
            50%  { opacity: 1; transform: scale(1.15); }
            70%  { transform: scale(0.9); }
            100% { transform: scale(1); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.4; }
          }
        `}</style>
      </div>
    </div>
  );
}
