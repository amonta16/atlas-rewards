"use client";
/**
 * InsightsV3 — CP-171 · the numbers page, rebuilt to be read in 10 seconds
 *
 * Replaces the Impact hero (estimated "$ Atlas drove"), the With/Without
 * comparison (industry-baseline guesses), the Google-only review card, the
 * Engagement engine, the Operations dashboard and the embedded trends —
 * six overlapping cards that each told part of the story with a different
 * window. This is ONE RPC (atlas_insights_v3), every number is a real row
 * count from the tables the desk and app write to, and every 30-day
 * number carries its previous-30-day twin so the delta is honest.
 *
 * Reading order, top to bottom:
 *   1. Four KPIs — visits · revenue tracked · new members · redemptions
 *   2. Three social pillars — Google · Instagram · Facebook (the thing
 *      Andrew asked for by name), each with lifetime, this month, delta,
 *      and how many are waiting for the desk to verify
 *   3. Momentum — 12-week bars (visits / new members / bookings / redemptions)
 *      + busiest days of the week
 *   4. Three columns — Members · Game layer · Desk captured
 *   5. Most-redeemed rewards (90d)
 *
 * Style: strong and clear. Big tabular numbers, one accent per card, solid
 * status colors, no gradients on data surfaces.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Flame, DollarSign, UserPlus, Gift, Instagram, Facebook, Star, TrendingUp, TrendingDown, Minus,
  Sparkles, CalendarClock, FileSignature, Crown, Cake, Bell, Users, Repeat, Loader2, Clock, Trophy, Coins,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { optimizedUrl } from "@/lib/img";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

type Pillar = { platform: "google" | "instagram" | "facebook"; verified_total: number; verified_30d: number; verified_prev_30d: number; pending: number; rejected: number };
type V3 = {
  members_total: number; new_members_30d: number; new_members_prev_30d: number; active_30d: number; repeat_members: number;
  visited_ever: number; lapsed_60d: number; paid_members: number; birthdays_on_file: number; push_opted_in: number;
  visits_30d: number; visits_prev_30d: number; unique_visitors_30d: number;
  revenue_30d_cents: number; revenue_prev_30d_cents: number; purchases_30d: number; avg_ticket_cents: number;
  points_awarded_30d: number; points_redeemed_30d: number; redemptions_30d: number; redemptions_prev_30d: number; points_outstanding: number;
  spins_30d: number; spins_prev_30d: number; spin_points_30d: number;
  gifts_issued_30d: number; gifts_revealed_30d: number; gifts_redeemed_30d: number; gifts_waiting: number;
  bookings_30d: number; bookings_prev_30d: number; bookings_upcoming: number; bookings_pending: number; bookings_noshow_30d: number;
  waivers_total: number; waivers_30d: number;
  social: Pillar[]; social_pending_total: number; weekday_visits: number[];
  top_rewards: { name: string; image_url: string | null; n: number }[];
};
type Week = { week_start: string; visits: number; new_members: number; redemptions: number; bookings: number };

const GOOGLE = { name: "Google reviews", color: "#1a73e8", soft: "#e8f0fe", icon: <GoogleG /> };
const IG = { name: "Instagram follows", color: "#d62976", soft: "#fce7f3", icon: <Instagram className="h-5 w-5" /> };
const FB = { name: "Facebook follows", color: "#1877f2", soft: "#e7f0fd", icon: <Facebook className="h-5 w-5" /> };

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a10.99 10.99 0 0 0 0 9.86l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

const money = (c: number) => {
  const n = c / 100;
  return n >= 10000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

/** +25% / −10% / new / flat, computed from now vs previous window. */
function Delta({ now, prev, className }: { now: number; prev: number; className?: string }) {
  if (prev === 0 && now === 0) return <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold text-zinc-400", className)}><Minus className="h-3 w-3" /> no change</span>;
  if (prev === 0) return <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-extrabold text-emerald-600", className)}><TrendingUp className="h-3 w-3" /> new</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold text-zinc-500", className)}><Minus className="h-3 w-3" /> flat</span>;
  const up = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-extrabold", up ? "text-emerald-600" : "text-rose-600", className)}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{up ? "+" : ""}{pct}%
    </span>
  );
}

export function InsightsV3({ business }: { business: Business }) {
  const primary = business.brand_colors.primary;
  const [d, setD] = useState<V3 | null | "loading">("loading");
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [metric, setMetric] = useState<keyof Omit<Week, "week_start">>("visits");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [a, b] = await Promise.all([
        supabase.rpc("atlas_insights_v3", { p_business_id: business.id }),
        supabase.rpc("atlas_weekly_trend", { p_business_id: business.id }),
      ]);
      setD(a.error ? null : ((a.data as V3 | null) ?? null));
      setWeeks(b.error ? [] : ((b.data as Week[]) ?? []));
    })();
  }, [business.id]);

  const max = useMemo(() => Math.max(1, ...weeks.map(w => w[metric])), [weeks, metric]);
  const total12 = useMemo(() => weeks.reduce((s, w) => s + w[metric], 0), [weeks, metric]);

  if (d === "loading") {
    return <div className="rounded-2xl border-2 bg-white p-8 text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading insights…</div>;
  }
  if (!d) {
    return <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><b>Insights need one database update.</b> Run <code className="font-mono">cp171_insights_v3_and_desk_gifts.sql</code> in the Supabase SQL editor and reload.</div>;
  }

  const pillars = [
    { ...GOOGLE, p: d.social.find(s => s.platform === "google") },
    { ...IG, p: d.social.find(s => s.platform === "instagram") },
    { ...FB, p: d.social.find(s => s.platform === "facebook") },
  ];
  const socialTotal = d.social.reduce((s, p) => s + p.verified_total, 0);
  const social30 = d.social.reduce((s, p) => s + p.verified_30d, 0);
  const socialPrev = d.social.reduce((s, p) => s + p.verified_prev_30d, 0);
  const repeatPct = d.visited_ever > 0 ? Math.round((d.repeat_members / d.visited_ever) * 100) : 0;
  const pushPct = d.members_total > 0 ? Math.round((d.push_opted_in / d.members_total) * 100) : 0;
  const bdayPct = d.members_total > 0 ? Math.round((d.birthdays_on_file / d.members_total) * 100) : 0;
  const wdMax = Math.max(1, ...d.weekday_visits);
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-5">
      {/* ── 1. KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Flame className="h-5 w-5" />} color={primary} label="Visits" value={d.visits_30d} now={d.visits_30d} prev={d.visits_prev_30d} sub={`${d.unique_visitors_30d} different people`} />
        <Kpi icon={<DollarSign className="h-5 w-5" />} color="#059669" label="Revenue tracked" value={money(d.revenue_30d_cents)} now={d.revenue_30d_cents} prev={d.revenue_prev_30d_cents} sub={d.purchases_30d > 0 ? `${d.purchases_30d} purchases · avg ${money(d.avg_ticket_cents)}` : "from desk purchase awards"} />
        <Kpi icon={<UserPlus className="h-5 w-5" />} color="#7c3aed" label="New members" value={d.new_members_30d} now={d.new_members_30d} prev={d.new_members_prev_30d} sub={`${d.members_total.toLocaleString()} total`} />
        <Kpi icon={<Gift className="h-5 w-5" />} color="#d97706" label="Redemptions" value={d.redemptions_30d} now={d.redemptions_30d} prev={d.redemptions_prev_30d} sub={`${d.points_redeemed_30d.toLocaleString()} pts cashed in`} />
      </div>

      {/* ── 2. Social pillars ───────────────────────────────────── */}
      <div className="rounded-2xl border-2 border-zinc-200 bg-white overflow-hidden shadow-sm">
        <div className="px-5 pt-4 pb-3 flex items-end justify-between gap-3 flex-wrap border-b-2 border-zinc-100">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primary }}>Three pillars</div>
            <h3 className="text-lg font-black leading-tight">Social proof the app earned</h3>
            <p className="text-[12px] text-zinc-500">Members tap “I did it”, the desk verifies, points go out. Only verified ones count here.</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black tabular-nums leading-none">{socialTotal}</div>
            <div className="text-[11px] font-bold text-zinc-500 mt-1 flex items-center justify-end gap-2">verified · all time <Delta now={social30} prev={socialPrev} /></div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-zinc-100">
          {pillars.map(({ name, color, soft, icon, p }) => (
            <div key={name} className="p-5 relative">
              <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
              <div className="flex items-center gap-2.5">
                <span className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: soft, color }}>{icon}</span>
                <div className="text-[13px] font-extrabold text-zinc-800 leading-tight">{name}</div>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <div className="text-4xl font-black tabular-nums leading-none" style={{ color }}>{p?.verified_total ?? 0}</div>
                <div className="pb-0.5">
                  <div className="text-[13px] font-extrabold text-zinc-800 tabular-nums">+{p?.verified_30d ?? 0} <span className="font-semibold text-zinc-500">this month</span></div>
                  <Delta now={p?.verified_30d ?? 0} prev={p?.verified_prev_30d ?? 0} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {(p?.pending ?? 0) > 0
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-zinc-900 px-2 py-0.5 text-[11px] font-black"><Clock className="h-3 w-3" /> {p!.pending} waiting for desk verify</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 text-[11px] font-bold">Nothing pending</span>}
                {(p?.rejected ?? 0) > 0 && <span className="text-[11px] font-semibold text-zinc-400">{p!.rejected} rejected</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Momentum ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primary }}>Momentum</div>
              <h3 className="text-lg font-black leading-tight">Last 12 weeks · <span className="tabular-nums">{total12.toLocaleString()}</span> {metric.replace("_", " ")}</h3>
            </div>
            <div className="flex gap-1">
              {(["visits", "new_members", "bookings", "redemptions"] as const).map(k => (
                <button key={k} type="button" onClick={() => setMetric(k)}
                  className={cn("rounded-full px-3 h-8 text-[12px] font-extrabold border-2 transition", metric === k ? "text-white border-transparent" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300")}
                  style={metric === k ? { background: primary } : undefined}>
                  {k === "new_members" ? "New members" : k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="h-40 flex items-end gap-1.5 border-b-2 border-zinc-200 pb-px">
            {weeks.map((w, i) => {
              const h = Math.max(3, Math.round((w[metric] / max) * 100));
              const last = i === weeks.length - 1;
              return (
                <div key={w.week_start} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end" title={`Week of ${new Date(w.week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${w[metric]}`}>
                  <div className={cn("text-[10px] font-extrabold tabular-nums", last ? "text-zinc-900" : "text-zinc-400 opacity-0 group-hover:opacity-100 transition")}>{w[metric]}</div>
                  <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: last ? primary : `${primary}${w[metric] ? "80" : "22"}` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] font-semibold text-zinc-500 mt-1.5">
            <span>{weeks[0] ? new Date(weeks[0].week_start).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
            <span>this week</span>
          </div>
        </div>

        {/* busiest days */}
        <div className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: primary }}>When they come</div>
          <h3 className="text-lg font-black leading-tight">Visits by weekday</h3>
          <p className="text-[11px] text-zinc-500 mb-3">Last 8 weeks of check-ins.</p>
          <div className="space-y-1.5">
            {d.weekday_visits.map((n, i) => {
              const top = n === wdMax && n > 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className={cn("w-8 text-[12px] font-extrabold", top ? "text-zinc-900" : "text-zinc-500")}>{DOW[i]}</span>
                  <div className="flex-1 h-5 rounded-md bg-zinc-100 overflow-hidden">
                    <div className="h-full rounded-md" style={{ width: `${Math.max(n ? 6 : 0, (n / wdMax) * 100)}%`, background: top ? primary : `${primary}80` }} />
                  </div>
                  <span className={cn("w-6 text-right text-[12px] font-extrabold tabular-nums", top ? "text-zinc-900" : "text-zinc-500")}>{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 4. Three columns ────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Col title="Members" sub="Who's in the program" color={primary}>
          <Row icon={<Users className="h-4 w-4" />} label="Total members" value={d.members_total} sub={`${d.active_30d} visited this month`} />
          <Row icon={<Repeat className="h-4 w-4" />} label="Came back" value={`${repeatPct}%`} sub={`${d.repeat_members} of ${d.visited_ever} visitors, 2+ visits`} />
          <Row icon={<Crown className="h-4 w-4" />} label="Paid members" value={d.paid_members} sub={d.paid_members ? "active passes" : "none yet"} />
          <Row icon={<Bell className="h-4 w-4" />} label="Push reachable" value={`${pushPct}%`} sub={`${d.push_opted_in} phones opted in`} />
          <Row icon={<Cake className="h-4 w-4" />} label="Birthdays on file" value={`${bdayPct}%`} sub={`${d.birthdays_on_file} auto-gifted yearly`} />
          {d.lapsed_60d > 0 && <Row icon={<Clock className="h-4 w-4" />} label="Lapsed 60d+" value={d.lapsed_60d} sub="win-back list below" tone="warn" />}
        </Col>
        <Col title="Game layer" sub="Reasons to come back sooner" color="#7c3aed">
          <Row icon={<Sparkles className="h-4 w-4" />} label="Wheel spins" value={d.spins_30d} sub={<><Delta now={d.spins_30d} prev={d.spins_prev_30d} /> · {d.spin_points_30d.toLocaleString()} pts won</>} />
          <Row icon={<Gift className="h-4 w-4" />} label="Gifts issued" value={d.gifts_issued_30d} sub={`${d.gifts_revealed_30d} opened · ${d.gifts_redeemed_30d} picked up`} />
          {d.gifts_waiting > 0 && <Row icon={<Clock className="h-4 w-4" />} label="Gifts not picked up" value={d.gifts_waiting} sub="show on the member's desk card" tone="warn" />}
          <Row icon={<Coins className="h-4 w-4" />} label="Points awarded" value={d.points_awarded_30d.toLocaleString()} sub={`${d.points_redeemed_30d.toLocaleString()} redeemed`} />
          <Row icon={<Coins className="h-4 w-4" />} label="Points outstanding" value={d.points_outstanding.toLocaleString()} sub="on member balances" />
        </Col>
        <Col title="Desk captured" sub="What staff turned into data" color="#0891b2">
          <Row icon={<CalendarClock className="h-4 w-4" />} label="Bookings" value={d.bookings_30d} sub={<><Delta now={d.bookings_30d} prev={d.bookings_prev_30d} /> · {d.bookings_upcoming} upcoming</>} />
          {d.bookings_pending > 0 && <Row icon={<Clock className="h-4 w-4" />} label="Awaiting confirm" value={d.bookings_pending} sub="Bookings tab" tone="warn" />}
          {d.bookings_noshow_30d > 0 && <Row icon={<Clock className="h-4 w-4" />} label="No-shows" value={d.bookings_noshow_30d} sub="last 30 days" tone="bad" />}
          <Row icon={<FileSignature className="h-4 w-4" />} label="Waivers signed" value={d.waivers_30d} sub={`${d.waivers_total} on file · searchable`} />
          <Row icon={<Star className="h-4 w-4" />} label="Social verified" value={social30} sub={d.social_pending_total > 0 ? `${d.social_pending_total} waiting on the desk` : "nothing waiting"} tone={d.social_pending_total > 0 ? "warn" : undefined} />
        </Col>
      </div>

      {/* ── 5. Most redeemed ────────────────────────────────────── */}
      {d.top_rewards.length > 0 && (
        <div className="rounded-2xl border-2 border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-[15px] font-black">What they redeem · last 90 days</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {d.top_rewards.map((r, i) => (
              <div key={r.name + i} className={cn("rounded-xl border-2 overflow-hidden bg-white", i === 0 ? "border-amber-400" : "border-zinc-200")}>
                <div className="relative aspect-[16/9] bg-zinc-100">
                  {r.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={optimizedUrl(r.image_url, 240)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <div className="absolute inset-0 flex items-center justify-center"><Gift className="h-6 w-6 text-zinc-400" /></div>}
                  <span className={cn("absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-[10px] font-black", i === 0 ? "bg-amber-400 text-zinc-900" : "bg-white/90 text-zinc-700")}>#{i + 1}</span>
                </div>
                <div className="px-2.5 py-2">
                  <div className="text-[12px] font-extrabold leading-tight line-clamp-2 min-h-[2.4em]">{r.name}</div>
                  <div className="text-[11px] font-bold text-zinc-500 tabular-nums">{r.n}× redeemed</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, color, label, value, now, prev, sub }: { icon: React.ReactNode; color: string; label: string; value: number | string; now: number; prev: number; sub: string }) {
  return (
    <div className="rounded-2xl border-2 border-zinc-200 bg-white p-4 shadow-sm relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <span className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, color }}>{icon}</span>
        <Delta now={now} prev={prev} />
      </div>
      <div className="mt-3 text-3xl font-black tabular-nums leading-none">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] font-black uppercase tracking-wider text-zinc-700 mt-1.5">{label} <span className="text-zinc-400 font-bold normal-case tracking-normal">· 30 days</span></div>
      <div className="text-[11px] text-zinc-500 truncate">{sub}</div>
    </div>
  );
}

function Col({ title, sub, color, children }: { title: string; sub: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-zinc-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b-2 border-zinc-100" style={{ boxShadow: `inset 4px 0 0 0 ${color}` }}>
        <div className="text-[13px] font-black text-zinc-900">{title}</div>
        <div className="text-[11px] text-zinc-500">{sub}</div>
      </div>
      <div className="divide-y divide-zinc-100">{children}</div>
    </div>
  );
}

function Row({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: number | string; sub?: React.ReactNode; tone?: "warn" | "bad" }) {
  return (
    <div className={cn("px-4 py-2.5 flex items-center gap-3", tone === "warn" && "bg-amber-50", tone === "bad" && "bg-rose-50")}>
      <span className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", tone === "warn" ? "bg-amber-400 text-zinc-900" : tone === "bad" ? "bg-rose-500 text-white" : "bg-zinc-100 text-zinc-600")}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-extrabold text-zinc-800 leading-tight">{label}</div>
        {sub && <div className="text-[11px] text-zinc-500 truncate flex items-center gap-1">{sub}</div>}
      </div>
      <div className="text-xl font-black tabular-nums shrink-0">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
