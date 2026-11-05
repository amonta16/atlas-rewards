"use client";
/**
 * Desk → Home (managers): three headline numbers, two area charts and the
 * Live Activity Feed. One RPC (medspa_overview), refreshed every 30 seconds
 * so the feed is a real pulse. The demo clinic adds sample activity instead.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DeskApi, Overview } from "@/lib/desk-api";
import { IcRefresh, IcSpark, IcUser } from "../icons";

const money = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const feedTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleDateString("en-US", { year: "2-digit" }).slice(-2)}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
};
type Item = Overview["activity"][number] & { key: string };

const SAMPLE: Omit<Overview["activity"][number], "at">[] = [
  { kind: "order", who: "Claire", detail: "HydraFacial package", amount_cents: 49700 },
  { kind: "signup", who: "Sophie", detail: null, amount_cents: null },
  { kind: "order", who: "Rebecca", detail: "BOTOX® Cosmetic", amount_cents: 30000 },
  { kind: "treatment", who: "Amy", detail: "Alma Harmony Laser Facial", amount_cents: null },
  { kind: "order", who: "Dana", detail: "Alastin Gentle Cleanser", amount_cents: 5800 },
  { kind: "signup", who: "Maya", detail: null, amount_cents: null },
  { kind: "order", who: "Elena", detail: "Glow Club membership", amount_cents: 9900 },
];

export function HomeView({ api, demo }: { api: DeskApi; demo: boolean }) {
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [feed, setFeed] = useState<Item[]>([]);
  const n = useRef(0);

  useEffect(() => {
    let off = false;
    const load = () => api.overview().then((x) => {
      if (off) return;
      setD(x);
      setFeed((prev) => (demo && prev.length ? prev : x.activity.map((a, i) => ({ ...a, key: `${a.at}-${i}` }))));
    }).catch((e) => { if (!off) setErr((e as Error).message); });
    load();
    if (demo) return () => { off = true; };
    const t = setInterval(load, 30_000);
    return () => { off = true; clearInterval(t); };
  }, [api, demo]);

  useEffect(() => {
    if (!demo) return;
    const t = setInterval(() => {
      const s = SAMPLE[n.current++ % SAMPLE.length];
      setFeed((prev) => [{ ...s, at: new Date().toISOString(), key: `s${n.current}` }, ...prev].slice(0, 12));
    }, 6000);
    return () => clearInterval(t);
  }, [demo]);

  if (err) return <p className="rounded-[14px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  if (!d) return <div className="h-80 animate-pulse rounded-[16px] bg-white/70" />;

  return (
    <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
      <Kpi value={d.patients.toLocaleString("en-US")} label="Patients" Icon={IcUser} />
      <Kpi value={d.members_paid.toLocaleString("en-US")} label="Active Memberships" Icon={IcRefresh} />
      <Kpi value={d.visits_total.toLocaleString("en-US")} label="Total Visits" Icon={IcSpark} className="md:col-span-2 xl:col-span-1" />

      <div className="min-w-0 space-y-3.5 md:col-span-2">
        <ChartCard title="Visits over time" monthly={d.monthly} pick={(m) => m.visits} sub={`${d.visits_30d.toLocaleString("en-US")} in the last 30 days`} />
        <ChartCard title="App sales over time" monthly={d.monthly} pick={(m) => m.sales_cents / 100} format={(v) => `$${Math.round(v).toLocaleString("en-US")}`} sub={`${money(d.sales_cents_30d)} in the last 30 days`} />
      </div>

      <section className={`${card} flex min-h-[360px] flex-col p-4 md:col-span-2 xl:col-span-1 xl:max-h-[664px]`}>
        <h2 className="flex items-center gap-2 px-1 text-[13.5px] font-semibold">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
          Live Activity Feed
        </h2>
        <ul className="no-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {feed.length === 0 && <li className="py-10 text-center text-[13.5px] text-sub">Sign-ups, treatments and purchases show up here.</li>}
          {feed.map((a) => (
            <li key={a.key} className="animate-rise rounded-[10px] bg-[#F4F5F6] px-3.5 py-3">
              <p className="text-[13px] font-semibold">{a.who}</p>
              <p className="mt-0.5 text-[13px] text-[#3F4450]">
                {a.kind === "signup" ? "Signed up" : a.kind === "treatment" ? `Had ${a.detail ?? "a treatment"}` : `Purchased ${a.detail ?? "an item"}${a.amount_cents ? ` for ${money(a.amount_cents)}` : ""}`}
              </p>
              <p className="mt-0.5 text-[12.5px] font-semibold">{feedTime(a.at)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ value, label, Icon, className = "" }: { value: string; label: string; Icon: typeof IcUser; className?: string }) {
  return (
    <div className={`${card} relative p-4 ${className}`}>
      <span className="absolute right-3.5 top-3.5 grid h-7 w-7 place-items-center rounded-full bg-[#F4F5F6] text-faint"><Icon className="h-3.5 w-3.5" /></span>
      <p className="text-[24px] font-bold leading-tight tracking-[-0.02em] tabular-nums">{value}</p>
      <p className="mt-0.5 text-[12.5px] text-sub">{label}</p>
    </div>
  );
}

function ChartCard({ title, sub, monthly, pick, format }: { title: string; sub: string; monthly: Overview["monthly"]; pick: (m: Overview["monthly"][number]) => number; format?: (v: number) => string }) {
  const [range, setRange] = useState(12);
  const rows = monthly.slice(-range);
  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[13.5px] font-semibold italic">{title}</h2><p className="text-[12px] text-sub">{sub}</p></div>
        <select aria-label={`${title} range`} value={range} onChange={(e) => setRange(Number(e.target.value))} className="h-8 rounded-[8px] border border-line bg-white px-2 text-[12.5px] outline-none">
          <option value={12}>Monthly · 12 months</option>
          <option value={6}>Monthly · 6 months</option>
        </select>
      </div>
      <AreaChart values={rows.map(pick)} labels={rows.map((m) => new Date(`${m.month}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }))} format={format} label={title} />
    </section>
  );
}

/** Smooth area chart: a hand-rolled SVG, brand colored, safe with all zeros. */
function AreaChart({ values, labels, format, label }: { values: number[]; labels: string[]; format?: (v: number) => string; label: string }) {
  const W = 680, H = 190, L = 34, R = 10, T = 12, B = 26;
  const max = Math.max(1, ...values);
  const pts = useMemo(() => values.map((v, i) => [L + (i * (W - L - R)) / Math.max(1, values.length - 1), T + (1 - v / max) * (H - T - B)] as const), [values, max]);
  if (values.length === 0) return null;
  const line = pts.reduce((path, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1];
    const c = (x - px) * 0.45;
    return `${path} C${px + c},${py} ${x - c},${y} ${x},${y}`;
  }, "");
  const base = H - B;
  const fmt = format ?? ((v: number) => Math.round(v).toLocaleString("en-US"));
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${label}: ${fmt(values[values.length - 1])} last month`}>
      <text x={L - 6} y={T + 4} textAnchor="end" fontSize="9.5" fill="#A3A7B0">{fmt(max)}</text>
      <text x={L - 6} y={base + 3} textAnchor="end" fontSize="9.5" fill="#A3A7B0">0</text>
      <line x1={L} x2={W - R} y1={T} y2={T} stroke="#E6E8EA" strokeWidth="1" />
      <path d={`${line} L${last[0]},${base} L${pts[0][0]},${base} Z`} fill="rgb(var(--p-rgb) / .24)" />
      <path d={line} fill="none" stroke="rgb(var(--p-rgb) / .8)" strokeWidth="2" strokeLinecap="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="rgb(var(--p-rgb))" stroke="#fff" strokeWidth="1" />)}
      {labels.map((l, i) => (labels.length <= 8 || i % 2 === 0 || i === labels.length - 1) && !(labels.length > 8 && i === labels.length - 2)
        ? <text key={i} x={pts[i][0]} y={H - 7} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"} fontSize="9.5" fill="#6E7380">{l}</text>
        : null)}
    </svg>
  );
}
