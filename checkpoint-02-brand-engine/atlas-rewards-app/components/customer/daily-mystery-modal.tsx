"use client";
/**
 * DailyMysteryModal — slot-machine gambling animation.
 *
 * Unlocked when the member has a check-in today (checked_in_today = true).
 * Claim state is persisted in localStorage (key: mystery_{businessId}_{date})
 * so it survives page refreshes but resets daily.
 *
 * Animation sequence (all timings in ms):
 *   0      → all 3 reels spinning (symbols blur past)
 *   1 300  → reel 1 locks  (thud scale pop)
 *   2 000  → reel 2 locks
 *   2 700  → reel 3 locks  → white flash → prize revealed
 */

import { useEffect, useRef, useState } from "react";
import { X, Lock, Zap, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
// CP-68: multiple reward games (slot / wheel / boxes) + demo replay.
import { rewardGame, rewardGameMeta } from "@/lib/reward-games";
import type { Business } from "@/lib/types/database";

// ─── symbols & prizes ────────────────────────────────────────────────────────

const SYMBOLS = ["🔥", "⭐", "💎", "🎯", "👑", "🎁", "⚡", "🍀", "🌟", "🏆"];

type Prize = {
  symbols: [string, string, string];
  label: string;
  points: number;
  tier: "jackpot" | "lucky" | "nice";
  // CP-44: server-decided prize details (the client no longer chooses these).
  kind?: string;
  image?: string | null;
  coupon?: string | null;
};

// Cosmetic only: pick slot symbols that match the prize tier the SERVER
// awarded, so the reels visually land on something sensible. The actual
// points/prize come from spin_daily_reward — the client can't influence them.
function symbolsForTier(tier: Prize["tier"]): [string, string, string] {
  if (tier === "jackpot") {
    const s = ["🔥", "💎", "👑"][Math.floor(Math.random() * 3)];
    return [s, s, s];
  }
  if (tier === "lucky") {
    const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    let s2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    while (s2 === s) s2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    return [s, s, s2];
  }
  return [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, 3) as [string, string, string];
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

  // CP-68: which game this business plays + demo mode.
  const game = rewardGame(business.reward_game);
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

  // Each reel holds an index into SYMBOLS that cycles while spinning.
  const [reelIdx, setReelIdx] = useState<[number, number, number]>([0, 0, 0]);
  const [locked, setLocked] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [prize, setPrize] = useState<Prize | null>(storedPrize);
  // White-flash overlay
  const [flash, setFlash] = useState(false);
  // CP-44: spin error (cooldown / not checked in / disabled).
  const [err, setErr] = useState<string | null>(null);
  // CP-68: prize-wheel state — accumulated rotation + transition duration.
  const [wheelRot, setWheelRot] = useState(0);
  const [wheelMs, setWheelMs] = useState(0);
  // CP-68: mystery-boxes state — which box is highlighted / opened.
  const [boxFocus, setBoxFocus] = useState<number | null>(null);
  const [boxOpen, setBoxOpen] = useState<number | null>(null);

  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const primary = business.brand_colors.primary;

  // CP-68: wheel geometry — 8 segments, pointer at the top.
  const WHEEL_SEGMENTS = ["✨", "⭐", "💎", "🎁", "🍀", "👑", "🔥", "🎯"];
  function segmentForTier(tier: Prize["tier"]): number {
    if (tier === "jackpot") return [2, 5][Math.floor(Math.random() * 2)];        // 💎 👑
    if (tier === "lucky")   return [1, 3, 4][Math.floor(Math.random() * 3)];     // ⭐ 🎁 🍀
    return [0, 6, 7][Math.floor(Math.random() * 3)];                             // ✨ 🔥 🎯
  }

  // CP-68: demo replay — wipe local claim state and re-arm the game.
  function demoReplay() {
    try {
      localStorage.removeItem(todayKey);
      localStorage.removeItem(prizeKey);
    } catch { /* ignore */ }
    intervals.current.forEach(clearInterval);
    setPrize(null); setFlash(false); setErr(null);
    setLocked([false, false, false]);
    setReelIdx([0, 0, 0]);
    setWheelMs(0);
    setBoxFocus(null); setBoxOpen(null);
    setPhase("ready");
  }

  // ── cleanup on unmount
  useEffect(() => () => intervals.current.forEach(clearInterval), []);

  // ── start spinning (CP-44: server-authoritative; CP-68: per-game theater)
  async function handleSpin() {
    if (phase !== "ready" || !membershipId) return;
    setErr(null);
    setPhase("spinning");

    // Kick off this game's "suspense" animation immediately — it keeps
    // running while we ask the server for the real prize.
    if (game === "slot") {
      setLocked([false, false, false]);
      intervals.current = [0, 1, 2].map((ri) =>
        setInterval(() => {
          setReelIdx((prev) => {
            const next = [...prev] as [number, number, number];
            next[ri] = (next[ri] + 1) % SYMBOLS.length;
            return next;
          });
        }, 75 + ri * 8),
      );
    } else if (game === "wheel") {
      // Long lazy spin while we wait; overridden with the precise landing
      // rotation once the server answers.
      setWheelMs(9000);
      setWheelRot((r) => r + 1440);
    } else {
      // boxes: cycle the highlight across the three gift boxes.
      setBoxOpen(null);
      let i = 0;
      const t = setInterval(() => { setBoxFocus(i % 3); i++; }, 150);
      intervals.current = [t];
    }

    // Ask the server to pick + award the prize. The client cannot influence
    // the amount, can only spin for itself, and the cooldown is enforced here
    // (both gates are skipped server-side for is_demo businesses — CP-68).
    const { data, error } = await createClient().rpc("spin_daily_reward", {
      p_business_id: business.id,
      p_membership_id: membershipId,
    });

    if (error || !data) {
      intervals.current.forEach(clearInterval);
      setWheelMs(0);
      setBoxFocus(null);
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
      prize_name: string | null; prize_description: string | null;
      prize_image_url: string | null; kind: string | null;
      points_amount: number | null; coupon_code: string | null;
    };
    const pts = Number(row.points_amount ?? 0);
    const tier: Prize["tier"] = pts >= 200 ? "jackpot" : pts >= 100 ? "lucky" : "nice";
    const p: Prize = {
      symbols: symbolsForTier(tier),
      label: row.prize_name || (tier === "jackpot" ? "JACKPOT!" : tier === "lucky" ? "LUCKY!" : "Nice spin!"),
      points: pts,
      tier,
      kind: row.kind ?? "points",
      image: row.prize_image_url,
      coupon: row.coupon_code,
    };
    setPrize(p);

    // Shared landing: white flash → reveal. (Demo apps skip the localStorage
    // claim so the game re-arms instantly on replay.)
    const finish = () => {
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      setTimeout(() => {
        setPhase("revealed");
        if (!isDemo) {
          localStorage.setItem(todayKey, "1");
          localStorage.setItem(prizeKey, JSON.stringify(p));
        }
        // Points/prize were already awarded server-side — nothing to do.
      }, 200);
    };

    if (game === "slot") {
      // Stop each reel in sequence, landing on the server-decided symbols.
      const stopTimes = [900, 1500, 2100];
      stopTimes.forEach((t, ri) => {
        setTimeout(() => {
          clearInterval(intervals.current[ri]);
          const finalIdx = SYMBOLS.indexOf(p.symbols[ri]);
          setReelIdx((prev) => {
            const next = [...prev] as [number, number, number];
            next[ri] = finalIdx >= 0 ? finalIdx : 0;
            return next;
          });
          setLocked((prev) => {
            const next = [...prev] as [boolean, boolean, boolean];
            next[ri] = true;
            return next;
          });
          if (ri === 2) setTimeout(finish, 400);
        }, t);
      });
    } else if (game === "wheel") {
      // Land the pointer on a segment matching the prize tier: two more
      // full turns, easing out onto the target.
      const segIdx = segmentForTier(p.tier);
      setWheelMs(3000);
      setWheelRot((r) => {
        const base = Math.ceil(r / 360) * 360;
        return base + 720 + (360 - (segIdx * 45 + 22.5));
      });
      setTimeout(finish, 3150);
    } else {
      // boxes: keep shuffling briefly, settle on one, pop it open.
      setTimeout(() => {
        intervals.current.forEach(clearInterval);
        const chosen = Math.floor(Math.random() * 3);
        setBoxFocus(chosen);
        setTimeout(() => {
          setBoxOpen(chosen);
          setTimeout(finish, 550);
        }, 450);
      }, 1500);
    }
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

        {/* ── neon header ── */}
        <div className="text-center mb-8 z-10 select-none">
          <div className="text-5xl mb-2 drop-shadow-lg">{gameMeta.emoji}</div>
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

        {/* ── CP-68: prize wheel ── */}
        {game === "wheel" && phase !== "locked" && phase !== "claimed" && (
          <div className="relative mb-8 z-10">
            {/* pointer */}
            <div
              className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 text-3xl"
              style={{ color: "#facc15", textShadow: "0 0 10px rgba(250,204,21,0.8)" }}
            >
              ▼
            </div>
            <div
              className="relative h-56 w-56 rounded-full"
              style={{
                transform: `rotate(${wheelRot}deg)`,
                transition: wheelMs ? `transform ${wheelMs}ms cubic-bezier(0.12, 0.8, 0.22, 1)` : "none",
                background: `conic-gradient(${WHEEL_SEGMENTS.map(
                  (_, i) => `${i % 2 ? `${primary}cc` : "#181830"} ${i * 45}deg ${(i + 1) * 45}deg`,
                ).join(", ")})`,
                border: "4px solid #facc15",
                boxShadow: `0 0 35px ${primary}55, inset 0 0 25px rgba(0,0,0,0.45)`,
              }}
            >
              {WHEEL_SEGMENTS.map((s, i) => (
                <div
                  key={i}
                  className="absolute inset-0 pointer-events-none"
                  style={{ transform: `rotate(${i * 45 + 22.5}deg)` }}
                >
                  <span className="absolute top-3 left-1/2 -translate-x-1/2 text-2xl drop-shadow">{s}</span>
                </div>
              ))}
            </div>
            {/* hub */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center text-xl shadow-xl ring-2 ring-black/10">
                🎯
              </div>
            </div>
          </div>
        )}

        {/* ── CP-68: mystery boxes ── */}
        {game === "boxes" && phase !== "locked" && phase !== "claimed" && (
          <div className="flex gap-5 mb-8 z-10">
            {[0, 1, 2].map((i) => {
              const focused = boxFocus === i;
              const opened = boxOpen === i;
              return (
                <div
                  key={i}
                  className="h-24 w-24 rounded-2xl flex items-center justify-center text-5xl transition-all duration-200"
                  style={{
                    border: focused ? "3px solid #facc15" : `3px solid ${primary}55`,
                    background: focused ? "rgba(250,204,21,0.12)" : `${primary}12`,
                    boxShadow: focused
                      ? "0 0 30px rgba(250,204,21,0.45), inset 0 0 18px rgba(250,204,21,0.08)"
                      : `0 0 12px ${primary}44, inset 0 0 8px ${primary}18`,
                    transform: opened ? "scale(1.25)" : focused ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  <span style={{ display: "block", lineHeight: 1 }}>
                    {opened
                      ? prize?.tier === "jackpot" ? "🎆" : prize?.tier === "lucky" ? "🎉" : "✨"
                      : "🎁"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── slot machine reels (hidden in locked state) ── */}
        {game === "slot" && phase !== "locked" && phase !== "claimed" && (
          <div className="flex gap-4 mb-8 z-10">
            {([0, 1, 2] as const).map((ri) => {
              const isLocked = locked[ri];
              return (
                <div
                  key={ri}
                  className="relative flex flex-col items-center"
                >
                  {/* Reel cell */}
                  <div
                    className="h-24 w-24 rounded-2xl flex items-center justify-center text-5xl transition-all duration-200"
                    style={{
                      border: isLocked
                        ? "3px solid #facc15"
                        : `3px solid ${primary}55`,
                      background: isLocked
                        ? "rgba(250,204,21,0.12)"
                        : `${primary}12`,
                      boxShadow: isLocked
                        ? "0 0 30px rgba(250,204,21,0.45), inset 0 0 18px rgba(250,204,21,0.08)"
                        : `0 0 12px ${primary}44, inset 0 0 8px ${primary}18`,
                      transform: isLocked ? "scale(1.12)" : "scale(1)",
                    }}
                  >
                    <span
                      style={{
                        filter:
                          phase === "spinning" && !isLocked
                            ? "blur(2px)"
                            : "none",
                        transition: "filter 0.15s, transform 0.2s",
                        display: "block",
                        lineHeight: 1,
                      }}
                    >
                      {SYMBOLS[reelIdx[ri]]}
                    </span>
                  </div>

                  {/* "STOP" flash label under each reel as it locks */}
                  <div
                    className="text-[10px] font-extrabold tracking-widest uppercase mt-1.5 transition-opacity duration-200"
                    style={{
                      color: isLocked ? "#facc15" : "transparent",
                      textShadow: isLocked
                        ? "0 0 8px rgba(250,204,21,0.8)"
                        : "none",
                    }}
                  >
                    LOCK
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── state-specific content ── */}
        <div className="z-10 text-center px-8 w-full max-w-xs">

          {/* LOCKED */}
          {phase === "locked" && (
            <div className="flex flex-col items-center">
              <div
                className="h-28 w-28 rounded-full flex items-center justify-center mb-5"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "2px solid rgba(255,255,255,0.12)",
                }}
              >
                <Lock className="h-12 w-12 text-zinc-500" />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">Locked</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Visit the shop and get checked in to unlock your daily spin!
              </p>
              <div
                className="mt-6 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full"
                style={{
                  color: primary,
                  border: `1px solid ${primary}44`,
                  background: `${primary}10`,
                }}
              >
                Come in to unlock 🔑
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
                {gameMeta.emoji} &nbsp;{gameMeta.cta}
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
                  <div className="text-5xl">
                    {prize.tier === "jackpot"
                      ? "🎆"
                      : prize.tier === "lucky"
                        ? "🎉"
                        : "✨"}
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
              {prize.points > 0 ? (
                <>
                  <div className="text-white/80 text-lg font-semibold mb-1">
                    +{prize.points} bonus points
                  </div>
                  <div className="text-zinc-500 text-xs mb-6">
                    Added to your balance automatically
                  </div>
                </>
              ) : prize.kind === "coupon" && prize.coupon ? (
                <>
                  <div className="text-white/70 text-xs uppercase tracking-widest mb-1">Your code</div>
                  <div className="text-white text-xl font-mono font-bold tracking-[0.2em] mb-6">{prize.coupon}</div>
                </>
              ) : (
                <div className="text-white/80 text-sm mb-6 px-4">
                  Added to your rewards — show it at the counter to claim. 🎉
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

          {/* CLAIMED — show what they won as a reminder */}
          {phase === "claimed" && (
            <div className="flex flex-col items-center w-full">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-white text-xl font-bold mb-1">
                Already spun today!
              </h3>

              {/* Last prize reminder */}
              {storedPrize && (
                <div
                  className="mt-4 mb-4 w-full rounded-2xl p-4 text-center"
                  style={{ background: `${primary}18`, border: `1px solid ${primary}33` }}
                >
                  <div className="text-[10px] uppercase tracking-widest font-bold mb-2"
                    style={{ color: `${primary}bb` }}>
                    Your spin today
                  </div>
                  <div className="flex justify-center gap-3 text-3xl mb-2">
                    {storedPrize.symbols.map((s, i) => <span key={i}>{s}</span>)}
                  </div>
                  <div className="text-white font-extrabold text-lg">{storedPrize.label}</div>
                  <div className="text-white/70 text-sm">+{storedPrize.points} bonus points</div>
                </div>
              )}

              <p className="text-zinc-500 text-xs mb-5">
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
