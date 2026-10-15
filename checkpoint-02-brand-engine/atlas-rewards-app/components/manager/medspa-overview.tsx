"use client";
/**
 * MedspaOverview — CP-208 · the med spa manager's home (the Dermis model)
 *
 * What the owner sees first: headline numbers (patients, members, visits,
 * app sales), a 12-month trend, and a live activity feed — plus the
 * "Marketing pulse" strip, which is Atlas's own spice: the always-on
 * engines (recall, automated offers) and the Marketing tab in one glance.
 *
 * Data: ONE RPC, medspa_overview (cp208 SQL) — manager/agency gated, name
 * resolution identical to business_recent_activity. Refetches on every
 * desk-live tick so the feed is a real pulse, not a page-load snapshot.
 */
import { useEffect, useMemo, useState } from "react";
import { Users, Crown, Sparkles, ShoppingBag, BellRing, Megaphone, ChevronRight, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDeskLive } from "@/lib/desk-live";
import { cn } from "@/lib/utils";
import { readMedspaConfig } from "@/lib/medspa";
import type { Business } from "@/lib/types/database";

type Overview = {
  patients: number; members_paid: number;
  visits_total: number; visits_30d: number;
  sales_cents_total: number; sales_cents_30d: number;
  auto_offers_active: number;
  monthly: { month: string; visits: number; sales_cents: number; joins: number }[];
  activity: { at: string; kind: "signup" | "treatment" | "order"; who: string; detail: string | null; amount_cents: number | null }[];
};

type Metric = "visits" | "sales" | "joins";
const METRICS: { id: Metric; label: string }[] = [
  { id: "visits", label: "Visits" },
  { id: "sales", label: "App sales" },
  { id: "joins", label: "New patients" },
];

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month: "short" });

export function MedspaOverview({ business, whoami, openMarketing, openOffers, openPatients, openShop, openReports, openBuilder, demo }: {
  business: Business;
  whoami: string | null;
  openMarketing: () => void;
  openOffers: () => void;
  openPatients: () => void;
  openShop: () => void;
  /** CP-209: Reports tab + App builder tab. */
  openReports?: () => void;
  openBuilder?: () => void;
  /** Preloaded data for previews/demos — skips the RPC. */
  demo?: Overview;
}) {
  const live = useDeskLive();
  const [data, setData] = useState<Overview | null>(demo ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("visits");
  const primary = business.brand_colors.primary;
  const cfg = useMemo(() => readMedspaConfig(business.medspa_config), [business.medspa_config]);

  useEffect(() => {
    if (demo) return;
    let off = false;
    createClient().rpc("medspa_overview", { p_business_id: business.id }).then(({ data, error }) => {
      if (off) return;
      if (error) setErr(error.message);
      else setData(data as Overview);
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id, live.tick]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = whoami?.split(" ")[0] ?? null;

  const series = (data?.monthly ?? []).map((m) => metric === "visits" ? m.visits : metric === "sales" ? m.sales_cents / 100 : m.joins);
  const total30 = metric === "visits" ? `${data?.visits_30d ?? 0} in the last 30 days`
    : metric === "sales" ? `${money(data?.sales_cents_30d ?? 0)} in the last 30 days`
    : `${(data?.monthly ?? []).slice(-1)[0]?.joins ?? 0} this month`;

  const stats = [
    { label: "Patients", value: data?.patients, sub: "in your app", icon: <Users className="h-4 w-4" />, onClick: openPatients },
    { label: "Active members", value: data?.members_paid, sub: "paying monthly", icon: <Crown className="h-4 w-4" />, onClick: openPatients },
    { label: "Total visits", value: data?.visits_total, sub: `${data?.visits_30d ?? 0} in 30 days`, icon: <Sparkles className="h-4 w-4" />, onClick: openPatients },
    { label: "App sales", value: data == null ? undefined : money(data.sales_cents_total), sub: `${money(data?.sales_cents_30d ?? 0)} in 30 days`, icon: <ShoppingBag className="h-4 w-4" />, onClick: openShop },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-zinc-900">{greet}{first ? `, ${first}` : ""} 👋</h1>
          <p className="text-sm text-zinc-500 mt-0.5">A live pulse on {business.name}&apos;s app.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {openBuilder && (
            <button type="button" onClick={openBuilder} className="rounded-full bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50">
              Edit your app
            </button>
          )}
          {openReports && (
            <button type="button" onClick={openReports} className="rounded-full px-3.5 py-2 text-xs font-bold text-white shadow" style={{ background: primary }}>
              Monthly report
            </button>
          )}
        </div>
      </div>

      {err && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Couldn&apos;t load the overview: {err}</div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {stats.map((s) => (
              <button key={s.label} type="button" onClick={s.onClick}
                className="rounded-2xl bg-white p-4 text-left ring-1 ring-black/5 shadow-sm hover:shadow transition">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{s.label}</span>
                  <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: `${primary}14`, color: primary }}>{s.icon}</span>
                </div>
                <div className="mt-2 text-[28px] font-black leading-none text-zinc-900 tabular-nums">{s.value ?? "—"}</div>
                <div className="mt-1 text-[12px] text-zinc-500">{s.sub}</div>
              </button>
            ))}
          </div>

          {/* 12-month trend */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-zinc-900">{METRICS.find((m) => m.id === metric)!.label}, last 12 months</div>
                <div className="text-[12px] text-zinc-500">{total30}</div>
              </div>
              <div className="flex rounded-xl bg-zinc-100 p-1 gap-1">
                {METRICS.map((m) => (
                  <button key={m.id} type="button" onClick={() => setMetric(m.id)}
                    className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                      metric === m.id ? "bg-white text-zinc-900 shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <TrendChart series={series} labels={(data?.monthly ?? []).map((m) => monthLabel(m.month))} color={primary} money={metric === "sales"} />
          </div>

          {/* Marketing pulse — Atlas's spice on the Dermis home */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold text-zinc-900">Marketing pulse</div>
              <button type="button" onClick={openMarketing} className="flex items-center gap-1 text-xs font-bold" style={{ color: primary }}>
                Open Marketing <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              <PulseCard
                icon={<BellRing className="h-4 w-4" />}
                title="Recall messages"
                on={cfg.recall.enabled}
                body={cfg.recall.enabled
                  ? `Patients hear from you ${cfg.recall.lead_days} days before they're due.`
                  : "Off — due patients aren't being nudged."}
                onClick={openMarketing} primary={primary}
              />
              <PulseCard
                icon={<Wand2 className="h-4 w-4" />}
                title="Automated offers"
                on={(data?.auto_offers_active ?? 0) > 0}
                body={data == null ? "…" : data.auto_offers_active > 0
                  ? `${data.auto_offers_active} running — birthdays, holidays, win-backs.`
                  : "None running yet. Turn on a holiday offer."}
                onClick={openOffers} primary={primary}
              />
              <PulseCard
                icon={<Megaphone className="h-4 w-4" />}
                title="Ad campaigns"
                on={false} onLabel="Planning"
                body="Paid ads that feed the app — plan them in Marketing."
                onClick={openMarketing} primary={primary}
              />
            </div>
          </div>
        </div>

        {/* Live activity feed */}
        <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm lg:max-h-[720px] flex flex-col">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: primary }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: primary }} />
            </span>
            <div className="text-sm font-extrabold text-zinc-900">Live activity</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
            {data == null && <div className="px-2 py-6 text-center text-xs text-zinc-400">Loading…</div>}
            {data?.activity.length === 0 && <div className="px-2 py-6 text-center text-xs text-zinc-400">Signups, treatments and orders will show up here.</div>}
            {data?.activity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl bg-zinc-50 px-3 py-2.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: a.kind === "order" ? primary : a.kind === "treatment" ? "#52525b" : "#a1a1aa" }}>
                  {(a.who || "G")[0].toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-zinc-900 truncate">{a.who}</div>
                  <div className="text-[12px] text-zinc-600 leading-snug">
                    {a.kind === "signup" ? "Signed up"
                      : a.kind === "treatment" ? (a.detail ?? "Treatment logged")
                      : `Bought ${a.detail ?? "an item"}${a.amount_cents && !(a.detail ?? "").includes("$") ? ` · ${money(a.amount_cents)}` : ""}`}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">
                    {new Date(a.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, {new Date(a.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PulseCard({ icon, title, on, onLabel, body, onClick, primary }: {
  icon: React.ReactNode; title: string; on: boolean; onLabel?: string; body: string; onClick: () => void; primary: string;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl bg-zinc-50 p-3 text-left ring-1 ring-zinc-200/70 hover:bg-zinc-100 transition">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-zinc-800">
          <span style={{ color: primary }}>{icon}</span>{title}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
          onLabel ? "bg-zinc-200 text-zinc-600" : on ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
          {onLabel ?? (on ? "On" : "Off")}
        </span>
      </div>
      <div className="mt-1.5 text-[12px] leading-snug text-zinc-500">{body}</div>
    </button>
  );
}

/** Hand-rolled area chart — no dependency, brand colored, all-zero safe. */
function TrendChart({ series, labels, color, money: isMoney }: { series: number[]; labels: string[]; color: string; money: boolean }) {
  const W = 620, H = 180, PAD = 8, BOT = 22;
  const max = Math.max(1, ...series);
  const n = Math.max(2, series.length);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (n - 1);
  const y = (v: number) => PAD + (1 - v / max) * (H - PAD * 2 - BOT);
  const pts = series.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${PAD},${H - BOT} ${pts} ${W - PAD},${H - BOT}`;
  const last = series.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="12-month trend">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={PAD} x2={W - PAD} y1={y(max * f)} y2={y(max * f)} stroke="#e4e4e7" strokeDasharray="3 5" strokeWidth="1" />
      ))}
      {series.length > 0 && (
        <>
          <polygon points={area} fill={color} opacity="0.12" />
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(last)} cy={y(series[last])} r="4" fill={color} stroke="#fff" strokeWidth="2" />
          <text x={Math.min(x(last), W - 40)} y={Math.max(14, y(series[last]) - 10)} textAnchor="middle" fontSize="11" fontWeight="700" fill="#18181b">
            {isMoney ? `$${Math.round(series[last]).toLocaleString()}` : series[last]}
          </text>
        </>
      )}
      {labels.map((l, i) => (i % 2 === 0 ? <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="#a1a1aa">{l}</text> : null))}
    </svg>
  );
}
