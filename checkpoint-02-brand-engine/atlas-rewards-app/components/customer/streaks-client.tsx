"use client";
/**
 * StreaksClient — CP-99 Phase 4 · Reward Road v2 (Andrew's refinement brief)
 *
 * /<slug>/app/streaks. Hierarchy: 1) my streak, 2) the road, 3) next reward,
 * 4) future rewards, 5) the check-in action. Key traits:
 *
 *  - SELF-CONTAINED BACKGROUND scoped to this page only: soft neutral
 *    depth gradient + faint center light + gentle vignette, so the road
 *    reads identically on any client theme. Global styling untouched.
 *  - LAYERED TRACK: white outer casing → clearly visible slate channel →
 *    warm burning fill (streak-theme heat colors; fire default = red →
 *    orange → yellow) → flame head, the hottest point on the page. The
 *    channel segment between the head and the NEXT milestone carries a
 *    faint warm tint (position → next-reward connection).
 *  - STATE-AWARE HERO HUD (not a big widget): streak count + next-reward
 *    panel (large image, 2-line name, "N more check-ins") + CTA only when
 *    the engine says a check-in is possible. Zero streak = "start your
 *    streak" framing with the FIRST reward and a pilot-flame ember on the
 *    road (visual only — real counts stay honest at 0).
 *  - REPLAY on entry (camera follows the climb, milestones pulse once);
 *    LIVE ADVANCE: a check-in that lands while the page is open animates
 *    the flame forward from its old position (the "ignition" moment).
 *  - Everything data-driven: unit words from period_type, milestones from
 *    config, proportional layout over the program range. prefers-reduced-
 *    motion renders final state instantly.
 *
 * ENGINE UNTOUCHED: get_streak_status RPC + check_in_events realtime;
 * gift_kind stays authoritative (CP-49).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Flame, Gift, Trophy, Lock, Check, CalendarDays, QrCode, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveStreakTheme, type StreakTheme } from "@/lib/streak-themes";
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

function rewardTitle(m: Milestone): string {
  return isReward(m) ? (m.reward_name ?? m.label) : `${(m.points ?? 0).toLocaleString()} bonus points`;
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
      <Shell>
        <div className="px-4 pt-10 pb-4 flex justify-center">
          <div className="bg-white rounded-2xl px-6 py-4 text-sm text-zinc-600 shadow-sm border">Loading your streak…</div>
        </div>
      </Shell>
    );
  }

  if (!membershipId || !s || !s.is_enabled) {
    return (
      <Shell>
        <div className="px-4 pt-8 pb-4">
          <div className="rounded-3xl bg-white border shadow-sm p-8 text-center">
            <Flame className="h-10 w-10 mx-auto text-zinc-300" />
            <div className="mt-3 text-base font-bold text-zinc-800">No streak here yet</div>
            <p className="mt-1 text-sm text-zinc-500">
              {business.name} hasn&apos;t turned on check-in streaks. Check back soon!
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const current = s.current_streak ?? 0;
  const zero = current <= 0;
  const longest = Math.max(s.longest_streak ?? 0, current);
  const atPersonalBest = current > 0 && current >= (s.longest_streak ?? 0);
  // Data-driven unit terminology — never hardcode "week"/"day".
  const unit =
    s.period_type === "weekly" ? "week" :
    s.period_type === "monthly" ? "month" : "day";

  const nextMilestone = milestones.find(m => m.count > current) ?? null;
  const remaining = nextMilestone ? nextMilestone.count - current : null;

  // Real eligibility from the engine — never assume daily.
  const canCheckIn = !s.checked_in_this_period;
  const periodEndMs = s.period_end ? new Date(s.period_end).getTime() : null;
  const msLeft = periodEndMs ? periodEndMs - now : null;
  const urgent = canCheckIn && msLeft !== null && msLeft < 12 * 3600_000 && current > 0;

  return (
    <Shell>
      {/* ═══════════ HERO HUD (state-aware, flows into the road) ═══════════ */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3.5">
          {/* flame emblem — ember at zero, burning once the streak lives */}
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-black/5 shadow-md"
            style={zero
              ? { background: "linear-gradient(160deg, #f1f5f9, #e2e8f0)" }
              : { background: `linear-gradient(135deg, ${theme.cell[0]} 0%, ${theme.cell[1]} 55%, ${theme.cell[2]} 100%)`, boxShadow: `0 8px 22px -8px ${theme.glow}` }}
          >
            <Flame className={zero ? "h-7 w-7 text-amber-500/80" : "h-8 w-8 text-white drop-shadow"} />
          </div>

          <div className="min-w-0 flex-1">
            {zero ? (
              <>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Start your streak</div>
                <div className="flex items-end gap-1.5 mt-0.5">
                  <span className="text-4xl font-black leading-none tabular-nums text-slate-900">0</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] font-extrabold text-slate-500 mb-0.5">check-ins</span>
                </div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">One check-in lights the flame.</div>
              </>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black leading-none tabular-nums text-slate-900">{current}</span>
                  <span className="text-[11px] uppercase tracking-[0.16em] font-extrabold text-slate-500 mb-1">
                    {unit} streak
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                  <Trophy className="h-3.5 w-3.5 text-amber-500" />
                  {atPersonalBest
                    ? <span className="text-amber-600">Personal best — keep it alive.</span>
                    : <span className="text-slate-500">Best: {longest} {unit}{longest === 1 ? "" : "s"}</span>}
                </div>
              </>
            )}
          </div>

          {/* eligibility chip — engine-driven, never a dead button */}
          <div className="shrink-0">
            {!canCheckIn ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                <Check className="h-3 w-3" /> Checked in
              </span>
            ) : msLeft !== null && current > 0 ? (
              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full ${
                urgent ? "bg-red-500 text-white animate-pulse" : "bg-white text-slate-700 ring-1 ring-black/10 shadow-sm"
              }`}>
                <CalendarDays className="h-3 w-3" /> {timeLeftLabel(msLeft)} left
              </span>
            ) : null}
          </div>
        </div>

        {/* keep-alive line */}
        {canCheckIn && msLeft !== null && current > 0 && (
          <div className="mt-2 text-[11px] font-bold text-slate-600">
            {urgent ? "Your streak is about to reset — " : "Keep your streak alive — "}
            check in within <span className="tabular-nums text-slate-900">{timeLeftLabel(msLeft)}</span>.
          </div>
        )}

        {/* NEXT REWARD — tangible: big image, readable name, plain distance */}
        {nextMilestone ? (
          <div className="mt-3 rounded-2xl bg-white/90 backdrop-blur border border-black/5 shadow-sm p-3 flex items-center gap-3">
            <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center ring-1 ring-black/5">
              {isReward(nextMilestone) && nextMilestone.reward_image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={nextMilestone.reward_image_url} alt={rewardTitle(nextMilestone)} className="h-full w-full object-cover" />
              ) : !isReward(nextMilestone) && business.logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={business.logo_url} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <Gift className="h-7 w-7 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-600">
                {zero ? "First reward" : "Next reward"}
              </div>
              <div className="text-[15px] font-black text-slate-900 leading-tight line-clamp-2 mt-0.5">
                {rewardTitle(nextMilestone)}
              </div>
              <div className={`mt-1 text-[11px] font-extrabold ${remaining === 1 ? "text-amber-600" : "text-slate-500"}`}>
                {remaining === 1 ? "One check-in away!" : `${remaining} more check-ins`}
              </div>
            </div>
          </div>
        ) : milestones.length > 0 ? (
          <div className="mt-3 rounded-2xl bg-white/90 backdrop-blur border border-black/5 shadow-sm p-3 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)" }}>
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <div className="text-sm font-bold text-slate-800">
              You&apos;ve earned every reward on the road — keep the flame alive.
            </div>
          </div>
        ) : null}

        {/* CTA — only when the engine allows a check-in */}
        {canCheckIn && (
          <>
            <a
              href={`/${business.slug}/app/scan`}
              className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
              style={{
                background: `linear-gradient(135deg, ${theme.cell[1]} 0%, ${theme.cell[2]} 100%)`,
                boxShadow: `0 10px 24px -8px ${theme.glow}`,
              }}
            >
              <QrCode className="h-4 w-4" /> Check in now
            </a>
            {/* small energy drip connecting the CTA to the road below */}
            <div className="mx-auto mt-1 h-5 w-1 rounded-full"
              style={{ background: `linear-gradient(180deg, ${theme.cell[1]}66, transparent)` }} />
          </>
        )}
      </div>

      {/* ═══════════ THE REWARD ROAD ═══════════ */}
      {milestones.length > 0 ? (
        <RewardRoad
          milestones={milestones}
          current={current}
          claimed={s.claimed_milestones ?? []}
          nextCount={nextMilestone?.count ?? null}
          theme={theme}
          logoUrl={business.logo_url}
          unit={unit}
        />
      ) : (
        // Program not configured — a true empty state (never fake rewards).
        <div className="px-4 mt-5 pb-2">
          <div className="rounded-3xl bg-white border shadow-sm p-8 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-zinc-300" />
            <div className="mt-3 text-sm font-bold text-zinc-800">Your reward road is being built</div>
            <p className="mt-1 text-xs text-zinc-500">
              Keep checking in — {business.name} is adding streak rewards soon, and your streak already counts.
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Shell — the streak page's OWN background, scoped here only (never the
   global app surface): soft neutral depth gradient + faint center light
   + gentle vignette, so the road reads identically on any client theme.
   marginBottom cancels the app shell's nav-clearance padding (CP-55.1
   trick) so the neutral surface runs behind the bottom nav cleanly.
   Top-level component (STABLE identity — defining it inside the client
   component would remount the road, and its animation refs, on every
   state tick).
   ════════════════════════════════════════════════════════════════════ */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative"
      style={{
        background: "linear-gradient(180deg, #f8fafc 0%, #eef1f6 45%, #e9edf3 100%)",
        paddingBottom: "7rem",
        marginBottom: "-5rem",
      }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(120% 55% at 50% 20%, rgba(255,255,255,0.85), transparent 70%)" }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(130% 90% at 50% 55%, transparent 62%, rgba(15,23,42,0.05) 100%)" }} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RewardRoad — layered central track + branching milestone cards.
   ════════════════════════════════════════════════════════════════════ */

const PAD_TOP = 56;
const PAD_BOTTOM = 88;
const MIN_GAP = 118;
/** Pilot-flame height (px) shown at zero streak — VISUAL ONLY, never
 *  affects real progression, unlocking, or counts. */
const STARTER_PX = 20;

function RewardRoad({
  milestones, current, claimed, nextCount, theme, logoUrl, unit,
}: {
  milestones: Milestone[];
  current: number;
  claimed: number[];
  nextCount: number | null;
  theme: StreakTheme;
  logoUrl: string | null;
  unit: string;
}) {
  const range = Math.max(milestones.at(-1)?.count ?? 1, current, 1);
  const targetFrac = Math.min(1, current / range);
  const nextFrac = nextCount ? Math.min(1, nextCount / range) : null;

  const height = Math.max(460, milestones.length * (MIN_GAP + 28) + PAD_TOP + PAD_BOTTOM);
  const trackLen = height - PAD_TOP - PAD_BOTTOM;
  const rawY = (count: number) => PAD_TOP + (1 - count / range) * trackLen;
  const ys: number[] = milestones.map(m => rawY(m.count));
  if (ys.length > 0) {
    ys[0] = Math.min(ys[0], height - PAD_BOTTOM - 16);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i], ys[i - 1] - MIN_GAP);
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const fracRef = useRef(0);           // currently displayed fill fraction
  const playedRef = useRef(false);
  const [displayFrac, setDisplayFrac] = useState(0); // React-owned once idle
  const [crossed, setCrossed] = useState<Set<number>>(() => new Set());
  const crossedRef = useRef<Set<number>>(new Set());
  const [settled, setSettled] = useState(false);

  const reducedMotion = () =>
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /** Animate the fill from → to (fractions of the track). The rAF loop owns
   *  the DOM during flight; on completion React takes back over via
   *  displayFrac so later re-renders can never collapse the fill. */
  const runAnim = (from: number, to: number, T: number, camera: boolean) => {
    cancelAnimationFrame(rafRef.current);
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const start = performance.now();
    const step = (nowTs: number) => {
      const k = Math.min(1, (nowTs - start) / T);
      const prog = from + ease(k) * (to - from);
      fracRef.current = prog;
      if (fillRef.current) fillRef.current.style.height = `${Math.max(prog * trackLen, current > 0 ? 0 : STARTER_PX)}px`;
      if (headRef.current) headRef.current.style.bottom = `${prog * trackLen}px`;

      // Milestone crossings — each pulses exactly once per animation pass.
      const reachedCount = prog * range;
      let newly = false;
      for (const m of milestones) {
        if (m.count <= reachedCount + 1e-6 && m.count <= current && !crossedRef.current.has(m.count)) {
          crossedRef.current.add(m.count); newly = true;
        }
      }
      if (newly) setCrossed(new Set(crossedRef.current));

      if (camera && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const headViewportY = rect.top + PAD_TOP + (1 - prog) * (rect.height - PAD_TOP - PAD_BOTTOM);
        window.scrollTo({ top: Math.max(0, window.scrollY + headViewportY - window.innerHeight * 0.55) });
      }

      if (k < 1) { rafRef.current = requestAnimationFrame(step); }
      else {
        fracRef.current = to;
        setDisplayFrac(to);
        setSettled(true);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // ── ENTRY REPLAY: burn from START to current position, once per mount. ──
  useEffect(() => {
    if (playedRef.current) return;
    playedRef.current = true;
    if (reducedMotion() || current <= 0) {
      fracRef.current = targetFrac;
      crossedRef.current = new Set(milestones.filter(m => m.count <= current).map(m => m.count));
      setCrossed(new Set(crossedRef.current));
      setDisplayFrac(targetFrac);
      setSettled(true);
      return;
    }
    const T = Math.min(4500, Math.max(1500, 1200 + targetFrac * 3300));
    const kick = window.setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top + rect.height - PAD_BOTTOM - window.innerHeight * 0.6) });
      }
      runAnim(0, targetFrac, T, true);
    }, 350);
    return () => { window.clearTimeout(kick); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── LIVE ADVANCE: a check-in landing while the page is open ignites the
  // flame forward from where it was (no camera jump, short + satisfying). ──
  useEffect(() => {
    if (!settled) return;
    if (Math.abs(targetFrac - fracRef.current) < 1e-6) return;
    if (reducedMotion()) {
      fracRef.current = targetFrac;
      crossedRef.current = new Set(milestones.filter(m => m.count <= current).map(m => m.count));
      setCrossed(new Set(crossedRef.current));
      setDisplayFrac(targetFrac);
      return;
    }
    runAnim(fracRef.current, targetFrac, 950, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFrac, settled]);

  // Flame head grows with the streak: ember → lit → blazing.
  const ratio = current / range;
  const headSize = current <= 0 ? 0 : ratio < 0.34 ? 40 : 48;
  const headGlow = ratio < 0.34 ? `0 0 16px 3px ${theme.glow}` : `0 0 24px 6px ${theme.glow}`;

  const fillGradient = `linear-gradient(to top, ${theme.cell[2]} 0%, ${theme.cell[1]} 55%, ${theme.cell[0]} 100%)`;
  const fillPx = Math.max(displayFrac * trackLen, current > 0 ? 0 : STARTER_PX);
  // Warm halo hovering around the active head (or the pilot flame at zero).
  const haloBottom = PAD_BOTTOM + (current > 0 ? displayFrac * trackLen : STARTER_PX) - 110;

  return (
    <div className="px-3 mt-4">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="text-sm font-bold text-slate-800">Your reward road</h2>
        <span className="text-[10px] font-extrabold text-slate-500">
          Check in every {unit} to climb
        </span>
      </div>

      <div ref={containerRef} className="relative" style={{ height }}>
        {/* warm ambient light around the active part of the road */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            bottom: haloBottom, width: 240, height: 220,
            background: `radial-gradient(closest-side, ${theme.glow.replace(/, [\d.]+\)$/, ", 0.13)")}, transparent)`,
          }}
        />

        {/* ── CENTRAL TRACK: casing → channel → fill → head ── */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-5 rounded-full bg-white ring-1 ring-black/10"
          style={{ top: PAD_TOP, bottom: PAD_BOTTOM, boxShadow: "0 1px 3px rgba(15,23,42,0.08), inset 0 1px 2px rgba(15,23,42,0.05)" }}
        >
          {/* inner channel — the whole journey stays clearly visible */}
          <div className="absolute rounded-full bg-slate-200"
            style={{ left: 3, right: 3, top: 3, bottom: 3, boxShadow: "inset 0 1px 2px rgba(15,23,42,0.12)" }}>
            {/* faint warm tint on the stretch between me and my next reward */}
            {nextFrac !== null && (
              <div className="absolute left-0 right-0 rounded-full"
                style={{
                  bottom: `${displayFrac * 100}%`,
                  height: `${Math.max(0, (nextFrac - displayFrac) * 100)}%`,
                  background: "linear-gradient(to top, rgba(251,191,36,0.35), rgba(251,191,36,0.10))",
                }} />
            )}
            {/* burning fill — rAF drives it in flight, React owns it at rest */}
            <div
              ref={fillRef}
              className="absolute bottom-0 left-0 right-0 rounded-full"
              style={{ height: `${fillPx}px`, background: fillGradient, boxShadow: `0 0 12px 1px ${theme.glow}` }}
            />
          </div>

          {/* flame head — the hottest point on the page (grows with streak) */}
          {current > 0 ? (
            <div ref={headRef} className="absolute left-1/2 z-20"
              style={{ bottom: `${displayFrac * trackLen}px`, transform: "translate(-50%, 50%)" }}>
              <div
                className="atlas-flame-head rounded-full flex items-center justify-center ring-4 ring-white"
                style={{
                  height: headSize, width: headSize,
                  background: `linear-gradient(135deg, ${theme.cell[0]} 0%, ${theme.cell[1]} 55%, ${theme.cell[2]} 100%)`,
                  boxShadow: `${headGlow}, 0 6px 16px -4px rgba(0,0,0,0.3)`,
                }}
              >
                <Flame className={`${headSize >= 48 ? "h-6 w-6" : "h-5 w-5"} text-white drop-shadow`} />
              </div>
            </div>
          ) : (
            /* pilot flame at zero — a small spark waiting to be lit (visual
               only; the streak truthfully reads 0 everywhere) */
            <div className="absolute left-1/2 z-20" style={{ bottom: STARTER_PX, transform: "translate(-50%, 50%)" }}>
              <div className="atlas-flame-head h-8 w-8 rounded-full flex items-center justify-center ring-4 ring-white"
                style={{
                  background: `linear-gradient(135deg, ${theme.cell[0]}, ${theme.cell[1]})`,
                  boxShadow: `0 0 12px 2px ${theme.glow}`,
                }}>
                <Flame className="h-4 w-4 text-white drop-shadow" />
              </div>
            </div>
          )}
        </div>

        {/* ── MILESTONES branching off the track ── */}
        {milestones.map((m, i) => {
          const y = ys[i];
          const left = i % 2 === 0;
          const unlocked = m.count <= current;
          const isClaimed = claimed.includes(m.count);
          const isNext = nextCount === m.count;
          const pulsing = crossed.has(m.count);
          const rewardGift = isReward(m);
          const pointsGift = !rewardGift && (m.points ?? 0) > 0;
          const away = m.count - current;

          return (
            <div key={m.count} className="absolute inset-x-0" style={{ top: y }}>
              {/* node — three distinct states: earned / next target / future */}
              <div
                className={`absolute left-1/2 z-10 ${pulsing ? "atlas-node-pop" : ""}`}
                style={{ transform: "translate(-50%, -50%)" }}
              >
                {unlocked ? (
                  <div className="h-6 w-6 rounded-full ring-4 ring-white flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)", boxShadow: "0 0 12px 2px rgba(245,158,11,0.6)" }}>
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : isNext ? (
                  <div className="h-7 w-7 rounded-full bg-white ring-4 ring-white flex items-center justify-center"
                    style={{ boxShadow: "0 0 0 2px #f59e0b, 0 0 14px 3px rgba(245,158,11,0.45)" }}>
                    <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#f59e0b" }} />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full bg-slate-100 ring-4 ring-white flex items-center justify-center"
                    style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.15)" }}>
                    <Lock className="h-2.5 w-2.5 text-slate-400" />
                  </div>
                )}
              </div>

              {/* connector */}
              <div
                className="absolute top-0 h-0.5 -translate-y-1/2"
                style={{
                  [left ? "right" : "left"]: "50%",
                  [left ? "marginRight" : "marginLeft"]: "1.1rem",
                  width: "1rem",
                  background: unlocked || isNext ? "linear-gradient(90deg, #facc15, #f59e0b)" : "rgba(15,23,42,0.12)",
                } as React.CSSProperties}
              />

              {/* compact reward card — image + name first, milestone last */}
              <div
                className={`absolute -translate-y-1/2 ${left ? "left-0" : "right-0"} ${pulsing ? "atlas-card-flash" : ""}`}
                style={{ top: 0, width: "calc(50% - 2.2rem)" }}
              >
                <div
                  className={`rounded-2xl border bg-white shadow-sm ring-1 ring-black/5 p-2.5 ${
                    !unlocked && !isNext ? "opacity-70" : ""
                  }`}
                  style={
                    isNext
                      ? { borderColor: "rgba(245,158,11,0.6)", boxShadow: "0 0 0 2px rgba(245,158,11,0.35), 0 10px 22px -12px rgba(245,158,11,0.5)" }
                      : unlocked
                        ? { borderColor: "rgba(245,158,11,0.45)" }
                        : undefined
                  }
                >
                  {isNext && (
                    <div className="text-[8px] font-black tracking-[0.16em] uppercase mb-1 text-amber-600">
                      Next reward
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <div className="h-12 w-12 rounded-xl overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center ring-1 ring-black/5">
                      {rewardGift && m.reward_image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={m.reward_image_url} alt="" className="h-full w-full object-cover"
                          style={{ opacity: unlocked || isNext ? 1 : 0.65, filter: unlocked || isNext ? undefined : "saturate(0.55)" }} />
                      ) : pointsGift && logoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
                      ) : (
                        <Gift className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* two-line wrap instead of ugly truncation */}
                      <div className="text-[12px] font-bold text-slate-900 leading-tight line-clamp-2">
                        {rewardTitle(m)}
                      </div>
                      <div className="mt-1">
                        {isClaimed ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            <Trophy className="h-2.5 w-2.5" /> Claimed
                          </span>
                        ) : unlocked ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            <Check className="h-2.5 w-2.5" /> Unlocked
                          </span>
                        ) : (
                          <span className={`text-[10px] font-extrabold ${away === 1 ? "text-amber-600" : isNext ? "text-slate-600" : "text-slate-400"}`}>
                            {away === 1 ? "One check-in away!" : `${away} more check-ins`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* milestone label — how it's earned, quietly last */}
                  <div className="mt-1 text-[8px] font-black tracking-wider uppercase text-slate-400">
                    {m.count} {unit}{m.count === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* finish glow when everything is earned */}
        {settled && current >= range && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: PAD_TOP - 48 }}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)", boxShadow: "0 0 18px 4px rgba(245,158,11,0.6)" }}>
              <Trophy className="h-5 w-5 text-white drop-shadow" />
            </div>
            <span className="mt-1 text-[9px] font-black tracking-widest uppercase text-amber-600">Complete</span>
          </div>
        )}

        {/* START marker at the base of the climb */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ bottom: PAD_BOTTOM - 64 }}>
          <div className="h-8 w-8 rounded-full bg-white ring-1 ring-black/10 shadow-sm flex items-center justify-center">
            <Flame className="h-4 w-4" style={{ color: theme.to }} />
          </div>
          <span className="mt-1 text-[9px] font-black tracking-[0.2em] uppercase text-slate-400">Start</span>
        </div>
      </div>

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
