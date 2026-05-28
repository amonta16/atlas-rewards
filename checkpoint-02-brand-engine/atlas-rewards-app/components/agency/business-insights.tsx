"use client";
import { useEffect, useState } from "react";
import { Users, UserPlus, Activity, Coins, Gift, DollarSign, Star, ChevronDown, TrendingUp, Repeat, Sparkles, AlertOctagon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/ui/stat-card";
import { MiniChart } from "./mini-chart";
import type { Business } from "@/lib/types/database";

type Analytics = {
  total_members: number; new_members: number; active_members: number; dormant_members: number;
  avg_ltv_points: number; points_issued: number; points_redeemed: number;
  transactions: number; reviews_earned: number; referrals: number;
  revenue_cents: number; purchase_count: number; redemptions: number;
};

type DailyRow = { day: string; points_issued: number; points_redeemed: number; revenue_cents: number; transactions: number };
type TopMember = { membership_id: string; member_name: string; member_email: string; points_balance: number; lifetime_points: number; tier: string; visit_count: number };

const PERIODS = [{ days: 7, label: "Last 7 days" }, { days: 30, label: "Last 30 days" }, { days: 90, label: "Last 90 days" }];

export function BusinessInsights({ business }: { business: Business }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [top, setTop] = useState<TopMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const [statsRes, dailyRes, topRes] = await Promise.all([
        supabase.rpc("business_analytics", { p_business_id: business.id, p_days: days }),
        supabase.rpc("business_daily_activity", { p_business_id: business.id, p_days: days }),
        supabase.rpc("top_members", { p_business_id: business.id, p_limit: 5 }),
      ]);
      if (cancelled) return;
      setStats(statsRes.data as Analytics | null);
      setDaily((dailyRes.data ?? []) as DailyRow[]);
      setTop((topRes.data ?? []) as TopMember[]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [business.id, days]);

  const primary = business.brand_colors.primary;
  const dollars = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (loading || !stats) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  // CP-26 ROI defenders — computed from existing analytics so we don't need
  // any new SQL. The goal: surface numbers the merchant would lose if they
  // canceled Atlas, so the Insights tab is a retention tool too.
  const repeatVisitRate = stats.total_members > 0
    ? Math.min(99, (stats.transactions / stats.total_members) * 100)
    : 0;
  // Revenue per active member during this period — a quick "this is what
  // Atlas drove" headline.
  const revenuePerActive = stats.active_members > 0
    ? stats.revenue_cents / stats.active_members
    : 0;
  // Conservative "if you cancel" loss estimate: lifetime points × active
  // members × $0.01-per-point implied value. The point is to give the
  // merchant a defensible dollar figure they'd walk away from.
  const projectedLossCents = Math.round(stats.active_members * stats.avg_ltv_points * 1);
  // Activation rate — members who actually visited / total enrolled. Drops
  // are normal; a healthy program runs >40%.
  const activationRate = stats.total_members > 0
    ? Math.min(100, (stats.active_members / stats.total_members) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Insights</h3>
          <p className="text-sm text-muted-foreground mt-0.5">How this business is performing.</p>
        </div>
        <div className="relative">
          <select value={days} onChange={e => setDays(parseInt(e.target.value))}
            className="appearance-none pl-3 pr-8 h-9 rounded-md border text-sm bg-white">
            {PERIODS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <ChevronDown className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* ─── ROI Hero — "what Atlas earned you" ─────────────────────────── */}
      <div
        className="rounded-3xl p-6 text-white relative overflow-hidden shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${primary}cc 60%, ${primary} 100%)`,
        }}
      >
        <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-white/10 blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase bg-white/20 px-2.5 py-1 rounded-full mb-2">
            <Sparkles className="h-3 w-3" /> Atlas Impact
          </div>
          <h2 className="text-2xl font-extrabold leading-tight">
            Atlas drove <span className="underline decoration-white/50 decoration-2 underline-offset-4">{dollars(stats.revenue_cents)}</span> for this business
          </h2>
          <p className="text-white/90 text-sm mt-1">
            in the last {days} days, across {stats.transactions.toLocaleString()} visits
            from {stats.active_members.toLocaleString()} active members.
          </p>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <RoiTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Per active member"
              value={dollars(revenuePerActive)}
              foot={`${stats.active_members} active`}
            />
            <RoiTile
              icon={<Repeat className="h-4 w-4" />}
              label="Repeat visit rate"
              value={`${repeatVisitRate.toFixed(0)}%`}
              foot={`${stats.transactions} visits / ${stats.total_members} members`}
            />
            <RoiTile
              icon={<Activity className="h-4 w-4" />}
              label="Activation"
              value={`${activationRate.toFixed(0)}%`}
              foot={`${stats.active_members} of ${stats.total_members} engaged`}
            />
            <RoiTile
              icon={<AlertOctagon className="h-4 w-4" />}
              label="At risk if you cancel"
              value={dollars(projectedLossCents)}
              foot="loyalty equity walking out"
            />
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Revenue attributed" value={dollars(stats.revenue_cents)} tone="emerald" />
        <StatCard icon={<Users className="h-5 w-5" />}      label="Total members"      value={stats.total_members} tone="indigo" />
        <StatCard icon={<UserPlus className="h-5 w-5" />}   label="New members"        value={stats.new_members} tone="cyan" />
        <StatCard icon={<Activity className="h-5 w-5" />}   label="Active visits"      value={stats.transactions} tone="amber" />
        <StatCard icon={<Coins className="h-5 w-5" />}      label="Points issued"      value={stats.points_issued.toLocaleString()} tone="indigo" />
        <StatCard icon={<Gift className="h-5 w-5" />}       label="Rewards redeemed"   value={stats.redemptions} tone="rose" />
        <StatCard icon={<Star className="h-5 w-5" />}       label="Reviews earned"     value={stats.reviews_earned} tone="amber" />
        <StatCard icon={<UserPlus className="h-5 w-5" />}   label="Referrals"          value={stats.referrals} tone="cyan" />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold">Daily revenue</h4>
            <span className="text-xs text-muted-foreground">{dollars(stats.revenue_cents)} total</span>
          </div>
          <MiniChart values={daily.map(d => d.revenue_cents)} color={primary} height={96} />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{daily[0]?.day}</span><span>{daily[daily.length - 1]?.day}</span>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold">Daily transactions</h4>
            <span className="text-xs text-muted-foreground">{stats.transactions} total</span>
          </div>
          <MiniChart values={daily.map(d => d.transactions)} color="#10b981" height={96} />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{daily[0]?.day}</span><span>{daily[daily.length - 1]?.day}</span>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold">Points issued</h4>
            <span className="text-xs text-muted-foreground">{stats.points_issued.toLocaleString()} pts</span>
          </div>
          <MiniChart values={daily.map(d => d.points_issued)} color="#6366f1" height={96} />
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold">Points redeemed</h4>
            <span className="text-xs text-muted-foreground">{stats.points_redeemed.toLocaleString()} pts</span>
          </div>
          <MiniChart values={daily.map(d => d.points_redeemed)} color="#f43f5e" height={96} />
        </div>
      </div>

      {/* Top members */}
      <div className="rounded-2xl border bg-white">
        <div className="p-5 border-b">
          <h4 className="text-sm font-bold">Top members by lifetime points</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Your most valuable customers.</p>
        </div>
        <div className="divide-y">
          {top.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No members yet.</div>
          ) : top.map((m, i) => (
            <div key={m.membership_id} className="px-5 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-white"
                style={{ background: primary }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{m.member_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{m.member_email} · {m.tier}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{m.lifetime_points.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">{m.visit_count} visits</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Health indicators */}
      <div className="rounded-2xl border bg-white p-5">
        <h4 className="text-sm font-bold mb-3">Member health</h4>
        <div className="grid grid-cols-3 gap-3">
          <Health label="Active" value={stats.active_members} color="emerald" />
          <Health label="Dormant" value={stats.dormant_members} color="amber" />
          <Health label="Avg lifetime pts" value={stats.avg_ltv_points.toLocaleString()} color="indigo" />
        </div>
      </div>
    </div>
  );
}

function Health({ label, value, color }: { label: string; value: number | string; color: string }) {
  const bgMap: Record<string, string> = { emerald: "bg-emerald-50", amber: "bg-amber-50", indigo: "bg-indigo-50" };
  const textMap: Record<string, string> = { emerald: "text-emerald-700", amber: "text-amber-700", indigo: "text-indigo-700" };
  return (
    <div className={`rounded-xl ${bgMap[color]} p-3`}>
      <div className={`text-xs font-semibold ${textMap[color]}`}>{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function RoiTile({
  icon, label, value, foot,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <div className="rounded-2xl bg-white/15 backdrop-blur-sm p-3 ring-1 ring-white/20">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-extrabold tracking-wider text-white/85">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-extrabold mt-1.5 tabular-nums">{value}</div>
      <div className="text-[10px] text-white/75 mt-0.5">{foot}</div>
    </div>
  );
}
