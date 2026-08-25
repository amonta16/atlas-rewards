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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Flame, Gift, Trophy, Lock, Check, CalendarDays, QrCode, Sparkles, ChevronUp, Star, Crown, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resolveStreakTheme, type StreakTheme } from "@/lib/streak-themes";
import {
  resolveStreakPage, resolveProgressTheme, shadeHex as shade, alphaHex as alpha,
  streakTopBand, STREAK_TOP_BAND_H,
  type ResolvedStreakPage, type StreakDecor,
} from "@/lib/streak-page-themes";
import Link from "next/link";
import { useAppBase } from "@/lib/use-app-base";
import { readableTextColor } from "@/lib/patterns";
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
  // Display-only: points rewards read "150 pts" — the number is the prize.
  return isReward(m) ? (m.reward_name ?? m.label) : `${(m.points ?? 0).toLocaleString()} pts`;
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

  // CP-99 simplified visual system: ONE page-theme choice (curated library,
  // app-background option, legacy fields as fallback) + ONE progress choice
  // (default / brand / custom hex, luminance-clamped).
  //
  // CP-103: the PROGRESS color now drives this entire page — hero emblem,
  // CTA, the road, unlocked rewards, the corridor glow and the top band.
  // (streak_theme still themes the Home teaser / header chip / trail; it is
  // just no longer a second, competing palette on the streaks page itself.)
  // CP-106: base-aware in-app href (path form vs subdomain/PWA).
  const appBase = useAppBase(business.slug);
  const baseTheme = resolveStreakTheme(business.streak_theme, business.brand_colors?.primary);
  const theme = resolveProgressTheme(business.streak_progress_mode, business.brand_colors?.primary, baseTheme);
  const page = resolveStreakPage(business);
  const env = page.env;
  const roadTheme = theme;
  // CP-103: a solid brand band covers the TOP of the page (behind the hero
  // only — it fades out well above the road, so the roadmap keeps its calm
  // ground). Hero text contrast follows the BAND, not the environment.
  const topBand = streakTopBand(theme);
  // Hero text sits on the BAND; road text sits on the ENVIRONMENT. Two
  // different surfaces, so two different contrast flags.
  const heroLight = readableTextColor(shade(theme.cell[2], 0.12)) === "#18181b";
  const lightEnv = !!env.light;

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
      <Shell page={page} topBand={topBand}>
        <div className="px-4 pt-10 pb-4 flex justify-center">
          <div className="bg-white rounded-2xl px-6 py-4 text-sm text-zinc-600 shadow-sm border">Loading your streak…</div>
        </div>
      </Shell>
    );
  }

  if (!membershipId || !s || !s.is_enabled) {
    return (
      <Shell page={page} topBand={topBand}>
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

  // ── TIMING, derived from the ENGINE's real period window (never a
  // frontend-invented cadence). Two different clocks:
  //  · next QUALIFYING check-in: already credited this period → the next
  //    one that counts opens when the next period starts (period_end).
  //  · streak EXPIRATION: not yet checked in → the streak dies at the end
  //    of THIS period; already checked in → safe through the NEXT period
  //    (period_end + one period length).
  const canCheckIn = !s.checked_in_this_period;
  const periodEndMs = s.period_end ? new Date(s.period_end).getTime() : null;
  const periodStartMs = s.period_start ? new Date(s.period_start).getTime() : null;
  const periodLenMs = periodEndMs && periodStartMs ? periodEndMs - periodStartMs : null;
  const nextEligibleMs = canCheckIn ? 0 : periodEndMs ? Math.max(0, periodEndMs - now) : null;
  const expiresMs =
    current > 0 && periodEndMs
      ? s.checked_in_this_period && periodLenMs
        ? Math.max(0, periodEndMs + periodLenMs - now)
        : Math.max(0, periodEndMs - now)
      : null;
  const expiryTone: "calm" | "warm" | "risk" =
    expiresMs === null ? "calm" : expiresMs < 12 * 3600_000 ? "risk" : expiresMs < 24 * 3600_000 ? "warm" : "calm";

  return (
    <Shell page={page} topBand={topBand}>
      {/* ═══════════ HERO HUD (state-aware, flows into the road) ═══════════ */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3.5">
          {/* flame emblem — ember at zero, burning once the streak lives */}
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-white/20 shadow-md"
            style={zero
              ? { background: "linear-gradient(160deg, #f1f5f9, #e2e8f0)" }
              : { background: `linear-gradient(135deg, ${theme.cell[0]} 0%, ${theme.cell[1]} 55%, ${theme.cell[2]} 100%)`, boxShadow: `0 8px 22px -8px ${theme.glow}` }}
          >
            <Flame className={zero ? "h-7 w-7 text-amber-500/80" : "h-8 w-8 text-white drop-shadow"} />
          </div>

          <div className="min-w-0 flex-1">
            {zero ? (
              <>
                <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${heroLight ? "text-amber-600" : "text-amber-300"}`}>Start your streak</div>
                <div className="flex items-end gap-1.5 mt-0.5">
                  <span className={`text-4xl font-black leading-none tabular-nums ${heroLight ? "text-slate-900" : "text-white"}`}>0</span>
                  <span className={`text-[11px] uppercase tracking-[0.14em] font-extrabold mb-0.5 ${heroLight ? "text-slate-500" : "text-white/60"}`}>check-ins</span>
                </div>
                <div className={`text-[11px] font-bold mt-1 ${heroLight ? "text-slate-500" : "text-white/60"}`}>One check-in lights the flame.</div>
              </>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <span className={`text-5xl font-black leading-none tabular-nums ${heroLight ? "text-slate-900" : "text-white"}`}>{current}</span>
                  <span className={`text-[11px] uppercase tracking-[0.16em] font-extrabold mb-1 ${heroLight ? "text-slate-500" : "text-white/60"}`}>
                    {unit} streak
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold">
                  <Trophy className={`h-3.5 w-3.5 ${heroLight ? "text-amber-500" : "text-amber-300"}`} />
                  {atPersonalBest
                    ? <span className={heroLight ? "text-amber-600" : "text-amber-300"}>Personal best — keep it alive.</span>
                    : <span className={heroLight ? "text-slate-500" : "text-white/60"}>Best: {longest} {unit}{longest === 1 ? "" : "s"}</span>}
                </div>
              </>
            )}
          </div>

          {/* eligibility chip — engine-driven, never a dead button */}
          <div className="shrink-0">
            {!canCheckIn && (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                <Check className="h-3 w-3" /> Checked in
              </span>
            )}
          </div>
        </div>

        {/* NEXT REWARD — the prize preview + both timers in one composition:
            what do I get, when can I move, when must I act. */}
        {nextMilestone ? (
          <div className="mt-3 rounded-2xl bg-white/95 backdrop-blur border border-black/5 shadow-sm p-3">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-600">
              {zero ? "First reward" : "Next reward"}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-24 w-24 rounded-xl overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center ring-1 ring-black/5">
                {isReward(nextMilestone) && nextMilestone.reward_image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={nextMilestone.reward_image_url} alt={rewardTitle(nextMilestone)} className="h-full w-full object-contain" />
                ) : !isReward(nextMilestone) && business.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={business.logo_url} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <Gift className="h-8 w-8 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-black text-slate-900 leading-tight line-clamp-2">
                  {rewardTitle(nextMilestone)}
                </div>
                <div className={`mt-1 text-[11px] font-extrabold ${remaining === 1 ? "text-amber-600" : "text-slate-500"}`}>
                  {remaining === 1 ? "One check-in away!" : `${remaining} more check-ins`}
                </div>
              </div>
              {/* timers — secondary, right column; two DIFFERENT clocks */}
              <div className="shrink-0 text-right space-y-2 pl-2.5 border-l border-black/10">
                <div>
                  <div className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">Next check-in</div>
                  <div className="text-[12px] font-extrabold text-slate-700 tabular-nums mt-0.5">
                    {canCheckIn ? "Now" : nextEligibleMs !== null ? timeLeftLabel(nextEligibleMs) : "—"}
                  </div>
                </div>
                {expiresMs !== null && (
                  <div>
                    <div className={`flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-[0.1em] ${
                      expiryTone === "risk" ? "text-red-600" : expiryTone === "warm" ? "text-amber-600" : "text-slate-400"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full bg-red-500 ${expiryTone === "risk" ? "animate-pulse" : ""}`} />
                      Streak expires
                    </div>
                    <div className={`text-[12px] font-extrabold tabular-nums mt-0.5 ${
                      expiryTone === "risk" ? "text-red-600" : expiryTone === "warm" ? "text-amber-600" : "text-slate-700"
                    }`}>{timeLeftLabel(expiresMs)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : milestones.length > 0 ? (
          <div className="mt-3 rounded-2xl bg-white/95 backdrop-blur border border-black/5 shadow-sm p-3 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)" }}>
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1 text-sm font-bold text-slate-800">
              You&apos;ve earned every reward on the road — keep the flame alive.
            </div>
            {expiresMs !== null && (
              <div className="shrink-0 text-right">
                <div className={`flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-[0.1em] ${
                  expiryTone === "risk" ? "text-red-600" : expiryTone === "warm" ? "text-amber-600" : "text-slate-400"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full bg-red-500 ${expiryTone === "risk" ? "animate-pulse" : ""}`} />
                  Streak expires
                </div>
                <div className="text-[12px] font-extrabold text-slate-700 tabular-nums mt-0.5">{timeLeftLabel(expiresMs)}</div>
              </div>
            )}
          </div>
        ) : null}

        {/* CTA — only when the engine allows a check-in */}
        {canCheckIn && (
          <>
            <Link
              href={`${appBase}/scan`}
              className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
              style={{
                background: `linear-gradient(135deg, ${theme.cell[1]} 0%, ${theme.cell[2]} 100%)`,
                boxShadow: `0 10px 24px -8px ${theme.glow}`,
              }}
            >
              <QrCode className="h-4 w-4" /> Check in now
            </Link>
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
          theme={roadTheme}
          logoUrl={business.logo_url}
          unit={unit}
          slug={business.slug}
          canCheckIn={canCheckIn}
          nextEligibleMs={nextEligibleMs}
          light={lightEnv}
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
// Mask that clears the pattern out of the protected center corridor — the
// route always gets a clean vertical lane no matter which pattern is picked.
const CORRIDOR_MASK =
  "linear-gradient(to right, black 0%, black calc(50% - 5.7rem), transparent calc(50% - 5.1rem), transparent calc(50% + 5.1rem), black calc(50% + 5.7rem), black 100%)";

const DECOR_ICONS = {
  flame: Flame, star: Star, sparkle: Sparkles, trophy: Trophy, crown: Crown, zap: Zap,
} as const;

function Shell({ page, topBand, children }: { page: ResolvedStreakPage; topBand?: string; children: React.ReactNode }) {
  const { env, pattern, decor, appBg } = page;
  return (
    <div
      className="relative"
      style={{
        // "Use app theme" paints the business's own configured background;
        // otherwise the picked streak environment. Bottom padding clears the
        // fixed nav + device safe area so START never crowds the tab bar.
        ...(appBg ?? { background: `linear-gradient(180deg, ${env.top} 0%, ${env.mid} 45%, ${env.edge} 100%)` }),
        // CP-103: nav grew, so both numbers grew with it (clearance 8.5→9.5rem,
        // and the cancel must match app-shell's pb-24 = 6rem).
        paddingBottom: "calc(9.5rem + env(safe-area-inset-bottom, 0px))",
        marginBottom: "-6rem",
      }}
    >
      {/* pattern + decor art live in the ENVIRONMENT only — both are masked
          out of the protected center corridor, so however loud a theme is,
          the road / rewards / labels always sit on calm ground. */}
      {pattern && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ ...pattern, maskImage: CORRIDOR_MASK, WebkitMaskImage: CORRIDOR_MASK }} />
      )}
      {decor && decor.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ maskImage: CORRIDOR_MASK, WebkitMaskImage: CORRIDOR_MASK }}>
          {decor.map((d, i) => {
            if (d.kind === "icon") {
              const I = DECOR_ICONS[d.icon as keyof typeof DECOR_ICONS];
              return (
                <I key={i} className="absolute"
                  style={{ top: d.t, left: d.l, width: d.s, height: d.s, color: d.color, opacity: d.o, transform: d.rot ? `rotate(${d.rot}deg)` : undefined }} />
              );
            }
            if (d.kind === "circle") {
              return (
                <span key={i} className="absolute rounded-full"
                  style={{ top: d.t, left: d.l, width: d.s, height: d.s, background: d.color, opacity: d.o, filter: d.blur ? `blur(${d.blur}px)` : undefined }} />
              );
            }
            if (d.kind === "confetti") {
              return (
                <span key={i} className="absolute rounded-[2px]"
                  style={{ top: d.t, left: d.l, width: d.w, height: d.h, background: d.color, opacity: d.o, transform: `rotate(${d.rot}deg)` }} />
              );
            }
            // balloon: soft oval + a short string
            return (
              <span key={i} className="absolute flex flex-col items-center" style={{ top: d.t, left: d.l, opacity: d.o }}>
                <span className="rounded-full" style={{ width: d.s, height: d.s * 1.18, background: d.color, boxShadow: "inset -4px -6px 10px rgba(0,0,0,0.15), inset 4px 5px 8px rgba(255,255,255,0.35)" }} />
                <span style={{ width: 1, height: d.s * 0.7, background: "rgba(255,255,255,0.4)" }} />
              </span>
            );
          })}
        </div>
      )}
      {/* faint center illumination + edge vignette — skipped for the app-
          background option (keep the brand surface pure). */}
      {!appBg && (
        <>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(120% 55% at 50% 18%, rgba(255,255,255,${env.light ? 0.4 : 0.07}), transparent 70%)` }} />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(130% 90% at 50% 55%, transparent 58%, ${env.light ? "rgba(15,23,42,0.10)" : "rgba(0,0,0,0.28)"} 100%)` }} />
        </>
      )}
      {/* CP-103: TOP BAND — sits above the environment art but under all
          content, and stops well short of the road. */}
      {topBand && (
        <div className="absolute inset-x-0 top-0 pointer-events-none"
          style={{ height: STREAK_TOP_BAND_H, background: topBand }} />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RewardRoad — layered central track + branching milestone cards.
   ════════════════════════════════════════════════════════════════════ */

// Top breathing room: the highest reward card (banner image + body) is
// vertically centered on its node — reserve enough headroom that it can
// never crowd the hero/status area above the road.
const PAD_TOP = 150;
// Room below the track for START + its own small check-in CTA (the Shell
// adds nav-height + safe-area padding beneath this).
const PAD_BOTTOM = 152;
/** Deterministic spark field inside the corridor (SSR-safe, no random) —
 *  denser and brighter toward the summit. Percent tops / lefts. */
const CORRIDOR_SPARKS = [
  { t: "3%",  l: "26%", s: 4,   o: 0.55 },
  { t: "6%",  l: "66%", s: 3,   o: 0.45 },
  { t: "10%", l: "44%", s: 2.5, o: 0.4 },
  { t: "16%", l: "70%", s: 2.5, o: 0.32 },
  { t: "22%", l: "30%", s: 2,   o: 0.28 },
  { t: "30%", l: "60%", s: 2,   o: 0.22 },
  { t: "42%", l: "38%", s: 1.5, o: 0.16 },
  { t: "56%", l: "64%", s: 1.5, o: 0.12 },
];
const MIN_GAP = 170;
/** useLayoutEffect on the client, useEffect during SSR (no hydration warning).
 *  Chosen once per environment, so hook order is always stable. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
/** Pilot-flame height (px) shown at zero streak — VISUAL ONLY, never
 *  affects real progression, unlocking, or counts. */
const STARTER_PX = 20;

function RewardRoad({
  milestones, current, claimed, nextCount, theme, logoUrl, unit, slug, canCheckIn, nextEligibleMs, light,
}: {
  milestones: Milestone[];
  current: number;
  claimed: number[];
  nextCount: number | null;
  theme: StreakTheme;
  logoUrl: string | null;
  unit: string;
  /** For the secondary check-in CTA under START (same behavior as the hero CTA). */
  slug: string;
  canCheckIn: boolean;
  /** ms until the next QUALIFYING check-in (engine period math); null = n/a. */
  nextEligibleMs: number | null;
  /** Light environment → on-environment text flips to deep slate. */
  light: boolean;
}) {
  // CP-103: every "earned"/"glow" accent on the road is derived from the
  // PROGRESS color — no more hard-coded green unlocks or amber fence.
  const cLight = theme.cell[0], cMid = theme.cell[1], cDeep = theme.cell[2];
  const earnedNodeBg = `linear-gradient(135deg, ${cMid}, ${cDeep})`;
  const earnedCardBg = `linear-gradient(160deg, ${shade(cMid, 0.04)} 0%, ${cDeep} 55%, ${shade(cDeep, 0.28)} 100%)`;
  const earnedConnector = `linear-gradient(90deg, ${cMid}, ${cDeep})`;
  /** Ink for the white completion seal + point-gift icon on earned cards. */
  const earnedInk = shade(cDeep, 0.22);

  // CP-106: base-aware in-app href (RewardRoad is its own component).
  const appBase = useAppBase(slug);

  const range = Math.max(milestones.at(-1)?.count ?? 1, current, 1);
  const targetFrac = Math.min(1, current / range);
  const nextFrac = nextCount ? Math.min(1, nextCount / range) : null;

  // The road is ALLOWED to be long — journeys deserve scroll distance.
  // Height scales with milestone count AND (capped) program length, so a
  // 12-week plan reads as real climbing, while a 365-day plan stays sane.
  const height = Math.max(
    560,
    milestones.length * (MIN_GAP + 56) + PAD_TOP + PAD_BOTTOM,
    Math.min(range, 60) * 46 + PAD_TOP + PAD_BOTTOM,
  );
  const trackLen = height - PAD_TOP - PAD_BOTTOM;
  const rawY = (count: number) => PAD_TOP + (1 - count / range) * trackLen;
  const ys: number[] = milestones.map(m => rawY(m.count));
  if (ys.length > 0) {
    ys[0] = Math.min(ys[0], height - PAD_BOTTOM - 16);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i], ys[i - 1] - MIN_GAP);
  }

  // PROGRESS MARKERS: lightweight "WEEK 1"-style ticks for units that have
  // no reward, so the road never feels like an empty void between prizes.
  // Step scales with program length; markers colliding with reward
  // milestones (or their cards) are skipped.
  const milestoneCounts = new Set(milestones.map(m => m.count));
  const markerStep = Math.max(1, Math.ceil(range / 16));
  const markers: { n: number; y: number }[] = [];
  for (let n = markerStep; n <= range; n += markerStep) {
    if (milestoneCounts.has(n)) continue;
    const my = rawY(n);
    if (ys.some(y => Math.abs(y - my) < 48)) continue;
    markers.push({ n, y: my });
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

  // ── CP-103 NO-FLASH ENTRY: park the viewport at the BOTTOM of the road
  // BEFORE the browser paints. Previously the page painted at scroll 0 (the
  // far summit) and only jumped down 120–350ms later, which read as a glitch
  // every single time the Streaks tab was opened. useLayoutEffect runs after
  // layout but before paint, so the first frame the user ever sees is the
  // start of the climb. ──
  const positionedRef = useRef(false);
  useIsoLayoutEffect(() => {
    if (positionedRef.current) return;
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;
    positionedRef.current = true;
    // Replay starts from the base; reduced-motion / zero-streak opens at the
    // user's real position instead. Same formula, different fraction.
    const still = reducedMotion() || current <= 0;
    const frac = still ? targetFrac : 0;
    const rect = el.getBoundingClientRect();
    const headY = rect.top + window.scrollY + PAD_TOP + (1 - frac) * (rect.height - PAD_TOP - PAD_BOTTOM);
    const top = Math.max(0, headY - window.innerHeight * (still ? 0.55 : 0.6));
    if (top > 4) window.scrollTo({ top, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // The viewport is already parked at the base (layout effect above), so
    // this timer only paces the burn — it never moves the page.
    const kick = window.setTimeout(() => runAnim(0, targetFrac, T, true), 350);
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
  const headSize = current <= 0 ? 0 : ratio < 0.34 ? 46 : 54;
  // CP-99: restrained halo — the head should be bright, not a floodlight.
  const headGlow = ratio < 0.34 ? `0 0 9px 2px ${theme.glow}` : `0 0 13px 3px ${theme.glow}`;

  const fillGradient = `linear-gradient(to top, ${theme.cell[2]} 0%, ${theme.cell[1]} 55%, ${theme.cell[0]} 100%)`;
  const fillPx = Math.max(displayFrac * trackLen, current > 0 ? 0 : STARTER_PX);
  // Warm halo hovering around the active head (or the pilot flame at zero).
  const haloBottom = PAD_BOTTOM + (current > 0 ? displayFrac * trackLen : STARTER_PX) - 110;

  return (
    <div className="px-3 mt-4">
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className={`text-sm font-bold ${light ? "text-slate-800" : "text-white/90"}`}>Your reward road</h2>
        <span className={`text-[10px] font-extrabold ${light ? "text-slate-500" : "text-white/50"}`}>
          Check in every {unit} to climb
        </span>
      </div>

      <div ref={containerRef} className="relative" style={{ height }}>
        {/* ── PROTECTED CORRIDOR: a subtle frosted lane around the route so
            the road never sits directly on the environment color. Wider
            than the track, much narrower than the screen — a runway, not
            another giant card. ── */}
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 rounded-[2.5rem] pointer-events-none overflow-hidden"
          style={{
            width: "10rem",
            // Escalating lane: calm at the base, faint golden atmosphere at
            // the summit — higher streak = higher-value territory.
            // CP-103: the escalating summit glow now burns in the business's
            // PROGRESS color, and burns noticeably harder — calm at the base,
            // real heat at the top of the climb.
            background: light
              ? `linear-gradient(180deg, ${alpha(cMid, 0.55)} 0%, ${alpha(cLight, 0.42)} 10%, rgba(255,255,255,0.52) 28%, rgba(255,255,255,0.38) 62%, rgba(255,255,255,0.45) 100%)`
              : `linear-gradient(180deg, ${alpha(cMid, 0.42)} 0%, ${alpha(cLight, 0.24)} 11%, rgba(255,255,255,0.11) 30%, rgba(255,255,255,0.06) 62%, rgba(255,255,255,0.08) 100%)`,
            boxShadow: light
              ? `inset 0 0 0 1px rgba(255,255,255,0.7), inset 0 56px 72px -30px ${alpha(cMid, 0.6)}, inset 0 18px 30px -16px ${alpha(cDeep, 0.35)}`
              : `inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 56px 72px -30px ${alpha(cMid, 0.5)}, inset 0 18px 30px -16px ${alpha(cDeep, 0.3)}, inset 0 0 34px rgba(255,255,255,0.05)`,
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
          }}
        >
          {/* sparse spark field — denser + brighter toward the top */}
          {CORRIDOR_SPARKS.map((sp, i) => (
            <span key={i} className="absolute rounded-full"
              style={{
                top: sp.t, left: sp.l, width: sp.s, height: sp.s, opacity: sp.o,
                background: light ? shade(cDeep, 0.1) : "#ffffff",
                boxShadow: sp.o > 0.35 ? `0 0 8px 2px ${alpha(cLight, 0.7)}` : undefined,
              }} />
          ))}
        </div>
        {/* warm ambient light around the active part of the road */}
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            bottom: haloBottom, width: 240, height: 220,
            background: `radial-gradient(closest-side, ${theme.glow.replace(/, [\d.]+\)$/, ", 0.07)")}, transparent)`,
          }}
        />

        {/* ── CENTRAL TRACK: casing → channel → fill → head ── */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-8 rounded-full bg-white ring-1 ring-black/10"
          style={{ top: PAD_TOP, bottom: PAD_BOTTOM, boxShadow: "0 2px 5px rgba(15,23,42,0.12), inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(15,23,42,0.06)" }}
        >
          {/* inner channel — the whole journey stays clearly visible */}
          <div className="absolute rounded-full bg-slate-200"
            style={{ left: 4, right: 4, top: 4, bottom: 4, boxShadow: "inset 0 1px 3px rgba(15,23,42,0.14)" }}>
            {/* DIRECTIONAL next segment: dotted amber line + arrowhead — the
                road visibly points from my flame to my next reward. Beyond
                the next milestone the channel stays quiet/inactive. */}
            {nextFrac !== null && nextFrac > displayFrac && (
              <>
                <div className="absolute left-1/2 -translate-x-1/2 w-1 rounded-full"
                  style={{
                    bottom: `${displayFrac * 100}%`,
                    height: `${(nextFrac - displayFrac) * 100}%`,
                    backgroundImage: `repeating-linear-gradient(to top, ${alpha(cMid, 0.9)} 0px, ${alpha(cMid, 0.9)} 4px, transparent 4px, transparent 11px)`,
                  }} />
                <ChevronUp className="absolute left-1/2 -translate-x-1/2 h-3.5 w-3.5 z-[5]"
                  style={{ bottom: `calc(${nextFrac * 100}% - 24px)`, color: cMid }} />
              </>
            )}
            {/* burning fill — rAF drives it in flight, React owns it at rest */}
            <div
              ref={fillRef}
              className="absolute bottom-0 left-0 right-0 rounded-full"
              style={{ height: `${fillPx}px`, background: fillGradient, boxShadow: `0 0 7px 1px ${theme.glow}, inset 2px 0 3px rgba(255,255,255,0.35), inset -2px 0 3px rgba(0,0,0,0.15)` }}
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
              <div className="atlas-flame-head h-9 w-9 rounded-full flex items-center justify-center ring-4 ring-white"
                style={{
                  background: `linear-gradient(135deg, ${theme.cell[0]}, ${theme.cell[1]})`,
                  boxShadow: `0 0 8px 1px ${theme.glow}`,
                }}>
                <Flame className="h-4 w-4 text-white drop-shadow" />
              </div>
            </div>
          )}
        </div>

        {/* ── PROGRESS MARKERS: "— WEEK 1" ticks between rewards ── */}
        {markers.map(({ n, y }) => {
          const done = n <= current;
          return (
            <div key={`mk-${n}`} className="absolute inset-x-0 pointer-events-none" style={{ top: y }}>
              {/* track notch — a real tick on the road, not just side text */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full"
                style={{ background: done ? alpha(cMid, 0.95) : light ? "rgba(51,65,85,0.35)" : "rgba(255,255,255,0.5)" }} />
              <div className="absolute left-1/2 h-[3px] w-5 -translate-y-1/2 rounded-full"
                style={{ marginLeft: "1.4rem", background: done ? alpha(cMid, 0.85) : light ? "rgba(51,65,85,0.28)" : "rgba(255,255,255,0.38)" }} />
              <span className="absolute left-1/2 -translate-y-1/2 text-[11px] font-black uppercase tracking-[0.1em] whitespace-nowrap"
                style={{ marginLeft: "3rem", color: done ? (light ? earnedInk : "rgba(255,255,255,0.9)") : light ? "rgba(51,65,85,0.6)" : "rgba(255,255,255,0.55)" }}>
                {unit} {n}
              </span>
            </div>
          );
        })}

        {/* ── MILESTONES branching off the track ── */}
        {milestones.map((m, i) => {
          const y = ys[i];
          const left = i % 2 === 0;
          const unlocked = m.count <= current;
          // (claimed vs unlocked no longer differ visually — the green card
          // + white ✓ circle says "completed"; claimed data stays available)
          void claimed;
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
                {/* the summit milestone gets a quiet golden aura */}
                {i === milestones.length - 1 && (
                  <div className="absolute -inset-2.5 rounded-full pointer-events-none"
                    style={{ background: `radial-gradient(circle, ${alpha(cLight, 0.45)}, transparent 70%)` }} />
                )}
                {unlocked ? (
                  <div className="h-6 w-6 rounded-full ring-4 ring-white flex items-center justify-center"
                    style={{ background: earnedNodeBg, boxShadow: `0 0 12px 2px ${alpha(cMid, 0.6)}` }}>
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : isNext ? (
                  <div className="h-7 w-7 rounded-full bg-white ring-4 ring-white flex items-center justify-center"
                    style={{ boxShadow: "0 0 0 2px #f59e0b, 0 0 14px 3px rgba(245,158,11,0.45)" }}>
                    <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "#f59e0b" }} />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-full ring-4 ring-white flex items-center justify-center"
                    style={{ background: "#dbe7f2", boxShadow: "0 1px 3px rgba(15,23,42,0.2), inset 0 0 0 1px rgba(91,124,157,0.35)" }}>
                    <Lock className="h-2.5 w-2.5" style={{ color: "#5b7c9d" }} />
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
                  background: unlocked
                    ? earnedConnector
                    : isNext
                      ? "linear-gradient(90deg, #facc15, #f59e0b)"
                      : light ? "rgba(51,65,85,0.2)" : "rgba(255,255,255,0.28)",
                } as React.CSSProperties}
              />

              {/* compact reward card — image + name first, milestone last */}
              <div
                className={`absolute -translate-y-1/2 ${left ? "left-0" : "right-0"} ${pulsing ? "atlas-card-flash" : ""}`}
                style={{ top: 0, width: "calc(50% - 2.2rem)" }}
              >
                <div
                  className={`relative rounded-2xl border bg-white shadow-sm ring-1 ring-black/5 overflow-hidden ${
                    !unlocked && !isNext ? "opacity-70" : ""
                  }`}
                  style={
                    isNext
                      ? { borderColor: "rgba(245,158,11,0.6)", boxShadow: "0 0 0 2px rgba(245,158,11,0.35), 0 10px 22px -12px rgba(245,158,11,0.5)" }
                      : unlocked
                        // EARNED: the whole card goes green — completed at a
                        // glance, no label needed (white ✓ circle seals it).
                        ? {
                            // CP-103: earned cards wear the PROGRESS color,
                            // not a hard-coded green.
                            background: earnedCardBg,
                            borderColor: "rgba(255,255,255,0.25)",
                            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 10px 22px -12px ${alpha(cDeep, 0.65)}`,
                          }
                        : undefined
                  }
                >
                  {/* white circle + green check — the completion seal */}
                  {unlocked && (
                    <span className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-white shadow-md flex items-center justify-center">
                      <Check className="h-4 w-4" style={{ color: earnedInk }} />
                    </span>
                  )}
                  {/* PHOTO rewards: big banner image — a real prize preview.
                      POINTS rewards: the number IS the prize, shown large. */}
                  {rewardGift && m.reward_image_url ? (
                    <>
                      {/* CP-99: object-CONTAIN on a filler surface — the whole
                          photo shows, never a forced crop. */}
                      <div className={`relative flex items-center justify-center ${unlocked ? "bg-white/15" : "bg-slate-100"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.reward_image_url} alt="" className={`w-full object-contain ${isNext ? "h-24" : "h-20"}`}
                          style={{ opacity: unlocked || isNext ? 1 : 0.7, filter: unlocked || isNext ? undefined : "saturate(0.55)" }} />
                      </div>
                      <div className="p-2.5">
                        {isNext && (
                          <div className="text-[8px] font-black tracking-[0.16em] uppercase mb-0.5 text-amber-600">
                            Next reward
                          </div>
                        )}
                        <div className={`text-[9px] font-black tracking-wider uppercase ${unlocked ? "text-white/75" : ""}`}
                          style={!unlocked ? { color: "#4a7ba6" } : undefined}>
                          {unit} {m.count}
                        </div>
                        <div className={`text-[13px] font-black leading-tight line-clamp-2 mt-0.5 ${unlocked ? "text-white" : "text-slate-900"}`}>
                          {rewardTitle(m)}
                        </div>
                        {isNext && (
                          <div className={`mt-1 text-[10px] font-extrabold ${away === 1 ? "text-amber-600" : "text-slate-600"}`}>
                            {away === 1 ? "One check-in away!" : `${away} more check-ins`}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-3">
                      {isNext && (
                        <div className="text-[8px] font-black tracking-[0.16em] uppercase mb-1 text-amber-600">
                          Next reward
                        </div>
                      )}
                      <div className="flex items-center gap-2.5">
                        <div className={`h-14 w-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center ring-1 ${
                          unlocked ? "bg-white ring-white/40" : "bg-slate-100 ring-black/5"
                        }`}>
                          {pointsGift && logoUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
                          ) : (
                            <Gift className={`h-6 w-6 ${unlocked ? "" : "text-slate-400"}`}
                              style={unlocked ? { color: earnedInk } : undefined} />
                          )}
                        </div>
                        <div className={`min-w-0 flex-1 ${unlocked ? "pr-6" : ""}`}>
                          <div className={`text-[9px] font-black tracking-wider uppercase ${unlocked ? "text-white/75" : ""}`}
                            style={!unlocked ? { color: "#4a7ba6" } : undefined}>
                            {unit} {m.count}
                          </div>
                          <div className={`${pointsGift ? "text-lg" : "text-[13px]"} font-black leading-tight line-clamp-2 mt-0.5 ${unlocked ? "text-white" : "text-slate-900"}`}>
                            {rewardTitle(m)}
                          </div>
                          {isNext && (
                            <div className={`mt-1 text-[10px] font-extrabold ${away === 1 ? "text-amber-600" : "text-slate-600"}`}>
                              {away === 1 ? "One check-in away!" : `${away} more check-ins`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* finish glow when everything is earned */}
        {settled && current >= range && (
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: PAD_TOP - 48 }}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ background: earnedNodeBg, boxShadow: `0 0 18px 4px ${alpha(cMid, 0.65)}` }}>
              <Trophy className="h-5 w-5 text-white drop-shadow" />
            </div>
            <span className="mt-1 text-[9px] font-black tracking-widest uppercase"
              style={{ color: light ? earnedInk : cLight }}>Complete</span>
          </div>
        )}

        {/* START marker at the base of the climb + its own small CTA —
            the road is reachable AND actionable right where it begins. */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ bottom: PAD_BOTTOM - 104 }}>
          <div className="h-8 w-8 rounded-full bg-white ring-1 ring-black/10 shadow-sm flex items-center justify-center">
            <Flame className="h-4 w-4" style={{ color: theme.to }} />
          </div>
          <span className={`mt-1 text-[9px] font-black tracking-[0.2em] uppercase ${light ? "text-slate-500" : "text-white/60"}`}>Start</span>
          {canCheckIn ? (
            <Link
              href={`${appBase}/scan`}
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold ring-1 backdrop-blur-sm shadow-sm active:scale-95 transition whitespace-nowrap ${
                light ? "text-slate-800 bg-white ring-black/10" : "text-white bg-white/15 ring-white/30"
              }`}
            >
              <QrCode className="h-3 w-3" /> Check in now
            </Link>
          ) : (
            <span className="mt-2 inline-flex flex-col items-center gap-0.5 whitespace-nowrap">
              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold ${light ? "text-emerald-600" : "text-emerald-300/90"}`}>
                <Check className="h-3 w-3" /> Checked in
              </span>
              {nextEligibleMs !== null && nextEligibleMs > 0 && (
                <span className={`inline-flex items-center gap-1 text-[9px] font-bold tabular-nums ${light ? "text-slate-500" : "text-white/60"}`}>
                  <CalendarDays className="h-2.5 w-2.5" /> Next check-in in {timeLeftLabel(nextEligibleMs)}
                </span>
              )}
            </span>
          )}
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
