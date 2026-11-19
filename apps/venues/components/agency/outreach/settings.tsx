"use client";
/**
 * components/agency/outreach/settings.tsx — CP-250 · the sequence (3 steps), sending rules,
 * campaigns, mailbox check and the do-not-contact list.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, MailCheck, Pause, Play, Save } from "lucide-react";
import { DAY_NAMES, MAX_CAP, MERGE_TAGS, RAMP, type Settings, type Step } from "@/lib/outreach/shared";
import type { OutreachData } from "./outreach-app";
import { api, btnGhost, btnPrimary, card, input, inputBase, Note, useBusy, when } from "./ui";

export function SettingsTab({ data }: { data: OutreachData }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <section className={`${card} p-4`}>
          <h2 className="font-medium text-slate-900">Sequence</h2>
          <p className="mt-0.5 text-sm text-slate-500">Email 1 is written by Claude for each spa (this template is the fallback). Follow-ups are sent as replies in the same thread. Every email gets your signature, the postal address and an opt-out line. Tags: {MERGE_TAGS.join(" ")}</p>
          {!data.steps.length && <p className="mt-3 text-sm text-amber-800">No steps yet: apply the CP-250 SQL (it seeds the three emails).</p>}
          <div className="mt-4 space-y-4">{data.steps.map((s) => <StepEditor key={s.step} s={s} />)}</div>
        </section>
        <Campaigns data={data} />
      </div>
      <div className="space-y-5">
        <SendingRules settings={data.settings} disabled={data.sqlMissing} />
        <Mailbox data={data} />
        <DoNotContact data={data} />
      </div>
    </div>
  );
}

function StepEditor({ s }: { s: Step }) {
  const router = useRouter();
  const [d, setD] = useState(s);
  const { busy, setBusy, msg, setMsg } = useBusy();
  const dirty = JSON.stringify(d) !== JSON.stringify(s);
  async function save() {
    setBusy("save"); setMsg(null);
    const r = await api("save_step", d);
    setMsg(r.ok ? { ok: true, text: "Saved. New emails use this." } : { ok: false, text: r.error });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Step {s.step}</span>
        <input className={`${inputBase} w-auto flex-1`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Step name" />
        {s.step > 1 && (
          <label className="flex items-center gap-1 text-sm text-slate-600">wait
            <input type="number" min={0} max={60} className={`${inputBase} w-16`} value={d.delay_days} onChange={(e) => setD({ ...d, delay_days: Number(e.target.value) })} aria-label="Days to wait" /> days
          </label>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" className="accent-sky-600" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} /> On</label>
      </div>
      <input className={`${input} mt-2`} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} placeholder={s.step === 1 ? "Subject" : "Blank = reply in the same thread (Re: email 1)"} aria-label="Subject" />
      <textarea className={`${input} mt-2 min-h-[130px] leading-relaxed`} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-label="Email body" />
      {s.step === 1 && <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" className="accent-sky-600" checked={d.ai} onChange={(e) => setD({ ...d, ai: e.target.checked })} /> Let Claude write email 1 from each spa&apos;s website</label>}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btnPrimary} disabled={!dirty || busy !== null} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        <Note msg={msg} />
      </div>
    </div>
  );
}

function SendingRules({ settings, disabled }: { settings: Settings; disabled: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const { busy, setBusy, msg, setMsg } = useBusy();
  async function save(patch: Partial<Settings> = {}) {
    const next = { ...s, ...patch };
    setS(next); setBusy("save"); setMsg(null);
    const r = await api("save_settings", next);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  const toggleDay = (n: number) => setS({ ...s, send_days: s.send_days.includes(n) ? s.send_days.filter((x) => x !== n) : [...s.send_days, n].sort() });
  return (
    <section className={`${card} p-4 text-sm`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium text-slate-900">Sending rules</h2>
        <button type="button" className={btnGhost} disabled={disabled || busy !== null} onClick={() => save({ paused: !s.paused })}>{s.paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause all</>}</button>
      </div>
      {s.paused && s.paused_reason && <p className="mt-2 text-amber-800">{s.paused_reason}</p>}
      <label className="mt-3 block"><span className="text-slate-600">Daily cap (this mailbox)</span>
        <input type="number" min={0} max={MAX_CAP} className={`${inputBase} mt-1 block w-24`} value={s.daily_cap} onChange={(e) => setS({ ...s, daily_cap: Number(e.target.value) })} />
      </label>
      <p className="mt-1 text-xs text-slate-500">New domain warm-up: {RAMP.map((r) => `${r.week} ${r.cap}/day`).join(" · ")}. Never more than {MAX_CAP}.</p>
      <div className="mt-3">
        <span className="text-slate-600">Send days (spa&apos;s local time)</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAY_NAMES.map((n, i) => <button key={n} type="button" onClick={() => toggleDay(i)} className={`rounded-md border px-2 py-1 text-xs ${s.send_days.includes(i) ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-500"}`}>{n}</button>)}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <label className="text-slate-600">From <input type="number" min={0} max={23} className={`${inputBase} ml-1 inline-block w-16`} value={s.window_start} onChange={(e) => setS({ ...s, window_start: Number(e.target.value) })} /></label>
        <label className="text-slate-600">to <input type="number" min={1} max={24} className={`${inputBase} ml-1 inline-block w-16`} value={s.window_end} onChange={(e) => setS({ ...s, window_end: Number(e.target.value) })} /></label>
        <span className="text-xs text-slate-500">o&apos;clock</span>
      </div>
      <label className="mt-3 flex items-center gap-1.5 text-slate-600"><input type="checkbox" className="accent-sky-600" checked={s.approve_followups} onChange={(e) => setS({ ...s, approve_followups: e.target.checked })} /> Follow-ups also wait in Review</label>
      <label className="mt-3 block"><span className="text-slate-600">From name</span><input className={`${input} mt-1`} value={s.from_name} onChange={(e) => setS({ ...s, from_name: e.target.value })} /></label>
      <label className="mt-3 block"><span className="text-slate-600">Signature</span><textarea className={`${input} mt-1 min-h-[60px]`} value={s.signature} onChange={(e) => setS({ ...s, signature: e.target.value })} /></label>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={btnPrimary} disabled={disabled || busy !== null} onClick={() => save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rules</button>
        <Note msg={msg} />
      </div>
    </section>
  );
}

function Mailbox({ data }: { data: OutreachData }) {
  const { busy, setBusy, msg, setMsg } = useBusy();
  async function check() {
    setBusy("check"); setMsg(null);
    const r = await api<{ smtp: string; imap: string }>("check_mailbox");
    setMsg(r.ok ? { ok: r.data.smtp === "ok" && r.data.imap === "ok", text: `Sending (SMTP): ${r.data.smtp}. Reading (IMAP): ${r.data.imap}.` } : { ok: false, text: r.error });
    setBusy(null);
  }
  return (
    <section className={`${card} p-4 text-sm`}>
      <h2 className="font-medium text-slate-900">Mailbox</h2>
      <p className="mt-1 text-slate-600">{data.setup.from ? <>Sends as <span className="font-medium text-slate-800">{data.setup.from}</span></> : "Not connected. Add OUTREACH_SMTP_USER and OUTREACH_SMTP_PASS on Vercel."}</p>
      <p className="mt-1 text-slate-600">Live sending: <span className="font-medium">{data.setup.live ? "on (OUTREACH_SEND=1)" : "off"}</span></p>
      <button type="button" className={`${btnGhost} mt-3`} onClick={check} disabled={busy !== null || !data.setup.smtp}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />} Check mailbox</button>
      <p className="mt-1 text-xs text-slate-500">Logs in to send and read. Sends nothing.</p>
      <div className="mt-2"><Note msg={msg} /></div>
    </section>
  );
}

function Campaigns({ data }: { data: OutreachData }) {
  const router = useRouter();
  const { busy, setBusy, msg, setMsg } = useBusy();
  if (!data.campaigns.length) return null;
  async function toggle(id: string, paused: boolean) {
    setBusy(id); setMsg(null);
    const r = await api("campaign", { campaign_id: id, paused });
    if (!r.ok) setMsg({ ok: false, text: r.error });
    setBusy(null); router.refresh();
  }
  return (
    <section className={`${card} p-4 text-sm`}>
      <h2 className="font-medium text-slate-900">Campaigns</h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {data.campaigns.map((c) => {
          const n = data.leads.filter((l) => l.campaign_id === c.id);
          return (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span><span className="font-medium text-slate-800">{c.name}</span><span className="block text-xs text-slate-500">{n.length} spas · {n.filter((l) => l.step > 0).length} contacted · {n.filter((l) => ["replied", "booked"].includes(l.status)).length} replied · since {when(c.created_at)}</span></span>
              <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => toggle(c.id, !c.paused)}>{c.paused ? "Resume" : "Pause"}</button>
            </li>
          );
        })}
      </ul>
      <Note msg={msg} />
    </section>
  );
}

function DoNotContact({ data }: { data: OutreachData }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const { busy, setBusy, msg, setMsg } = useBusy();
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add"); setMsg(null);
    const r = await api("suppress", { value: v });
    if (r.ok) { setV(""); router.refresh(); } else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }
  return (
    <section className={`${card} p-4 text-sm`}>
      <h2 className="font-medium text-slate-900">Do not contact ({data.suppressions.length})</h2>
      <p className="mt-0.5 text-xs text-slate-500">Unsubscribes, bounces and &quot;no thanks&quot; are added on their own. Add clients or anyone else here: an email or a whole @domain.</p>
      <form className="mt-2 flex gap-2" onSubmit={add}>
        <input className={input} value={v} onChange={(e) => setV(e.target.value)} placeholder="name@spa.com or @spa.com" aria-label="Email or domain" />
        <button type="submit" className={btnGhost} disabled={busy !== null || v.trim().length < 3}><Ban className="h-4 w-4" /> Add</button>
      </form>
      <Note msg={msg} />
      {data.suppressions.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-xs text-slate-600">
          {data.suppressions.map((x) => <li key={x.value} className="flex justify-between gap-2"><span className="truncate">{x.value}</span><span className="text-slate-400">{x.reason.replace("_", " ")}</span></li>)}
        </ul>
      )}
    </section>
  );
}
