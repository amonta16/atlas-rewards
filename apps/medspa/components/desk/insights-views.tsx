"use client";
/**
 * Desk → Insights (managers): live numbers and monthly reports, moved from the
 * old portal. Same database functions (atlas_insights_v3, atlas_weekly_trend,
 * weekly_spin_insights, top_loyal_members, inactive_members, send_winback_v2,
 * business_monthly_report, get/set_report_recipients), and the report wording
 * comes from @atlas/core/reports/monthly, so it matches the email on the 1st.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { optimizedUrl } from "@atlas/core/img";
import { brandOf, changeText, fmtNum, fmtVal, kpisFor, monthName, prevMonthName, summary, takeaways, weeklySpinBlock, type MonthlyReport } from "@atlas/core/reports/monthly";
import type { DeskApi, InactivePatient, InsightsV3, InsightsWeek, ReportArchiveRow, ReportRecipients, TopPatient, WeeklySpin, WinbackReward, Winback } from "@/lib/desk-api";
import { formatPhone } from "@/lib/format";
import { IcGift, IcGoogle, IcHeart, IcMail, IcPeople } from "../icons";
import { Modal } from "./ui";

const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const input = "h-10 w-full rounded-[10px] bg-[#F4F5F6] px-3 text-[13.5px] outline-none placeholder:text-faint focus:ring-2 focus:ring-brand/30";
const money = (c: number) => { const n = c / 100; return n >= 10000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; };
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function InsightsView({ api, say, demo, clinic, initialTab, initialMonth }: {
  api: DeskApi; say: (t: string) => void; demo: boolean;
  clinic: { name: string; primary: string; logoUrl: string | null; heroUrl: string | null };
  initialTab: "live" | "reports"; initialMonth: string | null;
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="space-y-3.5">
      <div className="inline-flex rounded-full bg-white p-1 shadow-card" role="tablist" aria-label="Insights view">
        {([["live", "Live insights"], ["reports", "Monthly reports"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-8 rounded-full px-4 text-[13px] font-semibold ${tab === id ? "bg-ink text-white" : "text-sub"}`}>{label}</button>
        ))}
      </div>
      {tab === "live" ? <LiveInsights api={api} say={say} /> : <Reports api={api} say={say} demo={demo} clinic={clinic} initialMonth={initialMonth} />}
    </div>
  );
}

/* ───────────── Live insights ───────────── */

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!now && !prev) return <span className="text-[11.5px] text-faint">no change</span>;
  if (!prev) return <span className="text-[11.5px] font-semibold text-emerald-700">new</span>;
  const p = Math.round(((now - prev) / prev) * 100);
  if (p === 0) return <span className="text-[11.5px] text-sub">flat</span>;
  return <span className={`text-[11.5px] font-semibold ${p > 0 ? "text-emerald-700" : "text-red-600"}`}>{p > 0 ? "+" : ""}{p}%</span>;
}

function LiveInsights({ api, say }: { api: DeskApi; say: (t: string) => void }) {
  const [d, setD] = useState<{ data: InsightsV3; weeks: InsightsWeek[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.insights().then(setD).catch((e) => setErr((e as Error).message)); }, [api]);
  if (err) return <p className="rounded-[14px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  if (!d) return <div className="h-80 animate-pulse rounded-[16px] bg-white/70" />;
  const v = d.data;
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi value={v.visits_30d.toLocaleString("en-US")} label="Visits · 30 days" now={v.visits_30d} prev={v.visits_prev_30d} sub={`${v.unique_visitors_30d.toLocaleString("en-US")} different patients`} />
        <Kpi value={money(v.revenue_30d_cents)} label="Revenue tracked · 30 days" now={v.revenue_30d_cents} prev={v.revenue_prev_30d_cents} sub={v.purchases_30d ? `${v.purchases_30d} purchases · avg ${money(v.avg_ticket_cents)}` : "From purchases added at the desk"} />
        <Kpi value={v.new_members_30d.toLocaleString("en-US")} label="New patients · 30 days" now={v.new_members_30d} prev={v.new_members_prev_30d} sub={`${v.members_total.toLocaleString("en-US")} total`} />
        <Kpi value={v.redemptions_30d.toLocaleString("en-US")} label="Rewards redeemed · 30 days" now={v.redemptions_30d} prev={v.redemptions_prev_30d} sub={`${v.points_redeemed_30d.toLocaleString("en-US")} points used`} />
      </div>

      <SocialProof v={v} />

      <div className="grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Momentum weeks={d.weeks} />
        <Weekdays counts={v.weekday_visits} />
      </div>

      <div className="grid gap-3.5 md:grid-cols-3">
        <Column title="Patients" sub="Who's in your app">
          <Row label="Total patients" value={v.members_total} sub={`${v.active_30d} visited this month`} />
          <Row label="Came back" value={`${pct(v.repeat_members, v.visited_ever)}%`} sub={`${v.repeat_members} of ${v.visited_ever} visitors, 2+ visits`} />
          <Row label="Paying members" value={v.paid_members} sub={v.paid_members ? "Active memberships" : "None yet"} />
          <Row label="Push reachable" value={`${pct(v.push_opted_in, v.members_total)}%`} sub={`${v.push_opted_in} phones opted in`} />
          <Row label="Birthdays on file" value={`${pct(v.birthdays_on_file, v.members_total)}%`} sub={`${v.birthdays_on_file} patients`} />
          {v.lapsed_60d > 0 && <Row label="Away 60+ days" value={v.lapsed_60d} sub="Win them back below" warn />}
        </Column>
        <Column title="Rewards & gifts" sub="Reasons to come back sooner">
          <Row label="Gifts sent" value={v.gifts_issued_30d} sub={`${v.gifts_revealed_30d} opened · ${v.gifts_redeemed_30d} used`} />
          {v.gifts_waiting > 0 && <Row label="Gifts not used yet" value={v.gifts_waiting} sub="Show on the patient's desk panel" warn />}
          <Row label="Points earned" value={v.points_awarded_30d.toLocaleString("en-US")} sub={`${v.points_redeemed_30d.toLocaleString("en-US")} redeemed`} />
          <Row label="Points outstanding" value={v.points_outstanding.toLocaleString("en-US")} sub="On patient balances" />
          {(v.spins_30d > 0 || v.spins_prev_30d > 0) && <Row label="Wheel spins" value={v.spins_30d} sub={<><Delta now={v.spins_30d} prev={v.spins_prev_30d} /> · {v.spin_points_30d.toLocaleString("en-US")} pts won</>} />}
        </Column>
        <Column title="At the desk" sub="What staff turned into data">
          <Row label="Reviews confirmed" value={v.social.reduce((s, p) => s + p.verified_30d, 0)} sub={v.social_pending_total > 0 ? `${v.social_pending_total} waiting on Check in` : "Nothing waiting"} warn={v.social_pending_total > 0} />
          {(v.bookings_30d > 0 || v.bookings_upcoming > 0) && <Row label="Bookings" value={v.bookings_30d} sub={`${v.bookings_upcoming} upcoming`} />}
          {v.bookings_noshow_30d > 0 && <Row label="No-shows" value={v.bookings_noshow_30d} sub="Last 30 days" warn />}
          {v.waivers_total > 0 && <Row label="Waivers signed" value={v.waivers_30d} sub={`${v.waivers_total} on file`} />}
          <Row label="Purchases added" value={v.purchases_30d} sub="Last 30 days" />
        </Column>
      </div>

      <WeeklySpinCard api={api} />
      <TopRewards rows={v.top_rewards} />
      <div className="grid min-w-0 gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <TopPatients api={api} />
        <Inactive api={api} say={say} />
      </div>
    </div>
  );
}

function Kpi({ value, label, now, prev, sub }: { value: string; label: string; now: number; prev: number; sub: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-start justify-between gap-2"><p className="text-[24px] font-bold leading-tight tracking-[-0.02em] tabular-nums">{value}</p><Delta now={now} prev={prev} /></div>
      <p className="mt-0.5 text-[12.5px] text-sub">{label}</p>
      <p className="mt-1 truncate text-[12px] text-faint">{sub}</p>
    </div>
  );
}

const PILLARS = { google: { name: "Google reviews", Icon: IcGoogle }, instagram: { name: "Instagram follows", Icon: IcHeart }, facebook: { name: "Facebook follows", Icon: IcPeople } } as const;

/** Google always shows; Instagram / Facebook only if the clinic ever collected any (the desk confirms Google only). */
function SocialProof({ v }: { v: InsightsV3 }) {
  const rows = (["google", "instagram", "facebook"] as const)
    .map((platform) => ({ platform, p: v.social.find((s) => s.platform === platform) }))
    .filter(({ platform, p }) => platform === "google" || (p?.verified_total ?? 0) + (p?.pending ?? 0) > 0);
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-[13.5px] font-semibold">Social proof the app earned</h2>
      <p className="text-[12px] text-sub">Patients say they did it, the desk confirms, points go out. Only confirmed ones count.</p>
      <div className={`mt-3 grid gap-2.5 ${rows.length > 1 ? "sm:grid-cols-3" : ""}`}>
        {rows.map(({ platform, p }) => {
          const { name, Icon } = PILLARS[platform];
          return (
            <div key={platform} className="flex flex-wrap items-center gap-3 rounded-[12px] bg-[#F7F8F8] p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white ring-1 ring-line"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{name}</span>
                <span className="block text-[12px] text-sub">+{p?.verified_30d ?? 0} this month · <Delta now={p?.verified_30d ?? 0} prev={p?.verified_prev_30d ?? 0} /></span>
              </span>
              <span className="text-right">
                <b className="block text-[22px] leading-none tabular-nums">{(p?.verified_total ?? 0).toLocaleString("en-US")}</b>
                {(p?.pending ?? 0) > 0 && <span className="mt-1 block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{p!.pending} to confirm</span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Metric = "visits" | "new_members" | "redemptions" | "bookings";
const METRIC: Record<Metric, string> = { visits: "Visits", new_members: "New patients", redemptions: "Redemptions", bookings: "Bookings" };

function Momentum({ weeks }: { weeks: InsightsWeek[] }) {
  const [m, setM] = useState<Metric>("visits");
  const options = (Object.keys(METRIC) as Metric[]).filter((k) => k !== "bookings" || weeks.some((w) => w.bookings > 0));
  const max = useMemo(() => Math.max(1, ...weeks.map((w) => w[m])), [weeks, m]);
  const total = useMemo(() => weeks.reduce((s, w) => s + w[m], 0), [weeks, m]);
  return (
    <section className={`${card} min-w-0 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-[13.5px] font-semibold">Last 12 weeks</h2><p className="text-[12px] text-sub">{total.toLocaleString("en-US")} {METRIC[m].toLowerCase()}</p></div>
        <select aria-label="Metric" value={m} onChange={(e) => setM(e.target.value as Metric)} className="h-8 rounded-[8px] border border-line bg-white px-2 text-[12.5px] outline-none">
          {options.map((k) => <option key={k} value={k}>{METRIC[k]}</option>)}
        </select>
      </div>
      <div className="mt-3 flex h-40 items-end gap-1.5 border-b border-line pb-px" role="img" aria-label={`${METRIC[m]} per week`}>
        {weeks.map((w, i) => {
          const last = i === weeks.length - 1;
          return (
            <div key={w.week_start} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${shortDate(w.week_start)}: ${w[m]}`}>
              <span className={`text-[10.5px] font-semibold tabular-nums ${last ? "text-ink" : "text-faint opacity-0 transition group-hover:opacity-100"}`}>{w[m]}</span>
              <div className={`w-full rounded-t-[5px] ${last ? "bg-brand" : "bg-brand/30"}`} style={{ height: `${Math.max(3, Math.round((w[m] / max) * 100))}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint"><span>{weeks[0] ? shortDate(weeks[0].week_start) : ""}</span><span>This week</span></div>
    </section>
  );
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function Weekdays({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-[13.5px] font-semibold">Visits by weekday</h2>
      <p className="text-[12px] text-sub">Last 8 weeks of check-ins</p>
      <ul className="mt-3 space-y-1.5">
        {counts.map((n, i) => (
          <li key={DOW[i]} className="flex items-center gap-2 text-[12.5px]">
            <span className={`w-8 ${n === max && n > 0 ? "font-semibold" : "text-sub"}`}>{DOW[i]}</span>
            <span className="h-[18px] flex-1 overflow-hidden rounded-[5px] bg-[#F4F5F6]"><span className={`block h-full rounded-[5px] ${n === max && n > 0 ? "bg-brand" : "bg-brand/40"}`} style={{ width: `${n ? Math.max(6, (n / max) * 100) : 0}%` }} /></span>
            <span className="w-7 text-right tabular-nums text-sub">{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Column({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-[13.5px] font-semibold">{title}</h2>
      <p className="text-[12px] text-sub">{sub}</p>
      <div className="mt-2 divide-y divide-line">{children}</div>
    </section>
  );
}
function Row({ label, value, sub, warn }: { label: string; value: number | string; sub?: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{label}</span>{sub && <span className={`block truncate text-[12px] ${warn ? "font-medium text-amber-800" : "text-sub"}`}>{sub}</span>}</span>
      <b className="text-[17px] tabular-nums">{typeof value === "number" ? value.toLocaleString("en-US") : value}</b>
    </div>
  );
}

/** Hidden unless the clinic has the free weekly spin on or has used it. */
function WeeklySpinCard({ api }: { api: DeskApi }) {
  const [d, setD] = useState<WeeklySpin | null>(null);
  useEffect(() => { api.weeklySpin().then(setD).catch(() => setD(null)); }, [api]);
  if (!d || (!d.enabled && d.d30.spins === 0 && d.this_week.spins === 0)) return null;
  const m = d.d30;
  const max = Math.max(1, ...d.weeks.map((x) => x.spins));
  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[13.5px] font-semibold">Weekly home spin</h2><p className="text-[12px] text-sub">One free spin per patient per week{d.enabled ? "" : " · switched off"}</p></div>
        <p className="text-right text-[12px] text-sub"><b className="block text-[22px] leading-none tabular-nums text-ink">{pct(d.this_week.spinners, d.members)}%</b>{d.this_week.spinners} of {d.members.toLocaleString("en-US")} spun this week</p>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <SpinStat value={m.spins} label="Home spins · 30 days" sub={<><Delta now={m.spins} prev={d.prev30.spins} /> · {m.spinners} people</>} />
        <SpinStat value={`${pct(m.visited_after, m.spins)}%`} label="Came in within 7 days" sub={`${m.visited_after} of ${m.spins} spins`} />
        <SpinStat value={m.notified} label="Spin pushes sent" sub={`${m.members_reached} patients · ${pct(m.spun_after_push, m.spins)}% of spins within 48 h`} />
        <SpinStat value={m.prizes_won} label="Won from home" sub={`${m.points_won.toLocaleString("en-US")} points`} />
      </div>
      <div className="mt-3 flex h-20 items-end gap-1.5 border-b border-line pb-px" role="img" aria-label="Home spins per week, last 8 weeks">
        {d.weeks.map((x, i) => <div key={x.week_start} title={`Week of ${shortDate(x.week_start)}: ${x.spins}`} className={`flex-1 rounded-t-[5px] ${i === d.weeks.length - 1 ? "bg-brand" : "bg-brand/30"}`} style={{ height: `${Math.max(3, Math.round((x.spins / max) * 100))}%` }} />)}
      </div>
    </section>
  );
}
function SpinStat({ value, label, sub }: { value: number | string; label: string; sub: React.ReactNode }) {
  return <div className="rounded-[12px] bg-[#F7F8F8] p-3"><b className="block text-[20px] leading-tight tabular-nums">{typeof value === "number" ? value.toLocaleString("en-US") : value}</b><span className="block text-[12.5px] font-medium">{label}</span><span className="block text-[12px] text-sub">{sub}</span></div>;
}

function TopRewards({ rows }: { rows: InsightsV3["top_rewards"] }) {
  if (!rows.length) return null;
  return (
    <section className={`${card} p-4`}>
      <h2 className="text-[13.5px] font-semibold">What they redeem · last 90 days</h2>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r, i) => (
          <div key={r.name + i} className="overflow-hidden rounded-[12px] bg-[#F7F8F8]">
            <div className="relative aspect-[16/9] bg-[#ECEEEF]">
              {r.image_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={optimizedUrl(r.image_url, 240)} alt="" className="h-full w-full object-cover" loading="lazy" />
                : <span className="grid h-full place-items-center text-faint"><IcGift className="h-6 w-6" /></span>}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">#{i + 1}</span>
            </div>
            <div className="p-2.5"><p className="line-clamp-2 text-[12.5px] font-semibold leading-tight">{r.name}</p><p className="mt-0.5 text-[12px] text-sub">{r.n}× redeemed</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopPatients({ api }: { api: DeskApi }) {
  const [rows, setRows] = useState<TopPatient[] | null>(null);
  useEffect(() => { api.topPatients().then(setRows).catch(() => setRows([])); }, [api]);
  return (
    <section className={`${card} min-w-0 p-4`}>
      <h2 className="text-[13.5px] font-semibold">Top patients</h2>
      <p className="text-[12px] text-sub">Ranked by lifetime points and visits</p>
      {!rows ? <div className="mt-3 h-40 animate-pulse rounded-[12px] bg-page" /> : rows.length === 0 ? <p className="py-8 text-center text-[13.5px] text-sub">No patient activity yet.</p> : (
        <ul className="mt-2.5 space-y-1.5">
          {rows.map((m, i) => (
            <li key={m.membership_id} className="flex items-center gap-2.5 rounded-[10px] bg-[#F7F8F8] px-3 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[12px] font-semibold ring-1 ring-line">#{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{m.full_name ?? m.email ?? "Patient"}</span><span className="block truncate text-[12px] text-sub">{m.visit_count} visit{m.visit_count === 1 ? "" : "s"}{m.total_spent_cents ? ` · ${money(m.total_spent_cents)} spent` : ""}{m.last_visit_at ? ` · last ${shortDate(m.last_visit_at)}` : ""}</span></span>
              <b className="shrink-0 text-[13px] tabular-nums">{m.lifetime_points.toLocaleString("en-US")} pts</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ───────────── Inactive + "we miss you" ───────────── */

const WINDOWS = [7, 14, 30, 60, 90];

function Inactive({ api, say }: { api: DeskApi; say: (t: string) => void }) {
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState<InactivePatient[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [composer, setComposer] = useState<InactivePatient | "all" | null>(null);
  const load = useCallback(() => { setErr(null); api.inactivePatients(days).then(setRows).catch((e) => setErr((e as Error).message)); }, [api, days]);
  useEffect(() => { load(); }, [load]);
  return (
    <section className={`${card} min-w-0 p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0"><h2 className="text-[13.5px] font-semibold">Inactive patients ({days}+ days)</h2><p className="text-[12px] text-sub">No check-in for {days} days. Send a &quot;we miss you&quot; with a bonus.</p></div>
        <div className="flex items-center gap-2">
          <select aria-label="Days away" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-[8px] border border-line bg-white px-2 text-[12.5px] outline-none">
            {WINDOWS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
          {!!rows?.length && <button type="button" onClick={() => setComposer("all")} className="h-8 rounded-full bg-brand px-3.5 text-[12.5px] font-semibold text-white">Send to all {rows.length}</button>}
        </div>
      </div>
      {err ? <p className="py-8 text-center text-[13.5px] text-red-600">{err}</p>
        : !rows ? <div className="mt-3 h-40 animate-pulse rounded-[12px] bg-page" />
        : rows.length === 0 ? <p className="py-8 text-center text-[13.5px] text-sub">Nobody has been away {days}+ days.</p>
        : (
          <ul className="mt-2.5 max-h-[340px] space-y-1.5 overflow-y-auto">
            {rows.map((m) => (
              <li key={m.membership_id} className="flex items-center gap-2.5 rounded-[10px] bg-[#F7F8F8] px-3 py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[11.5px] font-semibold ring-1 ring-line">{initials(m.full_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{m.full_name ?? m.email ?? "Patient"}</span>
                  <span className="block truncate text-[12px] text-sub">{m.last_visit_at ? `Last seen ${date(m.last_visit_at)} (${Math.round(Number(m.days_since_last))} days ago)` : m.joined_at ? `Never checked in · joined ${date(m.joined_at)}` : "Never checked in"}{m.phone ? ` · ${formatPhone(m.phone)}` : ""}</span>
                </span>
                <button type="button" onClick={() => setComposer(m)} className="h-8 shrink-0 rounded-full bg-white px-3 text-[12.5px] font-semibold ring-1 ring-line">We miss you</button>
              </li>
            ))}
          </ul>
        )}
      {composer && rows && (
        <WinbackModal api={api} label={composer === "all" ? `${rows.length} inactive patient${rows.length === 1 ? "" : "s"}` : composer.full_name ?? composer.email ?? "this patient"}
          onClose={() => setComposer(null)}
          onSend={async (w) => {
            const targets = composer === "all" ? rows.map((r) => r.membership_id) : [composer.membership_id];
            await api.sendWinback(targets, w);
            say(composer === "all" ? `Sent to ${targets.length} patient${targets.length === 1 ? "" : "s"}` : `Sent to ${composer.full_name ?? "the patient"}`);
            setComposer(null); load();
          }} />
      )}
    </section>
  );
}

function WinbackModal({ api, label, onClose, onSend }: { api: DeskApi; label: string; onClose: () => void; onSend: (w: Winback) => Promise<void> }) {
  const [rewards, setRewards] = useState<WinbackReward[]>([]);
  const [rewardId, setRewardId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [bonus, setBonus] = useState(50);
  const [message, setMessage] = useState("Here's a little bonus to welcome you back. Come see us soon.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.winbackRewards().then(setRewards).catch(() => setRewards([])); }, [api]);
  const chip = (on: boolean) => `rounded-[10px] px-3 py-2 text-left text-[12.5px] font-medium ${on ? "bg-ink text-white" : "bg-[#F4F5F6]"}`;
  async function send() {
    setBusy(true); setErr(null);
    try { await onSend({ message: message.trim(), bonusPoints: bonus, rewardId, expiresDays: days }); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Modal title="We miss you" onClose={onClose}>
      <p className="rounded-[12px] bg-[#F4F5F6] px-3.5 py-2.5 text-[13.5px]">Sending to <b>{label}</b>.</p>
      <p className="mt-4 text-[12.5px] font-semibold">Free reward (optional)</p>
      <div className="mt-1.5 grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto">
        <button type="button" onClick={() => setRewardId(null)} className={chip(rewardId === null)}>No reward</button>
        {rewards.map((r) => <button key={r.id} type="button" onClick={() => setRewardId(r.id)} className={chip(rewardId === r.id)}><span className="block truncate font-semibold">{r.name}</span><span className={`block text-[11.5px] ${rewardId === r.id ? "text-white/70" : "text-sub"}`}>Free · worth {r.point_cost.toLocaleString("en-US")} pts</span></button>)}
      </div>
      <p className="mt-1.5 text-[12px] text-sub">It lands in their Rewards with a code, and expires.</p>
      <p className="mt-4 text-[12.5px] font-semibold">Valid for</p>
      <div className="mt-1.5 flex gap-1.5">
        {[3, 7, 14].map((d) => <button key={d} type="button" onClick={() => setDays(d)} className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold ${days === d ? "bg-ink text-white" : "bg-[#F4F5F6]"}`}>{d} days</button>)}
      </div>
      <label className="mt-4 block text-[12.5px] font-semibold">Bonus points (0 = none)
        <input className={`${input} mt-1.5 font-normal`} inputMode="numeric" value={bonus ? String(bonus) : ""} placeholder="0" onChange={(e) => setBonus(Math.min(5000, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)))} />
      </label>
      <label className="mt-4 block text-[12.5px] font-semibold">Message
        <textarea className={`${input} mt-1.5 h-20 resize-none py-2.5 font-normal`} maxLength={240} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {err && <p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
      <button type="button" className="btn-ink mt-4" disabled={busy || !message.trim()} onClick={send}>{busy ? "Sending…" : "Send"}</button>
    </Modal>
  );
}

/* ───────────── Monthly reports ───────────── */

const LIVE = "live";

function Reports({ api, say, demo, clinic, initialMonth }: { api: DeskApi; say: (t: string) => void; demo: boolean; clinic: { name: string; primary: string; logoUrl: string | null; heroUrl: string | null }; initialMonth: string | null }) {
  const [live, setLive] = useState<MonthlyReport | null>(null);
  const [archive, setArchive] = useState<ReportArchiveRow[] | null>(null);
  const [sel, setSel] = useState(initialMonth || LIVE);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.reportLive().then(setLive).catch((e) => setErr((e as Error).message));
    api.reportArchive().then(setArchive).catch(() => setArchive([]));
  }, [api]);
  // ?month= for a month we don't have (or this month) falls back to "so far".
  useEffect(() => { if (sel !== LIVE && archive && !archive.some((a) => a.month === sel)) setSel(LIVE); }, [archive, sel]);

  const row = sel === LIVE ? null : archive?.find((a) => a.month === sel) ?? null;
  const report = sel === LIVE ? live : row?.data ?? null;
  const options = useMemo(() => {
    const o: { id: string; label: string }[] = [];
    if (live) o.push({ id: LIVE, label: `${monthName(live.month, { month: "long" })} so far` });
    for (const a of archive ?? []) if (a.month !== live?.month) o.push({ id: a.month, label: monthName(a.month) });
    return o;
  }, [live, archive]);

  return (
    <div className="space-y-3.5">
      <div className="no-scrollbar flex gap-5 overflow-x-auto border-b border-line" role="tablist" aria-label="Report month">
        {options.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={sel === o.id} onClick={() => setSel(o.id)} className={`relative shrink-0 pb-2.5 text-[13.5px] ${sel === o.id ? "font-semibold text-brand" : "text-sub hover:text-ink"}`}>
            {o.label}{sel === o.id && <span className="absolute inset-x-0 bottom-[-1px] h-[2px] rounded-full bg-brand" />}
          </button>
        ))}
      </div>
      <ReportEmailSettings api={api} say={say} demo={demo} month={report?.month ?? null} />
      {err && <p className="rounded-[14px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>}
      {!report && !err && <div className="h-96 animate-pulse rounded-[16px] bg-white/70" />}
      {report && <ReportLetter r={report} clinic={clinic} emailed={row ? { at: row.emailed_at, to: row.emailed_to } : null} />}
      {archive?.length === 0 && live && <p className="text-[12.5px] text-sub">Your first emailed report arrives on the 1st. Until then, this month&apos;s numbers update live.</p>}
    </div>
  );
}

const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

/** Reads like the email: photo + brand wash, a written summary, one plain table, a numbered list. The clinic's current brand wins over an archived month's. */
function ReportLetter({ r, clinic, emailed }: { r: MonthlyReport; clinic: { name: string; primary: string; logoUrl: string | null; heroUrl: string | null }; emailed: { at: string | null; to: string[] | null } | null }) {
  const brand = brandOf({ primary: clinic.primary });
  const logo = clinic.logoUrl || r.business.logo_url || r.business.icon_url || null;
  const hero = clinic.heroUrl || r.business.hero_url || null;
  const figures = kpisFor(r.business.layout);
  const notes = takeaways(r);
  const spin = weeklySpinBlock(r);
  const treatments = r.top_treatments.map((t) => ({ a: t.name, b: `${t.n}`, v: t.n }));
  const people = r.top_members.map((m) => ({ a: m.name, b: `${fmtNum(m.points)} pts`, v: m.points }));
  const tone = (d: { dir: string } | null) => (!d ? "text-faint" : d.dir === "up" ? "text-emerald-700" : d.dir === "down" ? "text-red-600" : "text-sub");
  return (
    <article className={`${card} overflow-hidden`}>
      <header className="relative min-h-[200px]" style={{ background: brand.primary, color: brand.onPrimary }}>
        {hero && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {hero && <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${brand.primary} 0%, ${brand.primary}e6 38%, ${brand.primary}66 70%, ${brand.primary}1a 100%)` }} />}
        <div className="relative flex min-h-[200px] flex-col justify-between p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] opacity-85">{clinic.name} · {r.partial ? "Month to date" : "Monthly report"}</p>
            {logo && (
              <span className="grid h-10 place-items-center rounded-[10px] bg-white px-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" className="h-6 w-auto max-w-[110px] object-contain" />
              </span>
            )}
          </div>
          <div className="mt-8">
            <h2 className="text-[38px] leading-none sm:text-[44px]" style={SERIF}>{monthName(r.month, { month: "long" })}</h2>
            <p className="mt-2 text-[13.5px] opacity-85">
              {r.partial
                ? `${monthName(r.month, { year: "numeric" })} · through ${new Date(r.through).toLocaleDateString("en-US", { month: "long", day: "numeric" })}, compared with the same days of ${prevMonthName(r.month)}`
                : `${monthName(r.month, { year: "numeric" })} · compared with ${prevMonthName(r.month)}`}
            </p>
          </div>
        </div>
      </header>
      <div className="px-5 pb-7 pt-6 sm:px-7">
        <p className="max-w-3xl text-[19px] leading-[1.55]" style={SERIF}>{summary(r)}</p>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-3">
          {figures.map((x) => {
            const d = changeText(r.current[x.key], r.previous[x.key], r.month);
            return (
              <div key={x.key} title={x.hint} className="bg-white px-4 py-3.5">
                <p className="text-[12.5px] text-sub">{x.label}</p>
                <p className="mt-0.5 text-[24px] font-bold tracking-[-0.01em] tabular-nums">{fmtVal(x, r.current[x.key])}</p>
                <p className={`text-[12.5px] ${tone(d)}`}>{d ? d.text : "nothing yet"}</p>
              </div>
            );
          })}
        </div>
        {spin && (
          <section className="mt-7">
            <h3 className="text-[13.5px] font-semibold">Weekly home spin</h3>
            <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-sub">{spin.line}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-5">
              {spin.rows.map((x) => <div key={x.label} title={x.hint} className="bg-white px-3.5 py-3"><p className="text-[12px] text-sub">{x.label}</p><p className="text-[20px] font-bold tabular-nums">{x.value}</p><p className={`text-[12px] ${x.change ? tone(x.change) : "text-faint"}`}>{x.change ? x.change.text : x.hint}</p></div>)}
            </div>
          </section>
        )}
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <h3 className="text-[13.5px] font-semibold">Worth your attention</h3>
            {notes.length === 0 && <p className="mt-2 text-[13.5px] text-sub">Not enough activity yet to call a trend.</p>}
            <ol className="mt-1 divide-y divide-line">
              {notes.map((t, i) => (
                <li key={t.title} className="flex gap-3.5 py-3.5">
                  <span className="w-5 shrink-0 text-[20px] leading-6 text-brand" style={SERIF}>{i + 1}</span>
                  <span><span className="block text-[14.5px] font-semibold">{t.title}</span><span className="mt-0.5 block text-[13.5px] leading-relaxed text-sub">{t.body}</span></span>
                </li>
              ))}
            </ol>
          </section>
          <aside className="space-y-6">
            {treatments.length > 0 && <Bars title="Most-booked treatments" items={treatments} />}
            {people.length > 0 && <Bars title="Top patients" items={people} />}
            <section>
              <h3 className="text-[13.5px] font-semibold">At a glance</h3>
              <dl className="mt-1.5 divide-y divide-line text-[13.5px]">
                {([["Patients in your app", r.current.total_members], ["Paying members", r.current.paid_members], ["Points earned", r.current.points_earned], ["Referrals", r.current.referrals]] as const).map(([label, v]) => (
                  <div key={label} className="flex justify-between gap-3 py-2"><dt className="text-sub">{label}</dt><dd className="font-semibold tabular-nums">{fmtNum(v)}</dd></div>
                ))}
              </dl>
            </section>
          </aside>
        </div>
      </div>
      {emailed && (
        <footer className="flex items-center gap-2 border-t border-line bg-[#FBFBFB] px-5 py-3 text-[12.5px] text-sub sm:px-7">
          <IcMail className="h-4 w-4 shrink-0" />
          {emailed.at ? `Emailed ${shortDate(emailed.at)} to ${(emailed.to ?? []).join(", ") || "your managers"}` : "Saved, not emailed (no report email on file)."}
        </footer>
      )}
    </article>
  );
}

function Bars({ title, items }: { title: string; items: { a: string; b: string; v: number }[] }) {
  const max = Math.max(1, ...items.map((x) => x.v));
  return (
    <section>
      <h3 className="text-[13.5px] font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2.5">
        {items.map((x) => (
          <li key={x.a}>
            <div className="flex justify-between gap-3 text-[13.5px]"><span className="truncate">{x.a}</span><span className="shrink-0 tabular-nums text-sub">{x.b}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-[#F4F5F6]"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(4, (x.v / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────── Who gets the email ───────────── */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function ReportEmailSettings({ api, say, demo, month }: { api: DeskApi; say: (t: string) => void; demo: boolean; month: string | null }) {
  const [rec, setRec] = useState<ReportRecipients | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);
  const load = useCallback(() => api.reportRecipients().then(setRec).catch(() => setRec(null)), [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (rec?.me && !testTo) setTestTo(rec.me); }, [rec, testTo]);
  if (!rec) return null;

  const custom = rec.custom ?? [];
  const save = async (list: string[]) => {
    setBusy(true);
    try { await api.setReportRecipients(list); await load(); } catch (e) { say((e as Error).message); }
    setBusy(false);
  };
  const add = () => {
    const e = draft.trim().toLowerCase();
    if (!EMAIL.test(e)) { say("That doesn't look like an email address."); return; }
    save(Array.from(new Set([...custom, e]))); setDraft("");
  };
  const sendTest = async () => {
    setSending(true);
    try {
      const r = await api.sendReportTest(month, testTo || null);
      say(demo ? "Demo: nothing was sent" : `Test report sent to ${r.to}`);
    } catch (e) { say((e as Error).message); }
    setSending(false);
  };
  const testOptions = Array.from(new Set([rec.me, ...rec.effective.map((x) => x.email)].filter(Boolean) as string[]));

  return (
    <section className={card}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <IcMail className="h-[18px] w-[18px] shrink-0 text-brand" />
        <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">Who gets this email</span><span className="block truncate text-[12.5px] text-sub">{rec.effective.length ? `Emailed on the 1st to ${rec.effective.map((x) => x.email).join(", ")}` : "Nobody yet. Add an address."}</span></span>
        <span className="shrink-0 text-[12.5px] font-semibold text-brand">{open ? "Done" : "Edit · Send test"}</span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-line p-4">
          <div>
            <h3 className="text-[13px] font-semibold">Report emails</h3>
            <p className="mt-0.5 text-[12.5px] text-sub">{custom.length ? "The report goes only to these addresses. Remove them all to go back to every manager login." : "Right now it goes to every manager login below. Add an address to send it only to the people you list."}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {custom.length > 0
                ? custom.map((e) => (
                  <li key={e} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#F4F5F6] pl-3 pr-1 text-[12.5px]">{e}
                    <button type="button" aria-label={`Remove ${e}`} disabled={busy} onClick={() => save(custom.filter((x) => x !== e))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-line">×</button>
                  </li>
                ))
                : rec.managers.map((e) => <li key={e} className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] text-sub ring-1 ring-line">{e}</li>)}
              {!custom.length && !rec.managers.length && <li className="text-[12.5px] text-faint">No manager logins on this clinic.</li>}
            </ul>
            <form className="mt-2.5 flex max-w-[460px] gap-2" onSubmit={(ev) => { ev.preventDefault(); add(); }}>
              <input type="email" aria-label="Add an email" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="owner@yourclinic.com" className={input} />
              <button type="submit" disabled={busy || !draft.trim()} className="h-10 shrink-0 rounded-full bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50">Add</button>
            </form>
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">Send a test</h3>
            <p className="mt-0.5 text-[12.5px] text-sub">Sends the report on screen, marked [Test]. The real email on the 1st isn&apos;t affected.</p>
            <div className="mt-2 flex max-w-[460px] flex-wrap gap-2">
              <select aria-label="Send the test to" value={testTo} onChange={(e) => setTestTo(e.target.value)} className={`${input} min-w-[200px] flex-1`}>
                {testOptions.map((e) => <option key={e} value={e}>{e === rec.me ? `${e} (me)` : e}</option>)}
              </select>
              <button type="button" disabled={sending || !testTo} onClick={sendTest} className="h-10 shrink-0 rounded-full bg-white px-4 text-[13px] font-semibold ring-1 ring-line disabled:opacity-50">{sending ? "Sending…" : "Send test"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
