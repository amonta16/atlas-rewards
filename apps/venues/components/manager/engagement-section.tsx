"use client";
/**
 * EngagementSection — CP-160 · "what Atlas is building for you"
 *
 * The Insights tab used to stop at points / redemptions / reviews. Since then
 * the app collects a lot more — check-ins (visits), wheel spins, bookings,
 * social follows, memberships, waivers, birthdays, gifts — and none of it was
 * shown back to the owner. This section reads two RPCs (cp160) and lays the
 * numbers out as a progress story: visit momentum (12-week bars), what the
 * game layer is doing, what the desk has captured, and what's compounding
 * (data on file that makes future campaigns possible).
 */
import { useEffect, useMemo, useState } from "react";
import { Flame, Sparkles, CalendarClock, Star, Instagram, Facebook, Crown, FileSignature, Cake, Gift, TrendingUp, TrendingDown, Users, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Rollup = {
  visits_30d: number; visits_prev_30d: number; unique_visitors_30d: number;
  spins_30d: number; spin_points_30d: number;
  bookings_30d: number; bookings_upcoming: number; bookings_noshow_30d: number;
  google_reviews: number; ig_follows: number; fb_follows: number;
  paid_members: number; waivers_signed: number; gifts_revealed: number; gifts_redeemed: number;
  birthdays_on_file: number; members_total: number;
};
type Week = { week_start: string; visits: number; new_members: number; redemptions: number; bookings: number };

export function EngagementSection({ business }: { business: Business }) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const [r, setR] = useState<Rollup | null | "loading">("loading");
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [metric, setMetric] = useState<keyof Omit<Week, "week_start">>("visits");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [a, b] = await Promise.all([
        supabase.rpc("atlas_engagement_rollup", { p_business_id: business.id }),
        supabase.rpc("atlas_weekly_trend", { p_business_id: business.id }),
      ]);
      setR(a.error ? null : ((a.data as Rollup | null) ?? null));
      setWeeks(b.error ? [] : ((b.data as Week[]) ?? []));
    })();
  }, [business.id]);

  const max = useMemo(() => Math.max(1, ...weeks.map(w => w[metric])), [weeks, metric]);
  const total12 = useMemo(() => weeks.reduce((s, w) => s + w[metric], 0), [weeks, metric]);

  if (r === "loading") {
    return <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading engagement…</div>;
  }
  if (!r) return null; // pre-CP-160 DB → section simply absent

  const visitDelta = r.visits_prev_30d > 0 ? Math.round(((r.visits_30d - r.visits_prev_30d) / r.visits_prev_30d) * 100) : null;
  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

  return (
    <div className="rounded-3xl border bg-white p-5 lg:p-7 shadow-sm space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primary }}>What Atlas is building</div>
          <h3 className="font-bold text-lg leading-tight mt-0.5">Engagement engine</h3>
          <p className="text-sm text-zinc-500 mt-1 max-w-xl">Every visit, spin, booking and follow the app captures — and the data that compounds behind it.</p>
        </div>
        <div className="rounded-2xl px-4 py-2.5 text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-85">Visits · 30 days</div>
          <div className="text-2xl font-black leading-none mt-0.5 tabular-nums flex items-center gap-2">
            {r.visits_30d.toLocaleString()}
            {visitDelta !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold rounded-full px-1.5 py-0.5 ${visitDelta >= 0 ? "bg-white/25" : "bg-black/20"}`}>
                {visitDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(visitDelta)}%
              </span>
            )}
          </div>
          <div className="text-[10px] opacity-85 mt-0.5">{r.unique_visitors_30d} different people</div>
        </div>
      </div>

      {/* 12-week trend */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">Last 12 weeks · {total12.toLocaleString()} {metric.replace("_", " ")}</div>
          <div className="flex gap-1">
            {(["visits", "new_members", "bookings", "redemptions"] as const).map(k => (
              <button key={k} type="button" onClick={() => setMetric(k)}
                className={`rounded-full px-2.5 h-7 text-[11px] font-bold border ${metric === k ? "text-white border-transparent" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
                style={metric === k ? { background: primary } : undefined}>
                {k === "new_members" ? "New members" : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="h-32 flex items-end gap-1.5">
          {weeks.map((w, i) => {
            const h = Math.max(3, Math.round((w[metric] / max) * 100));
            const last = i === weeks.length - 1;
            return (
              <div key={w.week_start} className="flex-1 flex flex-col items-center gap-1 group" title={`${new Date(w.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${w[metric]}`}>
                <div className="text-[9px] font-bold text-zinc-500 tabular-nums opacity-0 group-hover:opacity-100 transition">{w[metric]}</div>
                <div className="w-full rounded-t-md transition-all" style={{ height: `${h}%`, background: last ? `linear-gradient(180deg, ${secondary}, ${primary})` : `${primary}${w[metric] ? "99" : "22"}` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9px] text-zinc-400 mt-1">
          <span>{weeks[0] ? new Date(weeks[0].week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
          <span>this week</span>
        </div>
      </div>

      {/* Three columns of tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <Group title="Game layer" sub="Reasons to come back">
          <Tile icon={<Sparkles className="h-4 w-4" />} c={primary} label="Wheel spins · 30d" value={r.spins_30d} sub={`${r.spin_points_30d.toLocaleString()} pts won`} />
          <Tile icon={<Gift className="h-4 w-4" />} c={primary} label="Gifts opened" value={r.gifts_revealed} sub={`${r.gifts_redeemed} redeemed at the desk`} />
          <Tile icon={<Flame className="h-4 w-4" />} c={primary} label="Visits per visitor" value={r.unique_visitors_30d ? (r.visits_30d / r.unique_visitors_30d).toFixed(1) : "—"} sub="last 30 days" />
        </Group>
        <Group title="Desk captured" sub="What staff turned into data">
          <Tile icon={<CalendarClock className="h-4 w-4" />} c={primary} label="Bookings · 30d" value={r.bookings_30d} sub={`${r.bookings_upcoming} upcoming · ${r.bookings_noshow_30d} no-show`} />
          <Tile icon={<Star className="h-4 w-4" />} c="#f59e0b" label="Google reviews" value={r.google_reviews} sub="verified" />
          <div className="grid grid-cols-2 gap-2">
            <Tile icon={<Instagram className="h-4 w-4" />} c="#db2777" label="IG follows" value={r.ig_follows} compact />
            <Tile icon={<Facebook className="h-4 w-4" />} c="#2563eb" label="FB follows" value={r.fb_follows} compact />
          </div>
        </Group>
        <Group title="Compounding" sub="Data that makes the next campaign possible">
          <Tile icon={<Crown className="h-4 w-4" />} c={primary} label="Paid members" value={r.paid_members} sub={`${pct(r.paid_members, r.members_total)}% of ${r.members_total}`} />
          <Tile icon={<Cake className="h-4 w-4" />} c={primary} label="Birthdays on file" value={r.birthdays_on_file} sub={`${pct(r.birthdays_on_file, r.members_total)}% · auto-gifted yearly`} />
          <Tile icon={<FileSignature className="h-4 w-4" />} c={primary} label="Waivers signed" value={r.waivers_signed} sub="digital, searchable" />
        </Group>
      </div>

      <div className="rounded-2xl bg-zinc-50 border px-4 py-3 text-[12px] text-zinc-600 flex items-start gap-2">
        <Users className="h-4 w-4 shrink-0 mt-0.5 text-zinc-400" />
        <span>
          <b className="text-zinc-800">Read it like this:</b> visits are the heartbeat; spins and gifts are why they come back sooner;
          bookings, reviews and follows are the desk turning a visit into something durable; and members, birthdays and waivers
          are the list you&apos;ll market to from the Campaigns tab.
        </span>
      </div>
    </div>
  );
}

function Group({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-3 space-y-2">
      <div>
        <div className="text-[11px] font-black uppercase tracking-wider text-zinc-700">{title}</div>
        <div className="text-[10px] text-zinc-500">{sub}</div>
      </div>
      {children}
    </div>
  );
}

function Tile({ icon, c, label, value, sub, compact }: { icon: React.ReactNode; c: string; label: string; value: number | string; sub?: string; compact?: boolean }) {
  return (
    <div className="rounded-xl bg-white border px-3 py-2.5 flex items-center gap-3">
      <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c}18`, color: c }}>{icon}</span>
      <div className="min-w-0">
        <div className={`font-black tabular-nums leading-none ${compact ? "text-lg" : "text-xl"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide truncate mt-0.5">{label}</div>
        {sub && !compact && <div className="text-[10px] text-zinc-500 truncate">{sub}</div>}
      </div>
    </div>
  );
}
