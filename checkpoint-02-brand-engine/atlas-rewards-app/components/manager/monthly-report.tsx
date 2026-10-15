"use client";
/**
 * MonthlyReport — CP-209 · the Reports tab (every niche, managers only)
 *
 * "This month so far" is computed live (business_monthly_report RPC);
 * finished months come from the archive the cron writes on the 1st
 * (business_monthly_reports), which is also what was emailed. Same
 * numbers, same takeaways as the email (lib/reports/monthly.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";
import { brandOf, changeText, fmtNum, fmtVal, kpisFor, monthName, prevMonthName, summary, takeaways, type MonthlyReport as Report } from "@/lib/reports/monthly";

type ArchiveRow = { month: string; data: Report; emailed_at: string | null; emailed_to: string[] | null };

const LIVE = "live";

export function MonthlyReport({ business, initialMonth, demo }: {
  business: Business;
  /** "2026-09" from ?month= (the email's button). */
  initialMonth?: string | null;
  /** Preloaded data for previews — skips both queries. */
  demo?: { live: Report; archive: ArchiveRow[] };
}) {
  const brand = brandOf(business.brand_colors);
  const [live, setLive] = useState<Report | null>(demo?.live ?? null);
  const [archive, setArchive] = useState<ArchiveRow[] | null>(demo?.archive ?? null);
  const [sel, setSel] = useState<string>(initialMonth || LIVE);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let off = false;
    const sb = createClient();
    sb.rpc("business_monthly_report", { p_business_id: business.id }).then(({ data, error }) => {
      if (off) return;
      if (error) setErr(error.message); else setLive(data as Report);
    });
    sb.from("business_monthly_reports").select("month, data, emailed_at, emailed_to")
      .eq("business_id", business.id).order("month", { ascending: false }).limit(24)
      .then(({ data }) => { if (!off) setArchive(((data ?? []) as any[]).map((r) => ({ ...r, month: String(r.month).slice(0, 7) }))); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  // If ?month= points at an archived month we don't have, fall back to live.
  useEffect(() => {
    if (sel !== LIVE && archive && !archive.some((a) => a.month === sel)) setSel(LIVE);
  }, [archive, sel]);

  const row = sel === LIVE ? null : archive?.find((a) => a.month === sel) ?? null;
  const report = sel === LIVE ? live : row?.data ?? null;

  const options = useMemo(() => {
    const o: { id: string; label: string }[] = [];
    if (live) o.push({ id: LIVE, label: `${monthName(live.month, { month: "long" })} so far` });
    for (const a of archive ?? []) if (a.month !== live?.month) o.push({ id: a.month, label: monthName(a.month) });
    return o;
  }, [live, archive]);

  return (
    <div className="space-y-3 max-w-5xl">
      {/* Month picker — quiet text tabs, the report itself is the show. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-zinc-200" role="tablist" aria-label="Report month">
        {options.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={sel === o.id} onClick={() => setSel(o.id)}
            className={cn("-mb-px border-b-2 pb-2.5 pt-1 text-[13px] font-semibold transition-colors",
              sel === o.id ? "text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}
            style={sel === o.id ? { borderColor: brand.accent } : undefined}>
            {o.label}
          </button>
        ))}
        <span className="ml-auto pb-2.5 text-xs text-zinc-400 hidden sm:inline">Emailed to your managers on the 1st</span>
      </div>

      {err && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Couldn&apos;t load the report: {err}</div>}
      {!report && !err && <div className="flex items-center gap-2 py-16 justify-center text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Building your report…</div>}

      {report && <ReportView report={report} business={business} emailed={row ? { at: row.emailed_at, to: row.emailed_to } : null} />}

      {archive && archive.length === 0 && live && (
        <p className="text-xs text-zinc-400">Your first emailed report arrives on the 1st. Until then, this month&apos;s numbers update live.</p>
      )}
    </div>
  );
}

/**
 * CP-210 design: reads like a letter, not a dashboard. The app's hero photo
 * under a brand-color wash (same treatment as the membership card), the
 * month set large in a serif, a written summary, one plain figures table,
 * a numbered list, and bar rows. No badges, tags or icon chips.
 */
export function ReportView({ report: r, business, emailed }: { report: Report; business: Business; emailed: { at: string | null; to: string[] | null } | null }) {
  // The live business wins (logo/colors/photo may have changed since an archived month).
  const brand = brandOf(business.brand_colors ?? r.business.brand_colors);
  const logo = business.logo_url || (business as { app_icon_url?: string | null }).app_icon_url || r.business.logo_url || r.business.icon_url || null;
  const hero = business.hero_image_url || r.business.hero_url || null;
  const k = kpisFor(r.business.layout);
  const tk = takeaways(r);
  const medspa = r.business.layout === "medspa";
  const through = new Date(r.through);
  const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };

  const bars = medspa && r.top_treatments.length
    ? { title: "Most-booked treatments", items: r.top_treatments.map((t) => ({ a: t.name, b: `${t.n}`, v: t.n })) }
    : null;
  const people = r.top_members.map((m) => ({ a: m.name, b: `${fmtNum(m.points)} pts`, v: m.points }));

  return (
    <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-sm">
      {/* Header: photo + brand wash */}
      <header className="relative min-h-[220px]" style={{ background: brand.primary, color: brand.onPrimary }}>
        {hero && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0" style={{
          background: hero
            ? `linear-gradient(90deg, ${brand.primary} 0%, ${brand.primary}e6 38%, ${brand.primary}66 70%, ${brand.primary}1a 100%)`
            : undefined,
        }} />
        <div className="relative flex h-full min-h-[220px] flex-col justify-between p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] opacity-85">{business.name} · {r.partial ? "Month to date" : "Monthly report"}</div>
            {logo && (
              <span className="grid h-11 place-items-center rounded-lg bg-white px-2.5 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt={business.name} className="h-7 w-auto max-w-[120px] object-contain" />
              </span>
            )}
          </div>
          <div className="mt-10">
            <h2 className="text-[40px] leading-none sm:text-[48px]" style={serif}>{monthName(r.month, { month: "long" })}</h2>
            <div className="mt-2 text-sm opacity-85">
              {r.partial
                ? `${monthName(r.month, { year: "numeric" })} · through ${through.toLocaleDateString(undefined, { month: "long", day: "numeric" })}, compared with the same days of ${prevMonthName(r.month)}`
                : `${monthName(r.month, { year: "numeric" })} · compared with ${prevMonthName(r.month)}`}
            </div>
          </div>
        </div>
        {brand.secondary && <div className="relative h-1" style={{ background: brand.secondary }} />}
      </header>

      <div className="px-6 pb-8 pt-7 sm:px-8">
        {/* Written summary */}
        <p className="max-w-3xl text-[19px] leading-[1.55] text-zinc-900 sm:text-[21px]" style={serif}>{summary(r)}</p>

        {/* Figures: one plain table */}
        <div className="mt-7 grid grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 sm:grid-cols-3">
          {k.map((x, i) => {
            const d = changeText(r.current[x.key], r.previous[x.key], r.month);
            return (
              <div key={x.key} title={x.hint}
                className={cn("px-5 py-4 border-zinc-200",
                  i % 2 === 1 && "border-l sm:border-l-0", i % 3 !== 0 && "sm:border-l",
                  i >= 2 && "border-t sm:border-t-0", i >= 3 && "sm:border-t")}>
                <div className="text-[12.5px] text-zinc-500">{x.label}</div>
                <div className="mt-1 text-[26px] font-bold tracking-[-0.01em] tabular-nums text-zinc-900">{fmtVal(x, r.current[x.key])}</div>
                <div className={cn("mt-0.5 text-[12.5px]", !d ? "text-zinc-400" : d.dir === "up" ? "text-green-700" : d.dir === "down" ? "text-red-700" : "text-zinc-500")}>
                  {d ? d.text : "nothing yet"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
          {/* Worth your attention */}
          <section>
            <h3 className="text-[13px] font-bold tracking-wide text-zinc-900">Worth your attention</h3>
            {tk.length === 0 && <p className="mt-2 text-sm text-zinc-500">Not enough activity yet to call a trend.</p>}
            <ol className="mt-2">
              {tk.map((t, i) => (
                <li key={i} className={cn("flex gap-4 py-3.5", i > 0 && "border-t border-zinc-100")}>
                  <span className="w-5 shrink-0 text-[20px] leading-6" style={{ ...serif, color: brand.accent }}>{i + 1}</span>
                  <div>
                    <div className="text-[15px] font-semibold text-zinc-900">{t.title}</div>
                    <div className="mt-0.5 text-[13.5px] leading-relaxed text-zinc-600">{t.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="space-y-7">
            {bars && <Bars title={bars.title} items={bars.items} color={brand.primary} />}
            {people.length > 0 && <Bars title={`Top ${medspa ? "patients" : "members"}`} items={people} color={brand.primary} />}
            <section>
              <h3 className="text-[13px] font-bold tracking-wide text-zinc-900">At a glance</h3>
              <dl className="mt-2 divide-y divide-zinc-100 text-[13.5px]">
                <Row label={medspa ? "Patients in your app" : "Members in your app"} value={fmtNum(r.current.total_members)} />
                <Row label="Paying members" value={fmtNum(r.current.paid_members)} />
                <Row label="Points earned" value={fmtNum(r.current.points_earned)} />
                <Row label="Referrals" value={fmtNum(r.current.referrals)} />
              </dl>
            </section>
          </aside>
        </div>
      </div>

      {emailed && (
        <footer className="flex items-center gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-3 text-xs text-zinc-500 sm:px-8">
          <Mail className="h-3.5 w-3.5" />
          {emailed.at
            ? <>Emailed {new Date(emailed.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} to {(emailed.to ?? []).join(", ") || "your managers"}</>
            : "Saved, not emailed (no manager email on file)."}
        </footer>
      )}
    </article>
  );
}

function Bars({ title, items, color }: { title: string; items: { a: string; b: string; v: number }[]; color: string }) {
  const max = Math.max(1, ...items.map((x) => x.v));
  return (
    <section>
      <h3 className="text-[13px] font-bold tracking-wide text-zinc-900">{title}</h3>
      <ul className="mt-2.5 space-y-3">
        {items.map((x, i) => (
          <li key={i}>
            <div className="flex justify-between gap-3 text-[13.5px]"><span className="truncate text-zinc-800">{x.a}</span><span className="shrink-0 tabular-nums text-zinc-500">{x.b}</span></div>
            <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100"><div className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (x.v / max) * 100)}%`, background: color }} /></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 py-2"><dt className="text-zinc-600">{label}</dt><dd className="font-semibold tabular-nums text-zinc-900">{value}</dd></div>;
}
