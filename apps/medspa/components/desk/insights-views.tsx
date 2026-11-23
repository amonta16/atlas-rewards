"use client";
/**
 * Desk → Monthly report (managers), opened from the monthly report email.
 * Same database functions as before (business_monthly_report,
 * get/set_report_recipients), and the report wording comes from
 * @atlas/core/reports/monthly, so it matches the email on the 1st.
 * CP-263: the Live insights tab and the Insights sidebar page were removed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { brandOf, changeText, fmtNum, fmtVal, kpisFor, monthName, prevMonthName, summary, takeaways, weeklySpinBlock, type MonthlyReport } from "@atlas/core/reports/monthly";
import type { DeskApi, ReportArchiveRow, ReportRecipients } from "@/lib/desk-api";
import { IcMail } from "../icons";

const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const input = "h-10 w-full rounded-[10px] bg-[#F4F5F6] px-3 text-[13.5px] outline-none placeholder:text-faint focus:ring-2 focus:ring-brand/30";
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * CP-263: the Insights page is gone (Home has the numbers). The monthly report email's
 * button (?view=reports&month=…) still lands here: the report, its archive and who gets it.
 */
export function MonthlyReportView({ api, say, demo, clinic, initialMonth }: {
  api: DeskApi; say: (t: string) => void; demo: boolean;
  clinic: { name: string; primary: string; logoUrl: string | null; heroUrl: string | null }; initialMonth: string | null;
}) {
  return <Reports api={api} say={say} demo={demo} clinic={clinic} initialMonth={initialMonth} />;
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
