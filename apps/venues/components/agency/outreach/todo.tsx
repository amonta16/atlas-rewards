"use client";
/**
 * components/agency/outreach/todo.tsx — CP-250b · what needs you, not the engine:
 *   Instagram   CP-250c: an Instagram step came up: their profile, the DM Claude drafted from their site
 *               (edit, Copy, send it yourself from the Atlas account), and how it went (sent / replied /
 *               not interested / booked / no IG). Nothing is sent to Instagram automatically.
 *   Calls       a call step came up for these spas: their number, their local time, the script, and how
 *               it went (talked / voicemail / no answer / not interested / booked). "Not interested"
 *               and "Booked" stop the sequence; the rest just log a note and the emails carry on.
 *   Re-contact  spas that said "not now", once their date comes up: open the thread in Gmail, then
 *               mark it followed up or push the date out.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Copy, ExternalLink, Loader2, MessageCircle, Phone } from "lucide-react";
import { OUTCOMES, OUTCOME_LABEL, instagramDmUrl, instagramUrl, type Lead, type Task, type TaskOutcome } from "@/lib/outreach/shared";
import { localParts } from "@/lib/outreach/time";
import type { OutreachData } from "./outreach-app";
import { api, btnGhost, btnPrimary, card, Empty, FitPill, gmailSearch, input, Note, useBusy, when } from "./ui";

const DAY = 86_400_000;
/** Dates in your own time zone (the date picker and the "due" check), not UTC. */
const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const today = () => ymd(new Date());
const plusDays = (n: number) => ymd(new Date(Date.now() + n * DAY));

/** How many things on the To-do list are due now (the tab's badge). */
export function todoCount(data: OutreachData): number {
  const leads = new Set(data.leads.map((l) => l.id));
  const calls = data.tasks.filter((t) => leads.has(t.lead_id) && Date.parse(t.due_at) <= Date.now()).length;
  const later = data.leads.filter((l) => l.status === "later" && l.recontact_at && l.recontact_at <= today()).length;
  return calls + later;
}

export function TodoTab({ data, showLead }: { data: OutreachData; showLead: (id: string) => void }) {
  const leads = new Map(data.leads.map((l) => [l.id, l]));
  const open = data.tasks.filter((t) => leads.has(t.lead_id)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const calls = open.filter((t) => t.kind === "call");
  const dms = open.filter((t) => t.kind === "instagram_dm");
  const dmStep = data.steps.some((s) => s.kind === "instagram_dm" && s.enabled);
  const later = data.leads.filter((l) => l.status === "later").sort((a, b) => (a.recontact_at ?? "").localeCompare(b.recontact_at ?? ""));
  const due = later.filter((l) => l.recontact_at && l.recontact_at <= plusDays(7));
  const callStep = data.steps.some((s) => s.kind === "call" && s.enabled);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-medium text-slate-900"><MessageCircle className="h-4 w-4 text-slate-500" /> Instagram DMs ({dms.length})</h2>
        {!dms.length
          ? <Empty title="No DMs to send" text={dmStep ? "When a spa reaches the Instagram step (and we found its handle), it shows up here with a DM drafted from its site. You send it yourself from the Atlas account." : "There's no Instagram step in the sequence. Add one in Sequence & settings."} />
          : dms.map((t) => <DmCard key={t.id} t={t} lead={leads.get(t.lead_id)!} showLead={showLead} />)}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-medium text-slate-900"><Phone className="h-4 w-4 text-slate-500" /> Calls ({calls.length})</h2>
        {!calls.length
          ? <Empty title="No calls to make" text={callStep ? "When a spa reaches the call step of the sequence (and has a phone number), it shows up here with a short script." : "There's no call step in the sequence. Add one in Sequence & settings if you want calls between the emails."} />
          : calls.map((t) => <CallCard key={t.id} t={t} lead={leads.get(t.lead_id)!} showLead={showLead} />)}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-medium text-slate-900"><CalendarClock className="h-4 w-4 text-slate-500" /> Re-contact ({due.length} due this week{later.length > due.length ? `, ${later.length - due.length} later` : ""})</h2>
        {!due.length
          ? <Empty title="Nobody to re-contact yet" text={'Spas that reply "not now" go on the Later list with a date (60 days out unless you change it). They show up here the week it comes up.'} />
          : due.map((l) => <LaterCard key={l.id} lead={l} mailbox={data.setup.user} showLead={showLead} />)}
        {later.length > due.length && (
          <p className="text-xs text-slate-500">Coming up: {later.filter((l) => !due.includes(l)).slice(0, 12).map((l) => `${l.business_name} (${l.recontact_at ?? "no date"})`).join(" · ")}</p>
        )}
      </section>
    </div>
  );
}

function CallCard({ t, lead, showLead }: { t: Task; lead: Lead; showLead: (id: string) => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [script, setScript] = useState(false);
  const { busy, setBusy, msg, setMsg } = useBusy();
  const tz = lead.timezone || "America/Los_Angeles";
  const local = localParts(Date.now(), tz);
  const clock = new Date().toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const open = local.hour >= 9 && local.hour < 18 && local.day >= 1 && local.day <= 5;
  const overdue = Date.now() - Date.parse(t.due_at) > 2 * DAY;

  async function done(outcome: TaskOutcome) {
    setBusy(outcome); setMsg(null);
    const r = await api("task_done", { task_id: t.id, outcome, note });
    if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }

  return (
    <article className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button type="button" className="text-left font-medium text-slate-900 hover:text-sky-700" onClick={() => showLead(lead.id)}>{lead.business_name}</button>
          <p className="mt-0.5 text-xs text-slate-500">{[lead.city, lead.state].filter(Boolean).join(", ")}{lead.first_name ? ` · ask for ${lead.first_name}` : ""} · step {t.step} · due {when(t.due_at)}{overdue ? " (overdue)" : ""}</p>
        </div>
        <FitPill fit={lead.fit} reason={lead.fit_reason} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {lead.phone && <a href={`tel:${lead.phone}`} className={btnPrimary}><Phone className="h-4 w-4" /> {lead.phone}</a>}
        <span className={open ? "text-slate-600" : "text-amber-800"}>{clock} their time{open ? "" : " (they may be closed)"}</span>
        <button type="button" className="text-xs font-medium text-sky-700 hover:underline" onClick={() => setScript((v) => !v)}>{script ? "Hide" : "Show"} script</button>
      </div>
      {script && t.script && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{t.script}</p>}
      <input className={`${input} mt-3`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note (optional): who you spoke to, best time, their email…" aria-label="Call note" />
      <div className="mt-2 flex flex-wrap gap-2">
        {OUTCOMES.call.map((o) => (
          <button key={o} type="button" className={btnGhost} disabled={busy !== null} onClick={() => done(o)}>{busy === o && <Loader2 className="h-4 w-4 animate-spin" />}{OUTCOME_LABEL[o]}</button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">Not interested and Booked stop the emails (not interested also adds them to do-not-contact). The others just log a note; the emails carry on.</p>
      <Note msg={msg} />
    </article>
  );
}

/** CP-250c · one Instagram DM to send by hand: open their profile or a DM thread, copy the text, log it. */
function DmCard({ t, lead, showLead }: { t: Task; lead: Lead; showLead: (id: string) => void }) {
  const router = useRouter();
  const [text, setText] = useState(t.script ?? "");
  const [copied, setCopied] = useState(false);
  const { busy, setBusy, msg, setMsg } = useBusy();
  const overdue = Date.now() - Date.parse(t.due_at) > 2 * DAY;

  const box = useRef<HTMLTextAreaElement>(null);
  /** Clipboard API first; where it's blocked, copy from the selected text; else leave it selected. */
  async function copy() {
    setMsg(null);
    const ok = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };
    try { await navigator.clipboard.writeText(text); ok(); return; } catch { /* fall through */ }
    const el = box.current;
    el?.focus(); el?.select();
    let done = false;
    try { done = document.execCommand("copy"); } catch { done = false; }
    if (done) ok(); else setMsg({ ok: false, text: "Your browser blocked copying: the text is selected, press Ctrl+C (⌘C on a Mac)." });
  }
  async function done(outcome: TaskOutcome) {
    setBusy(outcome); setMsg(null);
    const r = await api("task_done", { task_id: t.id, outcome });
    if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }

  return (
    <article className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button type="button" className="text-left font-medium text-slate-900 hover:text-sky-700" onClick={() => showLead(lead.id)}>{lead.business_name}</button>
          <p className="mt-0.5 text-xs text-slate-500">{[lead.city, lead.state].filter(Boolean).join(", ")} · step {t.step} · due {when(t.due_at)}{overdue ? " (overdue)" : ""}</p>
        </div>
        <FitPill fit={lead.fit} reason={lead.fit_reason} />
      </div>
      {lead.instagram ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <a href={instagramDmUrl(lead.instagram)} target="_blank" rel="noreferrer" className={btnPrimary}><MessageCircle className="h-4 w-4" /> Message @{lead.instagram}</a>
          <a href={instagramUrl(lead.instagram)} target="_blank" rel="noreferrer" className={btnGhost}>Profile <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      ) : <p className="mt-3 text-sm text-amber-800">No Instagram handle anymore: add it in the lead&apos;s drawer, or mark No IG.</p>}
      <label className="mt-3 block text-sm"><span className="text-slate-600">DM {text.length > 300 && <span className="text-amber-700">({text.length} characters: shorter reads better)</span>}</span>
        <textarea ref={box} className={`${input} mt-1 min-h-[90px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label="Instagram DM" />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} onClick={copy} disabled={!text.trim()}>{copied ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}</button>
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        {OUTCOMES.instagram_dm.map((o) => (
          <button key={o} type="button" className={btnGhost} disabled={busy !== null} onClick={() => done(o)}>{busy === o && <Loader2 className="h-4 w-4 animate-spin" />}{OUTCOME_LABEL[o]}</button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">Send it yourself from the Atlas account (nothing is sent automatically), then mark Sent. Replied, Not interested and Booked stop the emails; No IG clears the handle.</p>
      <Note msg={msg} />
    </article>
  );
}

function LaterCard({ lead, mailbox, showLead }: { lead: Lead; mailbox: string | null; showLead: (id: string) => void }) {
  const router = useRouter();
  const { busy, setBusy, msg, setMsg } = useBusy();
  const overdue = !!lead.recontact_at && lead.recontact_at < today();
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null);
    const r = await api(action, { lead_id: lead.id, ...extra });
    if (r.ok) router.refresh(); else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }
  return (
    <article className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
      <div className="min-w-0">
        <button type="button" className="text-left font-medium text-slate-900 hover:text-sky-700" onClick={() => showLead(lead.id)}>{lead.business_name}</button>
        <p className="mt-0.5 text-xs text-slate-500">
          {lead.recontact_at ? `Re-contact ${overdue ? "was due" : "on"} ${lead.recontact_at}` : "No date"}{lead.last_reply_at ? ` · said "not now" ${when(lead.last_reply_at)}` : ""}{lead.email ? ` · ${lead.email}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lead.email && <a className={btnGhost} href={gmailSearch(mailbox, lead.email)} target="_blank" rel="noreferrer">Open thread <ExternalLink className="h-3.5 w-3.5" /></a>}
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => act("recontacted")}>{busy === "recontacted" && <Loader2 className="h-4 w-4 animate-spin" />}Followed up</button>
        <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("later", { date: plusDays(30) })}>{busy === "later" && <Loader2 className="h-4 w-4 animate-spin" />}30 more days</button>
      </div>
      <div className="w-full"><Note msg={msg} /></div>
    </article>
  );
}
