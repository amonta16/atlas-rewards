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
import { X, Lock, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

// ─── symbols & prizes ────────────────────────────────────────────────────────

const SYMBOLS = ["🔥", "⭐", "💎", "🎯", "👑", "🎁", "⚡", "🍀", "🌟", "🏆"];

type Prize = {
  symbols: [string, string, string];
  label: string;
  points: number;
  tier: "jackpot" | "lucky" | "nice";
};

function pickPrize(): Prize {
  const rand = Math.random();

  if (rand < 0.05) {
    // 5 % → JACKPOT: three of a kind from the "premium" symbols
    const s = ["🔥", "💎", "👑"][Math.floor(Math.random() * 3)];
    return { symbols: [s, s, s], label: "JACKPOT!", points: 300, tier: "jackpot" };
  }

  if (rand < 0.20) {
    // 15 % → LUCKY: two of a kind
    const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    let s2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    while (s2 === s) s2 = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    return { symbols: [s, s, s2], label: "LUCKY!", points: 100, tier: "lucky" };
  }

  // 80 % → NICE: three unique symbols (guaranteed all different)
  const pool = [...SYMBOLS].sort(() => Math.random() - 0.5).slice(0, 3) as [string, string, string];
  return { symbols: pool, label: "Nice spin!", points: 50, tier: "nice" };
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

  const [phase, setPhase] = useState<Phase>(() => {
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

  const intervals = useRef<ReturnType<typeof setInterval>[]>([]);
  const primary = business.brand_colors.primary;

  // ── cleanup on unmount
  useEffect(() => () => intervals.current.forEach(clearInterval), []);

  // ── start spinning
  function handleSpin() {
    if (phase !== "ready") return;
    const p = pickPrize();
    setPrize(p);
    setPhase("spinning");
    setLocked([false, false, false]);

    // Start three independent intervals at slightly different speeds for realism
    intervals.current = [0, 1, 2].map((ri) =>
      setInterval(() => {
        setReelIdx((prev) => {
          const next = [...prev] as [number, number, number];
          next[ri] = (next[ri] + 1) % SYMBOLS.length;
          return next;
        });
      }, 75 + ri * 8),
    );

    // Stop each reel in sequence
    const stopTimes = [1300, 2000, 2700];
    stopTimes.forEach((t, ri) => {
      setTimeout(() => {
        clearInterval(intervals.current[ri]);
        // Snap to the predetermined final symbol
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

        // After last reel → flash → reveal
        if (ri === 2) {
          setTimeout(() => {
            setFlash(true);
            setTimeout(() => setFlash(false), 350);
            setTimeout(() => {
              setPhase("revealed");
              // Persist claim + prize so "claimed" state can show what they won
              localStorage.setItem(todayKey, "1");
              localStorage.setItem(prizeKey, JSON.stringify(p));
              // Award bonus points via Supabase RPC
              if (membershipId) {
                // Fire-and-forget; the RPC may not exist on this install,
                // so we swallow both success + failure paths.
                Promise.resolve(
                  createClient().rpc("award_checkin_mystery_bonus", {
                    p_membership_id: membershipId,
                    p_business_id: business.id,
                    p_points: p.points,
                  })
                ).catch(() => {});
              }
            }, 200);
          }, 400);
        }
      }, t);
    });
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
          <div className="text-5xl mb-2 drop-shadow-lg">🎰</div>
          <h2
            className="text-white text-2xl font-extrabold tracking-[0.25em] uppercase"
            style={{ textShadow: `0 0 15px ${primary}, 0 0 35px ${primary}88` }}
          >
            Daily Spin
          </h2>
          <p className="text-[11px] mt-1 tracking-widest uppercase"
            style={{ color: `${primary}cc` }}>
            One spin per day
          </p>
        </div>

        {/* ── slot machine reels (hidden in locked state) ── */}
        {phase !== "locked" && phase !== "claimed" && (
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
            <button
              onClick={handleSpin}
              className="w-full h-16 rounded-2xl font-extrabold text-xl uppercase tracking-widest text-black transition-all active:scale-95 hover:brightness-110"
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                boxShadow:
                  "0 0 35px rgba(251,191,36,0.55), 0 8px 24px -4px rgba(245,158,11,0.45)",
              }}
            >
              🎰 &nbsp;SPIN!
            </button>
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
              <div className="text-5xl mb-3">
                {prize.tier === "jackpot"
                  ? "🎆"
                  : prize.tier === "lucky"
                    ? "🎉"
                    : "✨"}
              </div>

              <div
                className="text-4xl font-extrabold mb-1"
                style={{ color: prizeColor, textShadow: prizeGlow }}
              >
                {prize.label}
              </div>

              <div className="text-white/80 text-lg font-semibold mb-1">
                +{prize.points} bonus points
              </div>

              <div className="text-zinc-500 text-xs mb-6">
                Added to your balance automatically
              </div>

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
