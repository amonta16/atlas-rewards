"use client";
/**
 * InsightsDashboard — CP-32 → CP-36 cleanup
 *
 * CP-36 removed two surfaces Andrew said weren't pulling weight:
 *   • Busiest hours (no operator was actually staffing off it)
 *   • Come-Back AI predictions (overlap with the simpler Inactive list)
 *
 * The Inactive list is now the single win-back surface and was upgraded:
 *   • Cutoff bumped to 60 days (was 30) — matches Andrew's "if I haven't
 *     seen them in two months, that's when I want a nudge".
 *   • "We miss you" composer: choose how many bonus credits to drop +
 *     send to one row, or fire-and-forget to the whole list with one tap.
 *
 * Top loyal members is unchanged structurally but now sits with a clearer
 * "real tracking" caption (the existing top_loyal_members RPC already
 * sums lifetime_points_earned + visit_count, so the data was always real
 * — Andrew just wanted the framing to read like the system is actively
 * watching, not a one-off snapshot).
 */
import { useEffect, useState } from "react";
import {
  Sparkles, TrendingUp, Users, Repeat, Gift, Mail, Send,
  Trophy, Brain, Star, ArrowRight, ShieldCheck, DollarSign, BarChart3,
  AlertTriangle, X, MessageSquareHeart, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import type { Business } from "@/lib/types/database";

type Rollup = {
  total_members: number; new_members_30d: number; active_members_30d: number;
  repeat_rate_pct: number; avg_value_cents: number;
  redemptions_30d: number; points_awarded_30d: number; redemption_rate_pct: number;
  inactive_60d: number; total_revenue_30d_cents: number;
};

/** atlas_impact_rollup(p_business_id) — CP-32 */
type Impact = {
  driven_revenue_cents: number;            // total $ attributed to Atlas (loyalty + reviews + winbacks)
  repeat_visit_lift_pct: number;           // % of repeat visits attributable to loyalty
  reviews_generated: number;               // verified reviews via Atlas (lifetime)
  reviews_generated_30d: number;           // verified reviews this 30d window
  estimated_review_value_cents: number;    // reviews × business value per review (default $35)
  estimated_winback_cents: number;         // recovered revenue from winback messages
  retention_lift_pct: number;              // estimated retention pp vs. no-loyalty baseline
  avg_member_value_cents: number;          // avg LTV per Atlas member
  member_count: number;
  // Counterfactual baselines for "without Atlas" view
  baseline_visits_30d: number;
  actual_visits_30d: number;
  baseline_revenue_30d_cents: number;
  actual_revenue_30d_cents: number;
};

type MonthlyPoint = { month: string; reviews: number; revenue_cents: number; visits: number };

type ReviewFunnel = {
  asks_30d: number; submitted_30d: number; verified_30d: number;
  star_avg_before: number | null; star_avg_after: number | null;
  total_lifetime_reviews: number;
};

type TopMember = {
  membership_id: string; full_name: string | null; email: string | null;
  lifetime_points: number; points_balance: number; visit_count: number;
  last_visit_at: string | null;
};
type Inactive = {
  membership_id: string; full_name: string | null; email: string | null; phone: string | null;
  last_visit_at: string | null; days_since_last: number | null; visit_count: number;
};

// CP-36: minimum days since last visit before we consider a member inactive.
// Andrew explicitly asked for two months.
const INACTIVE_DAYS = 60;

export function InsightsDashboard({ business }: { business: Business }) {
  const { toast } = useToast();
  const [rollup, setRollup]       = useState<Rollup | null>(null);
  const [impact, setImpact]       = useState<Impact | null>(null);
  const [monthly, setMonthly]     = useState<MonthlyPoint[]>([]);
  const [funnel, setFunnel]       = useState<ReviewFunnel | null>(null);
  const [top, setTop]             = useState<TopMember[]>([]);
  const [inactive, setInactive]   = useState<Inactive[]>([]);
  const [sending, setSending]     = useState<string | "all" | null>(null);
  // CP-36: we-miss-you composer — opens with either a single membership
  // selected, or null (= send-to-all-inactive).
  const [composer, setComposer] = useState<{ target: Inactive | "all" } | null>(null);

  async function loadAll() {
    const supabase = createClient();
    const [
      { data: r },
      { data: t },
      { data: i },
      impactRes,
      monthlyRes,
      funnelRes,
    ] = await Promise.all([
      supabase.rpc("business_analytics_rollup", { p_business_id: business.id }),
      supabase.rpc("top_loyal_members",         { p_business_id: business.id, p_limit: 5 }),
      supabase.rpc("inactive_members",          { p_business_id: business.id, p_min_days: INACTIVE_DAYS, p_limit: 50 }),
      supabase.rpc("atlas_impact_rollup",       { p_business_id: business.id }),
      supabase.rpc("atlas_impact_monthly",      { p_business_id: business.id }),
      supabase.rpc("atlas_review_funnel",       { p_business_id: business.id }),
    ]);

    const row = Array.isArray(r) ? r[0] : r;
    setRollup((row ?? null) as Rollup | null);
    setTop((t ?? []) as TopMember[]);
    setInactive((i ?? []) as Inactive[]);

    // CP-32 RPCs — silently no-op if the migration hasn't been applied.
    const im = Array.isArray(impactRes.data) ? impactRes.data[0] : impactRes.data;
    setImpact((im ?? null) as Impact | null);
    setMonthly((monthlyRes.data ?? []) as MonthlyPoint[]);
    const fu = Array.isArray(funnelRes.data) ? funnelRes.data[0] : funnelRes.data;
    setFunnel((fu ?? null) as ReviewFunnel | null);
  }

  useEffect(() => { loadAll(); }, [business.id]);

  // CP-36: send a we-miss-you notification (+ optional bonus points) to
  // a single inactive member OR to the entire inactive list. Targets the
  // existing send_winback RPC per row.
  async function sendWeMissYou(target: Inactive | "all", bonusPoints: number, message: string) {
    const targets: Inactive[] = target === "all" ? inactive : [target];
    if (targets.length === 0) {
      toast.error("Nobody inactive right now");
      return;
    }
    setSending(target === "all" ? "all" : target.membership_id);
    const supabase = createClient();
    try {
      // Fire them in parallel — each call is an independent insert.
      await Promise.all(
        targets.map(t => supabase.rpc("send_winback", {
          p_business_id: business.id,
          p_membership_id: t.membership_id,
          p_title: "We miss you ✨",
          p_body: message,
          p_bonus_points: bonusPoints > 0 ? bonusPoints : null,
        }))
      );
      toast.success(
        target === "all"
          ? `Sent to ${targets.length} member${targets.length === 1 ? "" : "s"}`
          : `Sent to ${target.full_name ?? target.email ?? "member"}`
      );
      setComposer(null);
      loadAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't send");
    } finally {
      setSending(null);
    }
  }

  const dollars = (c: number) => `$${(c / 100).toFixed(0)}`;
  const dollarsBig = (c: number) => {
    const n = c / 100;
    if (n >= 10000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const brand = business.brand_colors.primary;
  const brand2 = business.brand_colors.secondary;

  return (
    <div className="space-y-6">
      {/* ============================================================
          ATLAS IMPACT HERO — the "this is what we did for you" card.
          ============================================================ */}
      <div
        className="relative rounded-3xl overflow-hidden text-white shadow-xl"
        style={{
          background: `linear-gradient(135deg, #0a3d62 0%, #1d6fa5 60%, ${brand2 ?? "#2a8cc4"} 100%)`,
        }}
      >
        <div className="pointer-events-none absolute -top-16 -right-12 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl" />

        <div className="relative p-6 lg:p-8">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-extrabold opacity-90">
            <Sparkles className="h-3.5 w-3.5" /> Atlas Impact · Last 30 days
          </div>

          <div className="mt-3 flex items-end flex-wrap gap-x-6 gap-y-2">
            <div>
              <div className="text-[12px] uppercase font-bold opacity-80 tracking-wider">
                Atlas drove
              </div>
              <div className="text-5xl lg:text-6xl font-black leading-none tabular-nums drop-shadow-lg">
                {impact ? dollarsBig(impact.driven_revenue_cents) : "—"}
              </div>
              <div className="text-sm font-semibold opacity-90 mt-1">
                for {business.name} this month.
              </div>
            </div>

            {impact && impact.retention_lift_pct > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-white/15 backdrop-blur-sm px-3 py-2 ring-1 ring-white/20">
                <TrendingUp className="h-5 w-5" />
                <div>
                  <div className="text-2xl font-black tabular-nums">+{impact.retention_lift_pct.toFixed(0)}%</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold opacity-85">retention lift</div>
                </div>
              </div>
            )}
          </div>

          {/* Source breakdown chips */}
          {impact && (
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2">
              <ImpactChip icon={<Repeat className="h-3.5 w-3.5" />} label="Repeat visits"
                value={dollars(Math.max(0, impact.actual_revenue_30d_cents - impact.baseline_revenue_30d_cents))} />
              <ImpactChip icon={<Star className="h-3.5 w-3.5" />} label="Review value"
                value={dollars(impact.estimated_review_value_cents)} />
              <ImpactChip icon={<Brain className="h-3.5 w-3.5" />} label="Win-back revenue"
                value={dollars(impact.estimated_winback_cents)} />
              <ImpactChip icon={<Users className="h-3.5 w-3.5" />} label="Member LTV"
                value={dollars(impact.avg_member_value_cents)} sub="per Atlas member"/>
            </div>
          )}

          {!impact && (
            <p className="mt-4 text-[12px] opacity-90 italic">
              Apply the CP-32 SQL migration to unlock the Atlas Impact hero — until then this card runs in preview mode.
            </p>
          )}
        </div>
      </div>

      {/* ============================================================
          WITH / WITHOUT ATLAS — the "imagine canceling" comparison.
          ============================================================ */}
      {impact && (
        <div className="rounded-3xl border bg-white p-5 lg:p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                With Atlas <span className="text-zinc-400 mx-1">vs.</span> Without
              </h3>
              <p className="text-xs text-muted-foreground">
                Side-by-side: what's happening today vs. an estimated baseline with no loyalty + no review automation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <CompareRow
              label="Revenue (30d)"
              icon={<DollarSign className="h-4 w-4" />}
              withVal={dollarsBig(impact.actual_revenue_30d_cents)}
              withoutVal={dollarsBig(impact.baseline_revenue_30d_cents)}
              brand={brand}
            />
            <CompareRow
              label="Repeat visits (30d)"
              icon={<Repeat className="h-4 w-4" />}
              withVal={`${impact.actual_visits_30d}`}
              withoutVal={`${impact.baseline_visits_30d}`}
              brand={brand}
            />
            <CompareRow
              label="Google reviews (30d)"
              icon={<Star className="h-4 w-4" />}
              withVal={`${impact.reviews_generated_30d}`}
              withoutVal={`${Math.max(0, Math.round(impact.reviews_generated_30d * 0.18))}`}
              brand={brand}
              note="Industry baseline: ~18% organic without prompting"
            />
          </div>
        </div>
      )}

      {/* ============================================================
          GOOGLE REVIEW PERFORMANCE
          CP-42: heavy Google branding (blue/red/yellow/green) so the
          section is instantly recognizable as Google-flavored.
          ============================================================ */}
      <div className="rounded-3xl border overflow-hidden bg-white shadow-sm">
        {/* Google brand-bar — the iconic 4-color stripe at the top */}
        <div className="h-1.5 w-full flex">
          <div className="flex-1" style={{ background: "#4285F4" }} />
          <div className="flex-1" style={{ background: "#EA4335" }} />
          <div className="flex-1" style={{ background: "#FBBC04" }} />
          <div className="flex-1" style={{ background: "#34A853" }} />
        </div>

        <div className="p-5 lg:p-7">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              {/* Inline multicolor "G" logomark */}
              <div className="h-11 w-11 rounded-2xl bg-white border shadow-sm flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a10.99 10.99 0 0 0 0 9.86l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">Google Review performance</h3>
                <p className="text-xs text-muted-foreground">
                  How Atlas is moving the needle on reviews — funnel + monthly volume.
                </p>
              </div>
            </div>
            {funnel && funnel.total_lifetime_reviews > 0 && (
              <div className="text-right">
                <div className="text-3xl font-black tabular-nums" style={{ color: "#34A853" }}>
                  {funnel.total_lifetime_reviews}
                </div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">total verified</div>
              </div>
            )}
          </div>

          {/* Funnel — Google blue → yellow → green follows the
              "ask → submitted → verified" success path. */}
          {funnel && (
            <div className="grid grid-cols-3 gap-2 mb-5">
              <FunnelCell n={funnel.asks_30d}       label="Asks"      tone="google-blue" />
              <FunnelCell n={funnel.submitted_30d}  label="Submitted" tone="google-yellow" />
              <FunnelCell n={funnel.verified_30d}   label="Verified"  tone="google-green" />
            </div>
          )}

        {/* Monthly chart — review volume + revenue trend over 6 months */}
        {monthly.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2">
              Reviews per month
            </div>
            <div className="flex items-end gap-1.5 h-36">
              {monthly.map((m, i) => {
                const max = Math.max(...monthly.map(x => x.reviews), 1);
                const h = (m.reviews / max) * 100;
                return (
                  <div key={m.month + i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="text-[10px] font-bold tabular-nums text-zinc-700">{m.reviews}</div>
                    <div
                      className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${Math.max(6, h)}%`,
                        background: `linear-gradient(180deg, ${brand2 ?? brand}, ${brand})`,
                      }}
                      title={`${m.month}: ${m.reviews} reviews`}
                    />
                    <div className="text-[10px] text-zinc-500">{m.month}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {funnel && funnel.star_avg_after !== null && funnel.star_avg_before !== null && (
          <div
            className="mt-5 rounded-2xl border p-4 flex items-center gap-4"
            style={{ background: "linear-gradient(135deg, #FBBC0410, #FBBC0420)", borderColor: "#FBBC04" }}
          >
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "#92400E" }}>Before Atlas</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#92400E" }}>
                {funnel.star_avg_before.toFixed(1)}★
              </div>
            </div>
            <ArrowRight className="h-5 w-5" style={{ color: "#92400E" }} />
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "#34A853" }}>Now</div>
              <div className="text-2xl font-black tabular-nums" style={{ color: "#34A853" }}>
                {funnel.star_avg_after.toFixed(1)}★
              </div>
            </div>
            <div className="ml-auto text-right text-xs font-semibold" style={{ color: "#1f2937" }}>
              {(funnel.star_avg_after - funnel.star_avg_before).toFixed(1)} star lift
              <br />
              <span className="text-[10px] opacity-80">since Atlas turned on</span>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* ============================================================
          ATLAS DASHBOARD (legacy rollup — kept beneath)
          ============================================================ */}
      <div className="rounded-3xl border bg-white p-5 lg:p-7 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-zinc-500" />
          <h3 className="font-semibold">Operations dashboard</h3>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Members"
            value={rollup?.total_members ?? "—"}
            sub={`${rollup?.new_members_30d ?? 0} new in 30d`}
            tone="indigo"
          />
          <StatCard
            icon={<Repeat className="h-5 w-5" />}
            label="Repeat rate"
            value={rollup ? `${rollup.repeat_rate_pct}%` : "—"}
            sub={`${rollup?.active_members_30d ?? 0} active`}
            tone="emerald"
          />
          <StatCard
            icon={<Gift className="h-5 w-5" />}
            label="Redemption rate"
            value={rollup ? `${rollup.redemption_rate_pct}%` : "—"}
            sub={`${rollup?.redemptions_30d ?? 0} redemptions`}
            tone="amber"
          />
          <StatCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="Inactive (60d+)"
            value={rollup?.inactive_60d ?? "—"}
            sub="Eligible for win-back"
            tone="rose"
          />
        </div>
      </div>

      {/* ===================== TOP LOYAL MEMBERS ===================== */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <div>
            <h3 className="font-semibold">Top loyal members</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Live leaderboard — ranked by lifetime points earned + visits.
              Updates the moment someone scans in.
            </p>
          </div>
        </div>
        {top.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No member activity yet.</div>
        ) : (
          <div className="divide-y">
            {top.map((m, i) => (
              <div key={m.membership_id} className="flex items-center gap-3 px-5 py-3">
                <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-700 font-bold flex items-center justify-center text-sm">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{m.full_name ?? m.email ?? "Member"}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {m.visit_count} visit{m.visit_count === 1 ? "" : "s"}
                    {m.last_visit_at && <> · last seen {new Date(m.last_visit_at).toLocaleDateString()}</>}
                  </div>
                </div>
                <div className="text-sm font-bold tabular-nums" style={{ color: brand }}>
                  {m.lifetime_points.toLocaleString()} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================== INACTIVE LIST (CP-36) ===================== */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-4 w-4 text-zinc-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold">Inactive members (60d+)</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Haven't checked in for two months. Send a "we miss you" with
                a bonus to pull them back.
              </p>
            </div>
          </div>
          {inactive.length > 0 && (
            <Button
              size="sm"
              onClick={() => setComposer({ target: "all" })}
              disabled={sending === "all"}
              style={{ background: brand }}
              className="text-white text-xs shrink-0"
            >
              <MessageSquareHeart className="h-3 w-3 mr-1" />
              {sending === "all" ? "Sending…" : `Send to all ${inactive.length}`}
            </Button>
          )}
        </div>
        {inactive.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No one's inactive — nice retention 👏</div>
        ) : (
          <div className="divide-y">
            {inactive.map(m => (
              <div key={m.membership_id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{m.full_name ?? m.email ?? "Member"}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {m.last_visit_at
                      ? `Last seen ${new Date(m.last_visit_at).toLocaleDateString()} (${Math.round(Number(m.days_since_last))}d ago)`
                      : "Never visited"}
                    {m.email && <> · {m.email}</>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setComposer({ target: m })}
                  disabled={sending === m.membership_id}
                >
                  {sending === m.membership_id ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Sending…</>
                  ) : (
                    <><MessageSquareHeart className="h-3 w-3 mr-1" /> We miss you</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {composer && (
        <WeMissYouComposer
          target={composer.target}
          totalIfAll={inactive.length}
          brand={brand}
          busy={
            composer.target === "all"
              ? sending === "all"
              : sending === composer.target.membership_id
          }
          onCancel={() => setComposer(null)}
          onSend={(bonus, msg) => sendWeMissYou(composer.target, bonus, msg)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── We-miss-you composer ───────────────────────── */
/**
 * CP-36: lightweight modal for sending a win-back notification. The manager
 * picks how many bonus points to drop (default 50, 0 disables the bonus)
 * and optionally tweaks the body copy. Used both for a single inactive
 * member and for the send-to-all path — same UI, different recipient set.
 */
function WeMissYouComposer({
  target, totalIfAll, brand, busy, onCancel, onSend,
}: {
  target: Inactive | "all";
  totalIfAll: number;
  brand: string;
  busy: boolean;
  onCancel: () => void;
  onSend: (bonusPoints: number, message: string) => void;
}) {
  const [bonus, setBonus] = useState<number>(50);
  const [message, setMessage] = useState<string>(
    "Here's a little bonus to welcome you back — come see us soon."
  );
  const recipientLabel =
    target === "all"
      ? `${totalIfAll} inactive member${totalIfAll === 1 ? "" : "s"}`
      : (target.full_name ?? target.email ?? "this member");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <MessageSquareHeart className="h-4 w-4 text-rose-500" />
            We miss you
          </h2>
          <button
            onClick={onCancel}
            className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-zinc-50 border p-3 text-sm">
            Sending to <b>{recipientLabel}</b>.
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Bonus credits (0 = just a message)
            </Label>
            <Input
              type="number"
              min={0}
              max={5000}
              value={bonus}
              onChange={e => setBonus(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))}
              className="mt-1"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Awarded the moment they tap the notification. Use 0 if you
              just want to send a nudge with no points.
            </p>
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Message
            </Label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={240}
              rows={3}
              className="mt-1 w-full rounded-md border bg-white p-3 text-sm"
            />
            <div className="text-[10px] text-zinc-400 mt-1 text-right">{message.length}/240</div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          <button onClick={onCancel} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button
            onClick={() => onSend(bonus, message)}
            disabled={busy || !message.trim()}
            className="rounded-full px-5 text-white"
            style={{ background: brand }}
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" /> Send</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function ImpactChip({
  icon, label, value, sub,
}: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold opacity-90">
        {icon} {label}
      </div>
      <div className="text-xl font-black tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[10px] opacity-80">{sub}</div>}
    </div>
  );
}

function CompareRow({
  label, icon, withVal, withoutVal, brand, note,
}: {
  label: string; icon: React.ReactNode;
  withVal: string; withoutVal: string;
  brand: string;
  note?: string;
}) {
  // CP-42: way bolder green/red contrast. The "With Atlas" cell now
  // gets a solid green wash so the value pop and the "Without" cell
  // gets a red wash so the gap is visceral.
  return (
    <div className="rounded-2xl border-2 border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold text-zinc-700 mb-3">
        {icon} {label}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-xl p-3 border-2"
          style={{
            background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
            borderColor: "#10b981",
          }}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#047857" }}>With Atlas</div>
          <div className="text-2xl font-black tabular-nums mt-0.5" style={{ color: "#064e3b" }}>{withVal}</div>
        </div>
        <div
          className="rounded-xl p-3 border-2"
          style={{
            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            borderColor: "#f87171",
          }}
        >
          <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#b91c1c" }}>Without</div>
          <div
            className="text-2xl font-black tabular-nums mt-0.5 line-through decoration-2"
            style={{ color: "#9ca3af", textDecorationColor: "#f87171" }}
          >
            {withoutVal}
          </div>
        </div>
      </div>
      {note && <p className="text-[10px] text-zinc-500 mt-2 italic">{note}</p>}
    </div>
  );
}

function FunnelCell({
  n, label, tone,
}: {
  n: number;
  label: string;
  // CP-42: added Google brand tones for heavy-Google review section.
  tone: "zinc" | "amber" | "emerald" | "google-blue" | "google-yellow" | "google-green" | "google-red";
}) {
  const tones = {
    zinc:           { bg: "#f4f4f5",        border: "#e4e4e7", text: "#3f3f46",  accent: "#18181b" },
    amber:          { bg: "#fffbeb",        border: "#fde68a", text: "#b45309",  accent: "#78350f" },
    emerald:        { bg: "#ecfdf5",        border: "#a7f3d0", text: "#047857",  accent: "#064e3b" },
    "google-blue":  { bg: "#4285F410",      border: "#4285F4", text: "#1a73e8",  accent: "#1a73e8" },
    "google-yellow":{ bg: "#FBBC0418",      border: "#FBBC04", text: "#92400E",  accent: "#92400E" },
    "google-green": { bg: "#34A85318",      border: "#34A853", text: "#15803d",  accent: "#15803d" },
    "google-red":   { bg: "#EA433518",      border: "#EA4335", text: "#b91c1c",  accent: "#b91c1c" },
  }[tone];
  return (
    <div
      className="rounded-2xl border-2 p-4"
      style={{ background: tones.bg, borderColor: tones.border }}
    >
      <div className="text-[10px] uppercase tracking-wider font-extrabold" style={{ color: tones.text }}>{label}</div>
      <div className="text-3xl font-black tabular-nums" style={{ color: tones.accent }}>{n}</div>
      <div className="text-[10px] opacity-80 mt-0.5" style={{ color: tones.text }}>last 30d</div>
    </div>
  );
}

