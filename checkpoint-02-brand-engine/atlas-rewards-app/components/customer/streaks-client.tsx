"use client";
/**
 * StreaksClient — CP-99 Phase 4 (redesigned per Andrew's Reward Road brief)
 *
 * /<slug>/app/streaks. The STREAK is the centerpiece, not the reward list:
 * a centered vertical "burning" progress track climbs BOTTOM → TOP from a
 * START marker to the member's current position, with reward milestones
 * branching off the track on alternating sides as compact cards.
 *
 * Key behaviors:
 *  - REPLAY: every time the page is entered, the fill burns upward from
 *    START to the current streak (rAF-driven, eased, 1.5–4.5s scaled to
 *    progress — never per-unit). The camera follows the flame head.
 *    Milestones pulse ONCE, exactly when the fill crosses them.
 *  - DATA-DRIVEN: no "Week N" hardcoding — labels derive from the
 *    engine's period_type (day/week/month) and configured milestone
 *    counts. Positions are proportional to milestone values over the
 *    program range (a 365-day road is no taller than a 30-day one).
 *  - prefers-reduced-motion: no replay/camera — state renders instantly.
 *
 * ENGINE UNTOUCHED: same get_streak_status RPC + check_in_events realtime
 * listener as StreakWidget; gift_kind stays authoritative (CP-49).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Flame, Gift, Trophy, Lock, Check, CalendarDays, QrCode, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveStreakTheme, streakGradient, type StreakTheme } from "@/lib/streak-themes";
import type { Business } from "@/lib/types/database";

type Milestone = {
  count: number;
  label: string;
  points: number;
  mystery?: boolean;            // LEGACY/deprecated — ignored for rendering.
  gift_kind?: "points" | "reward";
  reward_id?: string | null;
  reward_image_url?: string | null;
  reward_name?: string | null;
};

type StreakStatus = {
  is_enabled: boolean;
  period_type: "daily" | "weekly" | "monthly";
  checkins_required_per_period: number;
  current_streak: number;
  longest_streak: number;
  total_checkins: number;
  last_checkin_at: string | null;
  checked_in_this_period: boolean;
  milestones: Milestone[];
  claimed_milestones: number[];
  period_start?: string | null;
  period_end?: string | null;
};

// CP-49: gift_kind is authoritative (same rule as StreakWidget).
function isReward(m: Milestone): boolean {
  if (m.gift_kind === "reward") return true;
  if (m.gift_kind === "points") return false;
  return !!m.reward_id;
}

/** "2d 5h" / "5h 32m" / "42m" — compact time-left label. */
function timeLeftLabel(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rem}m`;
  return `${rem}m`;
}

export function StreaksClient({
  business,
  membershipId,
}: {
  business: Business;
  membershipId: string | null;
}) {
  const [s, setS] = useState<StreakStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const theme = resolveStreakTheme(business.streak_theme, business.brand_colors?.primary);
  const primary = business.brand_colors.primary;

  useEffect(() => {
    if (!membershipId) { setLoaded(true); return; }
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id,
        p_membership_id: membershipId,
      });
      const row = (Array.isArray(data) ? data[0] : data) as StreakStatus | null;
      if (!cancelled) { setS(row); setLoaded(true); }
    };
    load();
    const ch = supabase
      .channel(`streaks-page-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id, membershipId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const milestones = useMemo<Milestone[]>(
    () => (s ? [...(s.milestones ?? [])].sort((a, b) => a.count - b.count) : []),
    [s],
  );

  if (!loaded) {
    return (
      <div className="px-4 pt-10 flex justify-center">
        <div className="bg-white rounded-2xl px-6 py-4 text-sm text-zinc-600 shadow-sm border">Loading your streak…</div>
      </div>
    );
  }

  if (!membershipId || !s || !s.is_enabled) {
    return (
      <div className="px-4 pt-8">
        <div className="rounded-3xl bg-white border shadow-sm p-8 text-center">
          <Flame className="h-10 w-10 mx-auto text-zinc-300" />
          <div className="mt-3 text-base font-bold text-zinc-800">No streak here yet</div>
          <p className="mt-1 text-sm text-zinc-500">
            {business.name} hasn&apos;t turned on check-in streaks. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  const current = s.current_streak ?? 0;
  const longest = Math.max(s.longest_streak ?? 0, current);
  const atPersonalBest = current > 0 && current >= (s.longest_streak ?? 0);
  // Data-driven unit terminology — never hardcode "week"/"day".
  const unit =
    s.period_type === "weekly" ? "week" :
    s.period_type === "monthly" ? "month" : "day";

  const nextMilestone = milestones.find(m => m.count > current) ?? null;
  const progressPct = nextMilestone
    ? Math.min(100, (current / nextMilestone.count) * 100)
    : 100;

  const periodEndMs = s.period_end ? new Date(s.period_end).getTime() : null;
  const msLeft = periodEndMs ? periodEndMs - now : null;
  const urgent = !s.checked_in_this_period && msLeft !== null && msLeft < 12 * 3600_000 && current > 0;

  return (
    <div className="pb-6">
      {/* ============ STICKY HERO ============ */}
      <div
        className="sticky top-0 z-30 px-3 pt-2 pb-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        <div
          className="rounded-3xl px-4 pt-3.5 pb-4 text-white shadow-xl ring-1 ring-black/10 relative overflow-hidden"
          style={{ background: streakGradient(theme, 160) }}
        >
          <Flame className="absolute -top-5 -right-5 h-24 w-24 text-white/10 rotate-12 pointer-events-none" />
          <Flame className="absolute -bottom-6 -left-4 h-16 w-16 text-white/10 -rotate-12 pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)" }} />

          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/40 shrink-0">
              <Flame className="h-8 w-8 drop-shadow-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-black leading-none tabular-nums drop-shadow">{current}</span>
                <span className="text-[11px] uppercase tracking-[0.18em] font-extrabold opacity-90 mb-1">
                  {unit} streak
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                <Trophy className="h-3.5 w-3.5 text-amber-200" />
                {atPersonalBest
                  ? <span className="text-amber-100">Personal best — keep it alive.</span>
                  : <span className="opacity-90">Best: {longest} {unit}{longest === 1 ? "" : "s"}</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {s.checked_in_this_period ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-emerald-400 text-emerald-950">
                  <Check className="h-3 w-3" /> Checked in
                </span>
              ) : msLeft !== null ? (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full ${
                    urgent ? "bg-red-500 text-white animate-pulse" : "bg-white text-zinc-900"
                  }`}
                >
                  <CalendarDays className="h-3 w-3" /> {timeLeftLabel(msLeft)} left
                </span>
              ) : null}
            </div>
          </div>

          {!s.checked_in_this_period && msLeft !== null && current > 0 && (
            <div className="mt-2 text-[11px] font-bold text-white/95">
              {urgent ? "Your streak is about to reset — " : "Keep your streak alive — "}
              check in within <span className="tabular-nums">{timeLeftLabel(msLeft)}</span>.
            </div>
          )}

          {nextMilestone && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[11px] mb-1 opacity-95">
                <span className="font-bold truncate mr-2">
                  Next: {isReward(nextMilestone)
                    ? (nextMilestone.reward_name ?? nextMilestone.label)
                    : `${(nextMilestone.points ?? 0).toLocaleString()} points`}
                </span>
                <span className="tabular-nums font-extrabold shrink-0">{current} / {nextMilestone.count}</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/20 overflow-hidden ring-1 ring-white/30">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${progressPct}%`, boxShadow: "0 0 10px rgba(255,255,255,0.7)" }}
                />
              </div>
            </div>
          )}

          {!s.checked_in_this_period && (
            <a
              href={`/${business.slug}/app/scan`}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-extrabold bg-white text-zinc-900 shadow-md active:scale-[0.99] transition"
            >
              <QrCode className="h-4 w-4" /> Check in now
            </a>
          )}
        </div>
      </div>

      {/* ============ THE REWARD ROAD ============ */}
      {milestones.length > 0 ? (
        <RewardRoad
          milestones={milestones}
          current={current}
          claimed={s.claimed_milestones ?? []}
          nextCount={nextMilestone?.count ?? null}
          theme={theme}
          primary={primary}
          secondary={business.brand_colors.secondary}
          logoUrl={business.logo_url}
          unit={unit}
        />
      ) : (
        // No configured milestones — never show fake placeholder rewards.
        <div className="px-4 mt-4">
          <div className="rounded-3xl bg-white border shadow-sm p-8 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-zinc-300" />
            <div className="mt-3 text-sm font-bold text-zinc-800">Your reward road is being built</div>
            <p className="mt-1 text-xs text-zinc-500">
              Keep checking in — {business.name} is adding streak rewards soon, and your streak already counts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RewardRoad — the centered burning track with branching milestones.
   ════════════════════════════════════════════════════════════════════ */

const PAD_TOP = 56;      // room for the finish glow
const PAD_BOTTOM = 84;   // room for the START marker
const MIN_GAP = 104;     // min vertical px between milestone nodes

function RewardRoad({
  milestones, current, claimed, nextCount, theme, primary, secondary, logoUrl, unit,
}: {
  milestones: Milestone[];
  current: number;
  claimed: number[];
  nextCount: number | null;
  theme: StreakTheme;
  primary: string;
  secondary: string;
  logoUrl: string | null;
  unit: string;
}) {
  // The whole program range: proportional layout, never one node per unit —
  // a 365-day road renders the same height as a 30-day one.
  const range = Math.max(milestones.at(-1)?.count ?? 1, current, 1);
  const targetFrac = Math.min(1, current / range);

  // Proportional Y for each milestone (bottom = 0, top = range), then a
  // spacing pass so close-together milestones never collide.
  const height = Math.max(440, milestones.length * (MIN_GAP + 26) + PAD_TOP + PAD_BOTTOM);
  const trackLen = height - PAD_TOP - PAD_BOTTOM;
  const rawY = (count: number) => PAD_TOP + (1 - count / range) * trackLen;
  const ys: number[] = milestones.map(m => rawY(m.count));
  // Collision pass: keep the lowest milestone above the START area, then
  // walk upward guaranteeing MIN_GAP between neighbours (ascending counts
  // sit at descending y). The height formula reserves enough room.
  if (ys.length > 0) {
    ys[0] = Math.min(ys[0], height - PAD_BOTTOM - 16);
    for (let i = 1; i < ys.length; i++) {
      ys[i] = Math.min(ys[i], ys[i - 1] - MIN_GAP);
    }
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const playedRef = useRef(false);
  // Milestones the replay flame has crossed (drives the one-shot pulse).
  const [crossed, setCrossed] = useState<Set<number>>(() => new Set());
  const [settled, setSettled] = useState(false);

  // ── REPLAY: burn from START to the current position, once per entry. ──
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;

    const reduced = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const finish = () => {
      if (fillRef.current) fillRef.current.style.height = `${targetFrac * 100}%`;
      if (headRef.current) headRef.current.style.bottom = `${targetFrac * 100}%`;
      setCrossed(new Set(milestones.filter(m => m.count <= current).map(m => m.count)));
      setSettled(true);
    };

    if (reduced || current <= 0) { finish(); return; }

    // Duration scales with how far they've climbed, capped 1.5–4.5s.
    const T = Math.min(4500, Math.max(1500, 1200 + targetFrac * 3300));
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const done = new Set<number>();
    let raf = 0;
    const start = performance.now();

    const step = (nowTs: number) => {
      const k = Math.min(1, (nowTs - start) / T);
      const prog = ease(k) * targetFrac; // 0 → targetFrac
      if (fillRef.current) fillRef.current.style.height = `${prog * 100}%`;
      if (headRef.current) headRef.current.style.bottom = `${prog * 100}%`;

      // Milestone crossings — pulse each EXACTLY once, when reached.
      const reachedCount = prog * range;
      let newly = false;
      for (const m of milestones) {
        if (m.count <= reachedCount + 1e-6 && m.count <= current && !done.has(m.count)) {
          done.add(m.count); newly = true;
        }
      }
      if (newly) setCrossed(new Set(done));

      // Camera follows the flame head up the road (we scroll, per-frame,
      // so the motion is continuous — transform/opacity stay GPU-cheap).
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const headViewportY = rect.top + PAD_TOP + (1 - prog) * (rect.height - PAD_TOP - PAD_BOTTOM);
        const target = Math.max(0, window.scrollY + headViewportY - window.innerHeight * 0.55);
        window.scrollTo({ top: target });
      }

      if (k < 1) { raf = requestAnimationFrame(step); }
      else { finish(); }
    };

    // Open on the START of the road, then climb: jump the camera to the
    // base first, breathe for a beat, then run the burn upward.
    const kick = window.setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const base = Math.max(0, window.scrollY + rect.top + rect.height - PAD_BOTTOM - window.innerHeight * 0.6);
        window.scrollTo({ top: base });
      }
      raf = requestAnimationFrame(step);
    }, 350);
    return () => { window.clearTimeout(kick); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fine tick marks for short programs (a sense of every step) — skipped on
  // long roads where proportional distance carries the meaning.
  const ticks = range <= 21 ? Array.from({ length: range }, (_, i) => i + 1) : [];

  const fillGradient = `linear-gradient(to top, ${theme.cell[2]} 0%, ${theme.cell[1]} 55%, ${theme.cell[0]} 100%)`;

  return (
    <div className="px-3 mt-4">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="text-sm font-bold" style={{ color: "var(--surf-fg, #18181b)" }}>
          Your reward road
        </h2>
        <span className="text-[10px] font-extrabold text-white px-2.5 py-1 rounded-full"
          style={{ background: streakGradient(theme) }}>
          Check in every {unit} to climb
        </span>
      </div>

      <div ref={containerRef} className="relative" style={{ height }}>
        {/* ── CENTRAL TRACK ── */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3.5 rounded-full"
          style={{
            top: PAD_TOP, bottom: PAD_BOTTOM,
            background: "rgba(0,0,0,0.07)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
          }}
        >
          {/* burning fill — height driven by the replay (rAF) */}
          <div
            ref={fillRef}
            className="absolute bottom-0 left-0 right-0 rounded-full"
            // During the replay, rAF drives height directly on the DOM node;
            // once settled, React owns it — so later re-renders (countdown
            // ticks, realtime refetches) can never collapse the fill.
            style={{
              height: settled ? `${targetFrac * 100}%` : "0%",
              background: fillGradient,
              boxShadow: `0 0 14px 1px ${theme.glow}`,
            }}
          />
          {/* unit ticks (short programs only) */}
          {ticks.map(i => (
            <div key={i} className="absolute left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-white/70"
              style={{ bottom: `${(i / range) * 100}%` }} />
          ))}
          {/* flame head — the member's current position, breathing softly */}
          {current > 0 && (
            <div
              ref={headRef}
              className="absolute left-1/2 z-20"
              style={{ bottom: settled ? `${targetFrac * 100}%` : "0%", transform: "translate(-50%, 50%)" }}
            >
              <div
                className="atlas-flame-head h-11 w-11 rounded-full flex items-center justify-center ring-4 ring-white"
                style={{
                  background: `linear-gradient(135deg, ${theme.cell[0]} 0%, ${theme.cell[1]} 55%, ${theme.cell[2]} 100%)`,
                  boxShadow: `0 0 20px 4px ${theme.glow}, 0 6px 16px -4px rgba(0,0,0,0.3)`,
                }}
              >
                <Flame className="h-6 w-6 text-white drop-shadow" />
              </div>
            </div>
          )}
        </div>

        {/* ── MILESTONES branching off the track ── */}
        {milestones.map((m, i) => {
          const y = ys[i];
          const left = i % 2 === 0; // alternate: first milestone → left
          const unlocked = m.count <= current;
          const isClaimed = claimed.includes(m.count);
          const isNext = nextCount === m.count;
          const pulsing = crossed.has(m.count);
          const rewardGift = isReward(m);
          const pointsGift = !rewardGift && (m.points ?? 0) > 0;

          return (
            <div key={m.count} className="absolute inset-x-0" style={{ top: y }}>
              {/* node on the track */}
              <div
                className={`absolute left-1/2 z-10 ${pulsing ? "atlas-node-pop" : ""}`}
                style={{ transform: "translate(-50%, -50%)" }}
              >
                <div
                  className="h-6 w-6 rounded-full ring-4 ring-white flex items-center justify-center"
                  style={{
                    background: unlocked
                      ? "linear-gradient(135deg, #facc15, #f59e0b)"
                      : "#e4e4e7",
                    boxShadow: unlocked ? "0 0 12px 2px rgba(245,158,11,0.6)" : "0 1px 3px rgba(0,0,0,0.15)",
                  }}
                >
                  {unlocked
                    ? <Check className="h-3.5 w-3.5 text-white" />
                    : <Lock className="h-3 w-3 text-zinc-400" />}
                </div>
              </div>

              {/* connector to the card */}
              <div
                className="absolute top-0 h-0.5 -translate-y-1/2"
                style={{
                  [left ? "right" : "left"]: "50%",
                  [left ? "marginRight" : "marginLeft"]: "0.9rem",
                  width: "1.1rem",
                  background: unlocked ? "linear-gradient(90deg, #facc15, #f59e0b)" : "rgba(0,0,0,0.10)",
                } as React.CSSProperties}
              />

              {/* compact reward card */}
              <div
                className={`absolute -translate-y-1/2 ${left ? "left-0 text-right" : "right-0"} ${pulsing ? "atlas-card-flash" : ""}`}
                style={{ top: 0, width: "calc(50% - 2.1rem)" }}
              >
                <div
                  className={`inline-block w-full rounded-2xl border bg-white shadow-sm ring-1 ring-black/5 overflow-hidden text-left ${
                    !unlocked && !isNext ? "opacity-75" : ""
                  }`}
                  style={
                    isNext
                      ? { borderColor: `${primary}66`, boxShadow: `0 0 0 2px ${primary}40, 0 10px 22px -12px ${primary}88` }
                      : unlocked
                        ? { borderColor: "rgba(245,158,11,0.5)" }
                        : undefined
                  }
                >
                  <div className="p-2.5">
                    {isNext && (
                      <div className="text-[8px] font-black tracking-[0.14em] uppercase mb-0.5" style={{ color: primary }}>
                        Next reward
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {/* small thumb — supports the road, never dominates */}
                      <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0 bg-zinc-100 flex items-center justify-center">
                        {rewardGift && m.reward_image_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={m.reward_image_url} alt="" className="h-full w-full object-cover"
                            style={{ opacity: unlocked || isNext ? 1 : 0.6, filter: unlocked || isNext ? undefined : "saturate(0.6)" }} />
                        ) : pointsGift && logoUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={logoUrl} alt="" className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <Gift className="h-4 w-4 text-zinc-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[8px] font-black tracking-wider uppercase text-zinc-400">
                          {m.count} {unit}{m.count === 1 ? "" : "s"}
                        </div>
                        <div className="text-[11px] font-bold text-zinc-900 leading-tight truncate">
                          {rewardGift
                            ? (m.reward_name ?? m.label)
                            : `${(m.points ?? 0).toLocaleString()} bonus points`}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      {isClaimed ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <Trophy className="h-2.5 w-2.5" /> Claimed
                        </span>
                      ) : unlocked ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Check className="h-2.5 w-2.5" /> Unlocked
                        </span>
                      ) : (
                        <span className={`text-[9px] font-bold ${isNext ? "" : "text-zinc-400"}`}
                          style={isNext ? { color: primary } : undefined}>
                          {m.count - current} more check-in{m.count - current === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── FINISH glow at the top when everything is earned ── */}
        {settled && current >= range && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: PAD_TOP - 48 }}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)", boxShadow: "0 0 18px 4px rgba(245,158,11,0.6)" }}>
              <Trophy className="h-5 w-5 text-white drop-shadow" />
            </div>
            <span className="mt-1 text-[9px] font-black tracking-widest uppercase text-amber-600">Complete</span>
          </div>
        )}

        {/* ── START marker at the base of the climb ── */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ bottom: PAD_BOTTOM - 62 }}>
          <div className="h-8 w-8 rounded-full bg-white ring-1 ring-black/10 shadow-sm flex items-center justify-center -mt-1">
            <Flame className="h-4 w-4" style={{ color: theme.to }} />
          </div>
          <span className="mt-1 text-[9px] font-black tracking-[0.2em] uppercase text-zinc-400">Start</span>
        </div>
      </div>

      {/* One-shot pulse + flash + breathing keyframes. Breathing is disabled
          for reduced-motion users; the replay itself is skipped in JS. */}
      <style>{`
        @keyframes atlasNodePop {
          0%   { transform: translate(-50%, -50%) scale(1); }
          40%  { transform: translate(-50%, -50%) scale(1.45); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        .atlas-node-pop { animation: atlasNodePop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) 1; }
        @keyframes atlasCardFlash {
          0%   { filter: brightness(1); transform: translateY(-50%) scale(1); }
          35%  { filter: brightness(1.12); transform: translateY(-52%) scale(1.03); }
          100% { filter: brightness(1); transform: translateY(-50%) scale(1); }
        }
        .atlas-card-flash { animation: atlasCardFlash 0.7s ease-out 1; }
        @keyframes atlasFlameBreath {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.07); }
        }
        .atlas-flame-head { animation: atlasFlameBreath 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .atlas-flame-head, .atlas-node-pop, .atlas-card-flash { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
