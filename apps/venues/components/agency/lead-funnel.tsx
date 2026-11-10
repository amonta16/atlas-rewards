"use client";
/**
 * LeadFunnel — CP-238 · Admin → Lead funnel. Two tabs:
 *   Overview         KPI tiles, the funnel, visitors and opt-ins per day, campaigns, latest opt-ins.
 *   Follow-up emails the sequence as plain steps; click one to edit its timing and
 *                    copy with a live preview. No automation canvas on purpose.
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Mail, MousePointerClick, Send, UserPlus, CalendarCheck, BadgeDollarSign, RotateCcw } from "lucide-react";
import { DEFAULT_STEPS, MERGE_TAGS, SAMPLE_VALUES, describeDelay, renderStep, type EmailStep } from "@/lib/landing/lead-nurture";
import { FollowThrough, SequenceEditor, type FollowData, type SequenceProps } from "./lead-sequence";

export type OptinRow = {
  id: string; slug: string; spa: string; name: string | null; email: string | null; at: string; campaign: string | null;
  stage: "opted_in" | "booked" | "showed" | "paid" | "lost"; emails: number | null; emailsStopped: "unsubscribed" | "stopped" | null;
};
export type FunnelData = {
  days: number; visitors: number | null; visits: number | null; built: number | null;
  optins: number; booked: number; showed: number; paid: number;
  daily: { day: string; visitors: number; optins: number }[];
  campaigns: { name: string; visitors: number; optins: number; booked: number; paid: number }[];
  recent: OptinRow[]; notes: string[];
};

const card = "rounded-xl border border-slate-200 bg-white";
const pct = (a: number | null, b: number | null) => (a == null || !b ? "—" : `${Math.round((a / b) * 1000) / 10}%`);
const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
const STAGE: Record<OptinRow["stage"], { label: string; cls: string }> = {
  opted_in: { label: "Opted in", cls: "bg-slate-100 text-slate-700" },
  booked: { label: "Walkthrough booked", cls: "bg-sky-50 text-sky-800" },
  showed: { label: "Showed", cls: "bg-indigo-50 text-indigo-800" },
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-800" },
  lost: { label: "Not a fit", cls: "bg-slate-100 text-slate-500" },
};

export type FunnelTab = "overview" | "emails" | "sequence" | "follow";

/**
 * Audit step 6: with CP-243 applied the follow-up is the multi-channel Sequence plus Follow-through
 * (every lead's steps and the call tasks); before it, the CP-238 Follow-up emails tab as it was.
 */
export function LeadFunnel({ data, steps, stepsSaved, reached, sending, hasPostal, initialTab, sequence, follow }: {
  data: FunnelData; steps: EmailStep[]; stepsSaved: boolean; reached: Record<number, number>; sending: boolean; hasPostal: boolean; initialTab: FunnelTab;
  sequence: SequenceProps | null; follow: FollowData | null;
}) {
  const tabs: Array<[FunnelTab, string]> = sequence
    ? [["overview", "Overview"], ["sequence", `Sequence · ${sequence.steps.length} steps`], ["follow", `Follow-through${follow?.tasks.length ? ` · ${follow.tasks.length} calls` : ""}`]]
    : [["overview", "Overview"], ["emails", `Follow-up emails · ${steps.length}`]];
  const [tab, setTab] = useState<FunnelTab>(tabs.some(([id]) => id === initialTab) ? initialTab : initialTab === "emails" && sequence ? "sequence" : "overview");
  return (
    <div className="mt-6">
      <div className="flex gap-6 border-b border-slate-200" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`relative pb-2.5 text-sm ${tab === id ? "font-semibold text-sky-700" : "text-slate-500 hover:text-slate-900"}`}>
            {label}{tab === id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-sky-600" />}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview d={data} />}
      {tab === "emails" && <Emails steps={steps} stepsSaved={stepsSaved} reached={reached} sending={sending} hasPostal={hasPostal} />}
      {tab === "sequence" && sequence && <SequenceEditor {...sequence} />}
      {tab === "follow" && sequence && (follow ? <FollowThrough data={follow} steps={sequence.steps} /> : <p className="mt-5 text-sm text-slate-500">Follow-through needs the CP-243 SQL.</p>)}
    </div>
  );
}

/* ───────────────────────── Overview ───────────────────────── */

function Overview({ d }: { d: FunnelData }) {
  const funnel: { label: string; value: number | null }[] = [
    { label: "Visitors", value: d.visitors },
    { label: "Previews built", value: d.built },
    { label: "Opted in", value: d.optins },
    { label: "Walkthrough booked", value: d.booked },
    { label: "Showed", value: d.showed },
    { label: "Paid", value: d.paid },
  ];
  const max = Math.max(1, ...funnel.map((f) => f.value ?? 0));
  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1" aria-label="Date range">
          {[7, 30, 90].map((n) => (
            <Link key={n} href={`?d=${n}`} scroll={false} className={`rounded-md px-3 py-1.5 text-sm font-medium ${d.days === n ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}>Last {n} days</Link>
          ))}
        </div>
        <p className="text-xs text-slate-500">Bookings and payments follow the owners who opted in during this range.</p>
      </div>
      {d.notes.map((n) => <p key={n} className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />{n}</p>)}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile Icon={MousePointerClick} label="Landing-page visitors" value={fmt(d.visitors)} sub={d.visits == null ? "Not tracked yet" : `${fmt(d.visits)} visits`} />
        <Tile Icon={UserPlus} label="Opt-ins" value={fmt(d.optins)} sub={`${pct(d.optins, d.visitors)} of visitors`} />
        <Tile Icon={CalendarCheck} label="Walkthroughs booked" value={fmt(d.booked)} sub={`${pct(d.booked, d.optins)} of opt-ins · ${fmt(d.showed)} showed`} />
        <Tile Icon={BadgeDollarSign} label="Paid" value={fmt(d.paid)} sub={`${pct(d.paid, d.optins)} of opt-ins · ${pct(d.paid, d.booked)} of booked`} />
      </div>

      <section className={`${card} p-5`}>
        <h2 className="text-sm font-semibold text-slate-900">Funnel</h2>
        <ol className="mt-4 space-y-2.5">
          {funnel.map((f, i) => (
            <li key={f.label} className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-sm" title={`${f.label}: ${fmt(f.value)}`}>
              <span className="text-slate-600">{f.label}</span>
              <span className="h-6 rounded bg-slate-50">
                <span className="block h-full rounded-r bg-sky-600 transition-all" style={{ width: `${Math.max(f.value ? 1.5 : 0, ((f.value ?? 0) / max) * 100)}%` }} />
              </span>
              <span className="text-right tabular-nums"><b className="text-slate-900">{fmt(f.value)}</b>{i > 0 && <span className="ml-1.5 text-xs text-slate-500">{pct(f.value, funnel[i - 1].value)}</span>}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">The small % is the step from the row above.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <DayChart title="Visitors per day" rows={d.daily.map((x) => ({ day: x.day, v: x.visitors }))} unit="visitors" />
        <DayChart title="Opt-ins per day" rows={d.daily.map((x) => ({ day: x.day, v: x.optins }))} unit="opt-ins" />
      </div>

      <section className={`${card} overflow-hidden`}>
        <h2 className="px-5 pt-4 text-sm font-semibold text-slate-900">By campaign (utm_campaign)</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr><th className="px-5 py-2 font-medium">Campaign</th><th className="px-3 py-2 text-right font-medium">Visitors</th><th className="px-3 py-2 text-right font-medium">Opt-ins</th><th className="px-3 py-2 text-right font-medium">Opt-in rate</th><th className="px-3 py-2 text-right font-medium">Booked</th><th className="px-5 py-2 text-right font-medium">Paid</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {d.campaigns.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-500">Nothing in this range yet.</td></tr>}
            {d.campaigns.map((c) => (
              <tr key={c.name}><td className="px-5 py-2.5 font-medium text-slate-900">{c.name}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.visitors)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.optins)}</td><td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{pct(c.optins, c.visitors)}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmt(c.booked)}</td><td className="px-5 py-2.5 text-right tabular-nums">{fmt(c.paid)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between px-5 pt-4"><h2 className="text-sm font-semibold text-slate-900">Latest opt-ins</h2><Link href="/agency/previews" className="text-xs font-medium text-sky-700 hover:underline">All previews →</Link></div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="px-5 py-2 font-medium">Owner</th><th className="px-3 py-2 font-medium">Opted in</th><th className="px-3 py-2 font-medium">Campaign</th><th className="px-3 py-2 font-medium">Stage</th><th className="px-5 py-2 font-medium">Follow-up</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.recent.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">No opt-ins in this range.</td></tr>}
              {d.recent.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-2.5"><span className="block font-medium text-slate-900">{o.spa}</span><span className="block text-xs text-slate-500">{o.name ?? "—"}{o.email ? ` · ${o.email}` : ""}</span></td>
                  <td className="px-3 py-2.5 text-slate-600">{new Date(o.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="px-3 py-2.5 text-slate-600">{o.campaign ?? "—"}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE[o.stage].cls}`}>{STAGE[o.stage].label}</span></td>
                  <td className="px-5 py-2.5 text-slate-600">{o.emails == null ? "—" : `${o.emails} step${o.emails === 1 ? "" : "s"} done`}{o.emailsStopped ? <span className="ml-1.5 text-xs text-slate-500">· {o.emailsStopped}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ Icon, label, value, sub }: { Icon: typeof Mail; label: string; value: string; sub: string }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><Icon className="h-4 w-4 text-slate-400" /></div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

/** One measure per chart (no dual axis). Columns with a hover readout. */
function DayChart({ title, rows, unit }: { title: string; rows: { day: string; v: number }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.v));
  const total = rows.reduce((a, r) => a + r.v, 0);
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const h = hover != null ? rows[hover] : null;
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span className="text-xs tabular-nums text-slate-500">{h ? `${label(h.day)}: ${h.v.toLocaleString("en-US")} ${unit}` : `${total.toLocaleString("en-US")} total`}</span>
      </div>
      <div className="mt-4 flex h-32 items-end gap-[2px] border-b border-slate-200" onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}: ${total} in total`}>
        {rows.map((r, i) => (
          <div key={r.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div className={`w-full rounded-t-[3px] ${hover === i ? "bg-sky-800" : "bg-sky-600"}`} style={{ height: r.v ? `${Math.max(3, (r.v / max) * 100)}%` : "0" }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-400"><span>{rows[0] && label(rows[0].day)}</span><span>max {max.toLocaleString("en-US")}</span><span>{rows.at(-1) && label(rows.at(-1)!.day)}</span></div>
    </section>
  );
}

/* ───────────────────────── Follow-up emails ───────────────────────── */

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";

function Emails({ steps: initial, stepsSaved, reached, sending, hasPostal }: { steps: EmailStep[]; stepsSaved: boolean; reached: Record<number, number>; sending: boolean; hasPostal: boolean }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initial);
  const [open, setOpen] = useState(1);
  const cur = steps.find((s) => s.step === open) ?? steps[0];
  const [draft, setDraft] = useState<EmailStep>(cur);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cur);

  const pick = (n: number) => {
    if (dirty && !confirm("Discard your unsaved changes to this email?")) return;
    const s = steps.find((x) => x.step === n)!; setOpen(n); setDraft(s); setMsg(null);
  };
  const set = (p: Partial<EmailStep>) => setDraft((d) => ({ ...d, ...p }));
  const insert = (tag: string) => {
    const el = body.current;
    if (!el) { set({ body: draft.body + tag }); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    const next = draft.body.slice(0, a) + tag + draft.body.slice(b);
    set({ body: next });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
  };
  async function save() {
    setBusy("save"); setMsg(null);
    const r = await fetch("/api/agency/lead-emails", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setSteps((all) => all.map((s) => (s.step === draft.step ? draft : s))); setMsg({ ok: true, text: "Saved. The next send uses this copy." }); router.refresh(); }
    else setMsg({ ok: false, text: j.error ?? "Couldn't save." });
    setBusy(null);
  }
  async function test() {
    setBusy("test"); setMsg(null);
    const r = await fetch("/api/agency/lead-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", subject: draft.subject, preheader: draft.preheader, body: draft.body }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: `Test sent to ${j.to}.` } : { ok: false, text: j.error ?? "Couldn't send the test." });
    setBusy(null);
  }

  const days = draft.delay_hours % 24 === 0;
  const preview = useMemo(() => renderStep(draft, SAMPLE_VALUES, { unsubscribeUrl: "#", postalAddress: hasPostal ? "Your mailing address" : null }), [draft, hasPostal]);

  return (
    <div className="mt-5 space-y-4">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm ${sending ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        {sending ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        <span className="font-semibold">{sending ? "Sending is on." : "Sending is off."}</span>
        <span>{sending ? "Every owner who opts in gets these, until they book a walkthrough, pay or unsubscribe." : "Nothing goes out until LEAD_NURTURE_SEND=1 is set on Vercel. Edit and test freely."}</span>
        {!stepsSaved && <span className="w-full text-xs">Showing the starting copy: saving needs the CP-238 SQL.</span>}
        {!hasPostal && <span className="w-full text-xs">Add MAIL_POSTAL_ADDRESS on Vercel before turning sending on. US law (CAN-SPAM) needs a mailing address in marketing emails.</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* The sequence as plain steps */}
        <ol className="relative space-y-2" aria-label="Email sequence">
          <li className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-slate-200"><UserPlus className="h-3.5 w-3.5" /></span>
            Owner opts in on /medspa/app
          </li>
          {steps.map((s) => {
            const on = s.step === open;
            return (
              <li key={s.step}>
                <button type="button" onClick={() => pick(s.step)} aria-current={on ? "step" : undefined}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${on ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-sky-700">Email {s.step} · {describeDelay(s.delay_hours).replace(" after opt-in", "")}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${s.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.enabled ? "On" : "Off"}</span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">{s.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{s.subject}</span>
                  <span className="mt-1.5 block text-[11px] text-slate-400">{reached[s.step] ?? 0} owners reached (90 days)</span>
                </button>
              </li>
            );
          })}
          <li className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs leading-relaxed text-slate-500">
            Stops on its own when the owner books a walkthrough, pays, unsubscribes, or the preview is deleted (day 14).
          </li>
        </ol>

        {/* The open step */}
        <section className={`${card} p-5`}>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">Email {draft.step}</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-4 w-4 accent-sky-600" /> On
                </label>
              </div>
              <Field label="Timing" hint={describeDelay(draft.delay_hours)}>
                <div className="flex gap-2">
                  <input type="number" min={1} className={`${input} w-24`} value={days ? draft.delay_hours / 24 : draft.delay_hours}
                    onChange={(e) => { const n = Math.max(1, Math.round(Number(e.target.value) || 1)); set({ delay_hours: days ? n * 24 : n }); }} aria-label="Wait" />
                  <select className={`${input} w-auto`} value={days ? "days" : "hours"} aria-label="Unit"
                    onChange={(e) => set({ delay_hours: e.target.value === "days" ? Math.max(1, Math.round(draft.delay_hours / 24)) * 24 : draft.delay_hours + (draft.delay_hours % 24 === 0 ? 1 : 0) })}>
                    <option value="days">days after opt-in</option>
                    <option value="hours">hours after opt-in</option>
                  </select>
                </div>
              </Field>
              <Field label="Name (only you see this)"><input className={input} value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} /></Field>
              <Field label="Subject"><input className={input} value={draft.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={160} /></Field>
              <Field label="Preview text" hint="The grey line after the subject in the inbox."><input className={input} value={draft.preheader ?? ""} onChange={(e) => set({ preheader: e.target.value || null })} maxLength={160} /></Field>
              <Field label="Message" hint="A line with only {walkthrough_link}, {app_link} or {desk_link} becomes a button.">
                <textarea ref={body} className={`${input} h-72 resize-y font-mono text-[13px] leading-relaxed`} value={draft.body} onChange={(e) => set({ body: e.target.value })} maxLength={6000} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MERGE_TAGS.map((t) => (
                    <button key={t.tag} type="button" onClick={() => insert(t.tag)} title={t.what} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11.5px] text-slate-700 hover:bg-sky-50 hover:text-sky-800">{t.tag}</button>
                  ))}
                </div>
              </Field>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={save} disabled={busy !== null || !dirty} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
                <button type="button" onClick={test} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send me a test</button>
                {dirty && <button type="button" onClick={() => setDraft(cur)} className="h-10 px-2 text-sm text-slate-500 hover:text-slate-900">Discard</button>}
                {DEFAULT_STEPS.find((x) => x.step === draft.step) && (
                  <button type="button" onClick={() => { const d0 = DEFAULT_STEPS.find((x) => x.step === draft.step)!; setDraft({ ...d0, enabled: draft.enabled }); }} className="ml-auto inline-flex h-10 items-center gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-900"><RotateCcw className="h-3.5 w-3.5" />Starting copy</button>
                )}
              </div>
              {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Preview · sample owner</p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-600 text-xs font-bold text-white">AE</span>
                  <span className="min-w-0 text-sm"><b className="block text-slate-900">Atlas Engine</b><span className="block truncate font-semibold text-slate-800">{preview.subject}</span><span className="block truncate text-slate-500">{preview.preheader}</span></span>
                </div>
                <iframe title="Email preview" srcDoc={preview.html} className="h-[560px] w-full bg-white" sandbox="" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
