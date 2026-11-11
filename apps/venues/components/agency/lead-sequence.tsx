"use client";
/**
 * Lead-magnet audit, step 6 · Admin → Lead funnel, the follow-up as you'll run it:
 *   SequenceEditor  every step on one clock (0:45 text … day 14 email): channel, timing, copy or call
 *                   script, on/off, with a live preview (email / text bubble with segments / script)
 *   FollowThrough   call tasks due now (call link, script with their numbers, one-tap outcome), then
 *                   every lead's row of steps: sent, would send, skipped (and why), task, cancelled
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Mail, MessageSquare, Phone, RotateCcw, Send, UserPlus, X } from "lucide-react";
import { MERGE_TAGS, SAMPLE_VALUES, renderStep } from "@/lib/landing/lead-nurture";
import { CHANNEL_LABEL, DEFAULT_SEQUENCE, OUTCOMES, fill, smsSegments, whenLabel, type Channel, type LogStatus, type Outcome, type SeqStep } from "@/lib/landing/lead-sequence";

const card = "rounded-xl border border-slate-200 bg-white";
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";
const ICON: Record<Channel, typeof Mail> = { email: Mail, sms: MessageSquare, call: Phone };
const TINT: Record<Channel, string> = { email: "text-sky-700 bg-sky-50", sms: "text-violet-700 bg-violet-50", call: "text-amber-800 bg-amber-50" };

export type SequenceProps = { steps: SeqStep[]; saved: boolean; emailLive: boolean; smsLive: boolean; hasPostal: boolean; reached: Record<number, number> };

/* ───────────────────────── the sequence ───────────────────────── */

export function SequenceEditor({ steps: initial, saved, emailLive, smsLive, hasPostal, reached }: SequenceProps) {
  const router = useRouter();
  const [steps, setSteps] = useState(initial);
  const [open, setOpen] = useState(initial[0]?.step ?? 1);
  const cur = steps.find((s) => s.step === open) ?? steps[0];
  const [draft, setDraft] = useState<SeqStep>(cur);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cur);

  const pick = (n: number) => {
    if (dirty && !confirm("Discard your unsaved changes to this step?")) return;
    setOpen(n); setDraft(steps.find((x) => x.step === n)!); setMsg(null);
  };
  const set = (p: Partial<SeqStep>) => setDraft((d) => ({ ...d, ...p }));
  const insert = (tag: string) => {
    const el = body.current;
    if (!el) { set({ body: draft.body + tag }); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    set({ body: draft.body.slice(0, a) + tag + draft.body.slice(b) });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
  };
  async function save() {
    setBusy("save"); setMsg(null);
    const r = await fetch("/api/agency/lead-sequence", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setSteps((all) => all.map((s) => (s.step === draft.step ? draft : s))); setMsg({ ok: true, text: "Saved. The next run uses this." }); router.refresh(); }
    else setMsg({ ok: false, text: j.error ?? "Couldn't save." });
    setBusy(null);
  }
  async function test() {
    setBusy("test"); setMsg(null);
    const r = await fetch("/api/agency/lead-sequence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", subject: draft.subject, preheader: draft.preheader, body: draft.body }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: `Test sent to ${j.to}.` } : { ok: false, text: j.error ?? "Couldn't send the test." });
    setBusy(null);
  }

  // timing in the unit it reads best in
  const unit: "min" | "h" | "d" = draft.delay_minutes % 1440 === 0 ? "d" : draft.delay_minutes % 60 === 0 ? "h" : "min";
  const per = unit === "d" ? 1440 : unit === "h" ? 60 : 1;
  const filled = fill(draft.body, SAMPLE_VALUES);
  const seg = smsSegments(filled);
  const email = useMemo(() => draft.channel === "email" ? renderStep({ subject: draft.subject ?? "", preheader: draft.preheader, body: draft.body }, SAMPLE_VALUES, { unsubscribeUrl: "#", postalAddress: hasPostal ? "Your mailing address" : null }) : null, [draft, hasPostal]);
  const Icon = ICON[draft.channel];

  return (
    <div className="mt-5 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Switch on={emailLive} label="Emails" off="Nothing goes out until LEAD_NURTURE_SEND=1 is set on Vercel." onText="Sending to every owner who unlocks their app." />
        <Switch on={smsLive} label="Texts" off="Nothing goes out until PREVIEW_SMS_SEND=1 and Twilio are set." onText="Sending to owners with SMS consent on file." />
      </div>
      {!saved && <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Showing the starting schedule. Saving (and the texts and call tasks) need the CP-243 SQL; until then the 3 CP-238 emails run.</p>}
      {!hasPostal && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Add MAIL_POSTAL_ADDRESS on Vercel before turning emails on. US law (CAN-SPAM) needs a mailing address in marketing emails.</p>}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <ol className="space-y-2" aria-label="Follow-up sequence">
          <li className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white ring-1 ring-slate-200"><UserPlus className="h-3.5 w-3.5" /></span>
            Owner unlocks their app (email + zip)
          </li>
          {steps.map((s) => {
            const on = s.step === open;
            const I = ICON[s.channel];
            return (
              <li key={s.step}>
                <button type="button" onClick={() => pick(s.step)} aria-current={on ? "step" : undefined}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${on ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"} ${s.enabled ? "" : "opacity-60"}`}>
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${TINT[s.channel]}`}><I className="h-3.5 w-3.5" />{whenLabel(s.delay_minutes)} · {CHANNEL_LABEL[s.channel]}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${s.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{s.enabled ? "On" : "Off"}</span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-slate-900">{s.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{s.channel === "email" ? s.subject : s.body}</span>
                  <span className="mt-1.5 block text-[11px] text-slate-400">{reached[s.step] ?? 0} owners reached (30 days)</span>
                </button>
              </li>
            );
          })}
          <li className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-xs leading-relaxed text-slate-500">
            Booking a walkthrough or paying cancels everything left, open call tasks too. Any reply to a text stops the texts. Unsubscribing stops the emails.
          </li>
        </ol>

        <section className={`${card} p-5`}>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Icon className="h-4 w-4" />Step {draft.step} · {CHANNEL_LABEL[draft.channel]}</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-4 w-4 accent-sky-600" /> On
                </label>
              </div>
              <Field label="Timing" hint={`${whenLabel(draft.delay_minutes)} after they unlock their app`}>
                <div className="flex gap-2">
                  <input type="number" min={1} className={`${input} w-24`} value={Math.round(draft.delay_minutes / per)} aria-label="Wait"
                    onChange={(e) => set({ delay_minutes: Math.max(1, Math.round(Number(e.target.value) || 1)) * per })} />
                  <select className={`${input} w-auto`} value={unit} aria-label="Unit"
                    onChange={(e) => { const u = e.target.value === "d" ? 1440 : e.target.value === "h" ? 60 : 1; set({ delay_minutes: Math.max(1, Math.round(draft.delay_minutes / per)) * u }); }}>
                    <option value="min">minutes</option><option value="h">hours</option><option value="d">days</option>
                  </select>
                </div>
              </Field>
              <Field label="Name (only you see this)"><input className={input} value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={60} /></Field>
              {draft.channel === "email" && <>
                <Field label="Subject"><input className={input} value={draft.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} maxLength={160} /></Field>
                <Field label="Preview text" hint="The grey line after the subject in the inbox."><input className={input} value={draft.preheader ?? ""} onChange={(e) => set({ preheader: e.target.value || null })} maxLength={160} /></Field>
              </>}
              <Field label={draft.channel === "email" ? "Message" : draft.channel === "sms" ? "Text" : "Call script (for you)"}
                hint={draft.channel === "email" ? "A line with only {walkthrough_link}, {app_link} or {desk_link} becomes a button." : draft.channel === "sms" ? `${seg.chars} characters with sample links · ${seg.segments} segment${seg.segments === 1 ? "" : "s"}${seg.unicode ? " (emoji/accents make segments shorter)" : ""}. Keep "Reply STOP to opt out."` : "Shown on the call task with their numbers filled in."}>
                <textarea ref={body} className={`${input} ${draft.channel === "sms" ? "h-32" : "h-72"} resize-y font-mono text-[13px] leading-relaxed`} value={draft.body} onChange={(e) => set({ body: e.target.value })} maxLength={draft.channel === "sms" ? 600 : 6000} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MERGE_TAGS.map((t) => <button key={t.tag} type="button" onClick={() => insert(t.tag)} title={t.what} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11.5px] text-slate-700 hover:bg-sky-50 hover:text-sky-800">{t.tag}</button>)}
                </div>
              </Field>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={save} disabled={busy !== null || !dirty || !saved} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
                {draft.channel === "email" && <button type="button" onClick={test} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40">{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send me a test</button>}
                {dirty && <button type="button" onClick={() => setDraft(cur)} className="h-10 px-2 text-sm text-slate-500 hover:text-slate-900">Discard</button>}
                {DEFAULT_SEQUENCE.find((x) => x.step === draft.step) && (
                  <button type="button" onClick={() => { const d0 = DEFAULT_SEQUENCE.find((x) => x.step === draft.step)!; setDraft({ ...d0, enabled: draft.enabled }); }} className="ml-auto inline-flex h-10 items-center gap-1.5 px-2 text-xs text-slate-500 hover:text-slate-900"><RotateCcw className="h-3.5 w-3.5" />Starting copy</button>
                )}
              </div>
              {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Preview · sample owner</p>
              {email && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-600 text-xs font-bold text-white">AE</span>
                    <span className="min-w-0 text-sm"><b className="block text-slate-900">Atlas Engine</b><span className="block truncate font-semibold text-slate-800">{email.subject}</span><span className="block truncate text-slate-500">{email.preheader}</span></span>
                  </div>
                  <iframe title="Email preview" srcDoc={email.html} className="h-[560px] w-full bg-white" sandbox="" />
                </div>
              )}
              {draft.channel === "sms" && (
                <div className="rounded-[28px] bg-slate-100 p-5">
                  <p className="text-center text-[11px] text-slate-500">Text message · from Atlas Engine</p>
                  <p className="mt-3 max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] rounded-bl-[6px] bg-white px-4 py-2.5 text-[14px] leading-snug text-slate-900 shadow-sm">{filled}</p>
                </div>
              )}
              {draft.channel === "call" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <p className="text-sm font-semibold text-amber-900">Call task · shows in Follow-through when it&apos;s due, and you get an email.</p>
                  <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">{filled}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Switch({ on, label, onText, off }: { on: boolean; label: string; onText: string; off: string }) {
  return (
    <p className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${on ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
      {on ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span><b>{label} {on ? "are on." : "are off."}</b> {on ? onText : off}</span>
    </p>
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

/* ───────────────────────── follow-through ───────────────────────── */

export type LogCell = { status: LogStatus; reason: string | null; outcome: Outcome | null; at: string; dueAt: string };
export type FollowLead = {
  id: string; slug: string; spa: string; email: string | null; optedAt: string; nextStep: number;
  stopped: string | null; smsStopped: boolean; smsOk: boolean; unsubscribed: boolean; log: Record<number, LogCell>;
  /** CP-245: booked inside the 4-hour launch-bonus window (the bonuses are owed). */
  bonus?: boolean;
};
export type CallTask = { logId: string; previewId: string; spa: string; step: number; name: string; phone: string | null; whose: string; dueAt: string; script: string; appUrl: string };
export type FollowData = { leads: FollowLead[]; tasks: CallTask[]; now: number };

const CELL: Record<LogStatus | "due" | "later", { cls: string; label: string }> = {
  sent: { cls: "bg-emerald-500 text-white", label: "Sent" },
  would_send: { cls: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300", label: "Would send (sending is off)" },
  skipped: { cls: "bg-slate-200 text-slate-500", label: "Skipped" },
  failed: { cls: "bg-red-500 text-white", label: "Failed" },
  task_open: { cls: "bg-amber-400 text-amber-950", label: "Call task open" },
  task_done: { cls: "bg-amber-600 text-white", label: "Called" },
  cancelled: { cls: "bg-white text-slate-300 ring-1 ring-slate-200 line-through", label: "Cancelled" },
  due: { cls: "bg-white text-sky-700 ring-2 ring-sky-400", label: "Due now (next run)" },
  later: { cls: "bg-white text-slate-300 ring-1 ring-slate-200", label: "Not yet" },
};

export function FollowThrough({ data, steps }: { data: FollowData; steps: SeqStep[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function act(body: Record<string, unknown>, key: string) {
    setBusy(key); setErr(null);
    const r = await fetch("/api/agency/lead-sequence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error ?? "Couldn't save."); else router.refresh();
    setBusy(null);
  }
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const now = data.now; // from the server, so the page renders the same on both sides

  return (
    <div className="mt-5 space-y-5">
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <section className={`${card} overflow-hidden`}>
        <h2 className="flex items-center gap-2 px-5 pt-4 text-sm font-semibold text-slate-900"><Phone className="h-4 w-4" />Calls to make <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{data.tasks.length}</span></h2>
        {data.tasks.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">No calls waiting. New ones show up here (and in your email) when they come due.</p> : (
          <ul className="mt-2 divide-y divide-slate-100">
            {data.tasks.map((t) => (
              <li key={t.logId} className="grid gap-3 px-5 py-4 lg:grid-cols-[260px_1fr_auto]">
                <div>
                  <p className="font-semibold text-slate-900">{t.spa}</p>
                  <p className="text-xs text-slate-500">{t.name} · due {fmt(t.dueAt)}</p>
                  {t.phone ? <a href={`tel:${t.phone}`} className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"><Phone className="h-3.5 w-3.5" />{t.phone}</a> : <p className="mt-1.5 text-sm text-red-600">No number</p>}
                  <p className="mt-1 text-[11px] text-slate-500">{t.whose} · <a href={t.appUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">their app</a></p>
                </div>
                <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700">{t.script}</p>
                <div className="flex flex-wrap content-start gap-1.5 lg:w-[220px]">
                  {OUTCOMES.map((o) => (
                    <button key={o.id} type="button" disabled={busy !== null} onClick={() => act({ action: "outcome", log_id: t.logId, outcome: o.id }, t.logId + o.id)}
                      className={`h-8 rounded-lg px-2.5 text-xs font-semibold ring-1 disabled:opacity-40 ${o.id === "booked" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}>
                      {busy === t.logId + o.id ? "…" : o.label}
                    </button>
                  ))}
                  <p className="w-full text-[11px] text-slate-400">Booked or Not a fit ends their follow-up.</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">Every lead, step by step <span className="font-normal text-slate-500">(unlocked in the last 30 days)</span></h2>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            {(["sent", "would_send", "task_open", "task_done", "skipped", "cancelled", "due"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded ${CELL[k].cls}`} />{CELL[k].label}</span>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Owner</th>
                {steps.map((s) => { const I = ICON[s.channel]; return <th key={s.step} className="px-1 py-2 text-center font-medium" title={`${s.name} · ${whenLabel(s.delay_minutes)}`}><span className="inline-flex flex-col items-center gap-0.5"><I className="h-3.5 w-3.5" />{whenLabel(s.delay_minutes)}</span></th>; })}
                <th className="px-5 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.leads.length === 0 && <tr><td colSpan={steps.length + 2} className="px-5 py-6 text-center text-slate-500">Nobody has unlocked an app in the last 30 days.</td></tr>}
              {data.leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-2.5"><span className="flex items-center gap-1.5 font-medium text-slate-900">{l.spa}{l.bonus && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10.5px] font-semibold text-amber-900" title="Booked inside the 4-hour window: launch videos, launch kit and software audit are owed">Bonus owed</span>}</span><span className="block text-xs text-slate-500">{l.email ?? "—"} · {fmt(l.optedAt)}</span></td>
                  {steps.map((s, i) => {
                    const c = l.log[s.step];
                    const dueTime = Date.parse(l.optedAt) + s.delay_minutes * 60_000;
                    const k: keyof typeof CELL = c ? c.status : !l.stopped && i >= l.nextStep && dueTime <= now ? "due" : "later";
                    const tip = c ? `${CELL[k].label}${c.outcome ? `: ${OUTCOMES.find((o) => o.id === c.outcome)?.label}` : ""}${c.reason ? ` (${c.reason})` : ""} · ${fmt(c.at)}` : `${CELL[k].label} · ${fmt(new Date(dueTime).toISOString())}`;
                    return <td key={s.step} className="px-1 py-2.5 text-center"><span title={tip} aria-label={tip} className={`mx-auto grid h-6 w-6 place-items-center rounded-md text-[10px] font-bold ${CELL[k].cls}`}>{c?.status === "task_done" ? <Check className="h-3 w-3" /> : c?.status === "failed" ? <X className="h-3 w-3" /> : ""}</span></td>;
                  })}
                  <td className="px-5 py-2.5 text-xs">
                    {l.stopped ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">Ended: {l.stopped}</span> : (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">Running</span>
                        {!l.smsOk && <span className="text-slate-500">no SMS consent</span>}
                        {l.smsStopped && <span className="text-slate-500">texts stopped (replied)</span>}
                        {l.unsubscribed && <span className="text-slate-500">unsubscribed</span>}
                        <button type="button" disabled={busy !== null} onClick={() => { if (confirm(`End the follow-up for ${l.spa}?`)) act({ action: "stop", preview_id: l.id }, l.id); }} className="text-slate-500 underline-offset-2 hover:text-red-600 hover:underline">End</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
