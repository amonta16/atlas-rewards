"use client";
/**
 * components/agency/outreach/settings.tsx — CP-250 · the sequence, sending rules, campaigns,
 * mailbox check and the do-not-contact list.
 * CP-250b: call steps (a To-do call instead of an email), Add step, and the Writing card: whether
 * Claude writes only the opening line or the whole first email, plus standing notes for every draft.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, MailCheck, MessageCircle, Pause, Phone, Play, Plus, Save } from "lucide-react";
import { DAY_NAMES, MAX_CAP, MERGE_TAGS, RAMP, STEP_KIND_LABEL, type Settings, type Step, type StepKind, type WriteMode } from "@/lib/outreach/shared";
import type { OutreachData } from "./outreach-app";
import { api, btnGhost, btnPrimary, card, input, inputBase, Note, useBusy, when } from "./ui";

export function SettingsTab({ data }: { data: OutreachData }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <Writing settings={data.settings} disabled={data.sqlMissing} />
        <section className={`${card} p-4`}>
          <h2 className="font-medium text-slate-900">Sequence</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {data.settings.write_mode === "full"
              ? "Claude writes all of email 1 for each spa (this template is the fallback)."
              : "Email 1 is your template; Claude writes the {opener} line for each spa from its website."}
            {" "}Follow-ups are sent as replies in the same thread. A call or Instagram DM step puts the spa on your To-do list instead, for you to do by hand (skipped when there&apos;s no phone number or Instagram handle; Claude drafts each spa&apos;s DM from its site). Every email gets your signature, the postal address and an opt-out line. Tags: {MERGE_TAGS.join(" ")}
          </p>
          {!data.steps.length && <p className="mt-3 text-sm text-amber-800">No steps yet: apply the CP-250 SQL (it seeds the emails).</p>}
          <div className="mt-4 space-y-4">{data.steps.map((s) => <StepEditor key={s.step} s={s} />)}</div>
          <AddStep steps={data.steps} disabled={data.sqlMissing} />
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
  const call = d.kind === "call";
  const dm = d.kind === "instagram_dm";
  const manual = call || dm;
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
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${call ? "bg-amber-50 text-amber-900" : dm ? "bg-pink-50 text-pink-900" : "bg-slate-100 text-slate-700"}`}>{call && <Phone className="h-3 w-3" />}{dm && <MessageCircle className="h-3 w-3" />}Step {s.step}</span>
        <input className={`${inputBase} w-auto flex-1`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Step name" />
        {s.step > 1 && (
          <label className="flex items-center gap-1 text-sm text-slate-600">wait
            <input type="number" min={0} max={60} className={`${inputBase} w-16`} value={d.delay_days} onChange={(e) => setD({ ...d, delay_days: Number(e.target.value) })} aria-label="Days to wait" /> days
          </label>
        )}
        {s.step > 1 && (
          <select className={`${inputBase} w-auto`} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as StepKind })} aria-label="Step type">
            {(Object.keys(STEP_KIND_LABEL) as StepKind[]).map((k) => <option key={k} value={k}>{STEP_KIND_LABEL[k]}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" className="accent-sky-600" checked={d.enabled} onChange={(e) => setD({ ...d, enabled: e.target.checked })} /> On</label>
      </div>
      {!manual && <input className={`${input} mt-2`} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} placeholder={s.step === 1 ? "Subject" : "Blank = reply in the same thread (Re: email 1)"} aria-label="Subject" />}
      {call && <p className="mt-2 text-xs text-slate-500">On the day, the spa shows up on your To-do list with its number and this script. The emails after it carry on either way.</p>}
      {dm && <p className="mt-2 text-xs text-slate-500">On the day, the spa shows up on your To-do list with its Instagram link and a DM Claude drafted from its site (this text is the fallback). You send it yourself; nothing goes to Instagram automatically. No links in DMs.</p>}
      <textarea className={`${input} mt-2 ${dm ? "min-h-[80px]" : "min-h-[130px]"} leading-relaxed`} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-label={call ? "Call script" : dm ? "Instagram DM" : "Email body"} placeholder={call ? "What to say when they pick up" : undefined} />
      {s.step === 1 && <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" className="accent-sky-600" checked={d.ai} onChange={(e) => setD({ ...d, ai: e.target.checked })} /> Let Claude write email 1 from each spa&apos;s website</label>}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className={btnPrimary} disabled={!dirty || busy !== null} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        <Note msg={msg} />
      </div>
    </div>
  );
}

/** A new step at the end of the sequence (up to 10), saved straight away with a starting text. */
function AddStep({ steps, disabled }: { steps: Step[]; disabled: boolean }) {
  const router = useRouter();
  const { busy, setBusy, msg, setMsg } = useBusy();
  const next = Math.max(0, ...steps.map((s) => s.step)) + 1;
  if (!steps.length || next > 10) return null;
  async function add(kind: StepKind) {
    setBusy(kind); setMsg(null);
    const r = await api("save_step", kind === "call"
      ? { step: next, kind, name: "Call the front desk", delay_days: 2, subject: "", enabled: true, body: "Hi, this is Andrew with Atlas Engine. I sent {spa_name} a couple of emails about a patient app. Who's the best person to talk to about that?" }
      : kind === "instagram_dm"
        ? { step: next, kind, name: "Instagram DM", delay_days: 2, subject: "", enabled: true, body: "Hi! I'm Andrew from Atlas Engine. I build branded patient apps for med spas, and I emailed {spa_name} about one. Would a quick preview of what yours could look like be useful?" }
        : { step: next, kind, name: "Follow-up", delay_days: 4, subject: "", enabled: true, body: "Hi {first_name},\n\n" });
    setMsg(r.ok ? { ok: true, text: `Added step ${next}. Edit it above.` } : { ok: false, text: r.error });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" className={btnGhost} disabled={disabled || busy !== null} onClick={() => add("email")}>{busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add email</button>
      <button type="button" className={btnGhost} disabled={disabled || busy !== null} onClick={() => add("call")}>{busy === "call" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />} Add call</button>
      <button type="button" className={btnGhost} disabled={disabled || busy !== null} onClick={() => add("instagram_dm")}>{busy === "instagram_dm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Add Instagram DM</button>
      <Note msg={msg} />
    </div>
  );
}

/** How Claude writes email 1, and the notes every draft follows (tune one draft, then Redraft all). */
function Writing({ settings, disabled }: { settings: Settings; disabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<WriteMode>(settings.write_mode === "full" ? "full" : "opener");
  const [notes, setNotes] = useState(settings.writing_notes ?? "");
  const { busy, setBusy, msg, setMsg } = useBusy();
  const dirty = mode !== settings.write_mode || notes.trim() !== (settings.writing_notes ?? "").trim();
  async function save() {
    setBusy("save"); setMsg(null);
    const r = await api("save_writing", { write_mode: mode, writing_notes: notes });
    setMsg(r.ok ? { ok: true, text: "Saved. New drafts use this; Review → Redraft all applies it to the waiting ones." } : { ok: false, text: r.error });
    setBusy(null);
    if (r.ok) router.refresh();
  }
  return (
    <section className={`${card} p-4 text-sm`}>
      <h2 className="font-medium text-slate-900">How Claude writes email 1</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ["opener", "Opening line only", "Claude writes one or two personal sentences from their site ({opener}). The rest is your template, word for word. Faster to review, every claim is yours."],
          ["full", "The whole email", "Claude writes all of email 1 from their site, inside the same rules. More varied, more to check."],
        ] as Array<[WriteMode, string, string]>).map(([v, label, text]) => (
          <label key={v} className={`cursor-pointer rounded-lg border p-3 ${mode === v ? "border-sky-600 bg-sky-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
            <span className="flex items-center gap-2 font-medium text-slate-800"><input type="radio" name="write_mode" className="accent-sky-600" checked={mode === v} onChange={() => setMode(v)} />{label}</span>
            <span className="mt-1 block text-xs text-slate-500">{text}</span>
          </label>
        ))}
      </div>
      <label className="mt-3 block"><span className="text-slate-600">Notes for every draft</span>
        <textarea className={`${input} mt-1 min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000}
          placeholder={"e.g. Mention their membership if they have one. Keep the opener under 25 words. Never mention prices."} />
      </label>
      <p className="mt-1 text-xs text-slate-500">Claude follows these unless they break the built-in rules (no links, stats, brand names or medical claims).</p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className={btnPrimary} disabled={disabled || !dirty || busy !== null} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        <Note msg={msg} />
      </div>
    </section>
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
      <label className="mt-3 block"><span className="text-slate-600">Opt-out style</span>
        <select className={`${inputBase} mt-1 block w-full`} value={s.optout_style ?? "reply"} onChange={(e) => setS({ ...s, optout_style: e.target.value === "link" ? "link" : "reply" })}>
          <option value="reply">Reply only (recommended)</option>
          <option value="link">Reply + unsubscribe link</option>
        </select>
      </label>
      <p className="mt-1 text-xs text-slate-500">{(s.optout_style ?? "reply") === "link"
        ? "Adds a one-click unsubscribe link and the List-Unsubscribe headers. Those read as bulk mail, so emails are more likely to land in Promotions."
        : "Ends with \u201cJust reply \u2018no thanks\u2019 and I won\u2019t email again.\u201d No link, no bulk-mail headers. Any reply stops the sequence, and \u201cno thanks\u201d, \u201cunsubscribe\u201d or \u201cstop\u201d also adds them to do-not-contact. The postal address stays either way."}</p>
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
