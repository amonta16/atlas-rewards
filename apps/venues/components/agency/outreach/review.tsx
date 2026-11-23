"use client";
/**
 * components/agency/outreach/review.tsx — CP-250 · every draft waits here: read what the AI used from
 * their site, edit, then Approve (it queues), Redraft, Skip the spa, or send yourself a test.
 *
 * CP-250b: Claude's fit call on each card (good fits first, filter by fit, skip all "not a fit" at
 * once); in opener mode the line Claude wrote is shown apart from your template; Redraft takes a
 * one-off note; "Redraft all" rewrites every first email you haven't edited, using the current
 * writing notes (tune one, then apply it to all).
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Mail, RefreshCw, Send, Sparkles, Square, X } from "lucide-react";
import { FIT_LABEL, FIT_ORDER, footer, type Fit, type Lead, type Message, type OptoutStyle } from "@/lib/outreach/shared";
import type { OutreachData } from "./outreach-app";
import { api, btnDanger, btnGhost, btnPrimary, card, Empty, FitPill, input, Note, useBusy } from "./ui";

type FitFilter = Fit | "all";

export function ReviewTab({ data, showLead }: { data: OutreachData; showLead: (id: string) => void }) {
  const router = useRouter();
  const [fit, setFit] = useState<FitFilter>("all");
  const leads = new Map(data.leads.map((l) => [l.id, l]));
  const all = data.messages
    .filter((m) => m.status === "draft" && leads.has(m.lead_id))
    .sort((a, b) => a.step - b.step
      || FIT_ORDER[leads.get(a.lead_id)!.fit ?? "none"] - FIT_ORDER[leads.get(b.lead_id)!.fit ?? "none"]
      || a.created_at.localeCompare(b.created_at));
  const drafts = all.filter((m) => fit === "all" || leads.get(m.lead_id)!.fit === fit);
  const count = (f: Fit) => all.filter((m) => leads.get(m.lead_id)!.fit === f).length;
  const unfit = all.filter((m) => m.step === 1 && leads.get(m.lead_id)!.fit === "no").length;
  const noEmail = data.leads.filter((l) => l.status === "no_email");
  const { busy, setBusy, msg, setMsg } = useBusy();

  async function skipUnfit() {
    if (!window.confirm(`Skip all ${unfit} spa${unfit === 1 ? "" : "s"} Claude marked "not a fit"? They won't be emailed.`)) return;
    setBusy("unfit"); setMsg(null);
    const r = await api<{ note: string }>("skip_unfit");
    setMsg(r.ok ? { ok: true, text: r.data.note } : { ok: false, text: r.error });
    setBusy(null);
    if (r.ok) router.refresh();
  }

  if (!all.length) {
    return (
      <div className="space-y-4">
        <Empty title="Nothing to review" text="New spas you add are read and drafted automatically. Their first emails show up here for you to approve." />
        {noEmail.length > 0 && <NoEmailList leads={noEmail} showLead={showLead} />}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{all.length} email{all.length === 1 ? "" : "s"} waiting, good fits first. Approved emails go out one at a time inside the send window, up to {data.settings.daily_cap} a day.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip on={fit === "all"} onClick={() => setFit("all")}>All {all.length}</Chip>
        {(["good", "unsure", "no"] as Fit[]).filter((f) => count(f)).map((f) => <Chip key={f} on={fit === f} onClick={() => setFit(f)}>{FIT_LABEL[f]} {count(f)}</Chip>)}
        {unfit > 0 && <button type="button" className={`${btnDanger} ml-auto`} disabled={busy !== null} onClick={skipUnfit}>{busy === "unfit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Skip all not a fit ({unfit})</button>}
      </div>
      <RedraftAll drafts={all.filter((m) => m.step === 1 && !m.edited)} />
      <Note msg={msg} />
      {drafts.map((m) => <DraftCard key={m.id} m={m} lead={leads.get(m.lead_id)!} signature={data.settings.signature} optout={data.settings.optout_style} postal={data.setup.postal} showLead={showLead} />)}
      {!drafts.length && <p className="text-sm text-slate-500">None with that fit.</p>}
      {noEmail.length > 0 && <NoEmailList leads={noEmail} showLead={showLead} />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>;
}

/** Rewrite every first email you haven't touched, one spa at a time, with the current writing notes. */
function RedraftAll({ drafts }: { drafts: Message[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ done: number; total: number; failed: number } | null>(null);
  const stop = useRef(false);
  if (drafts.length < 2 && !state) return null;

  async function run() {
    if (!window.confirm(`Redraft ${drafts.length} first emails you haven't edited? Claude re-reads each site with your current writing notes. Drafts you edited stay as they are.`)) return;
    stop.current = false;
    let failed = 0;
    setState({ done: 0, total: drafts.length, failed: 0 });
    for (let i = 0; i < drafts.length; i++) {
      if (stop.current) break;
      const r = await api("enrich", { lead_id: drafts[i].lead_id, redraft: true });
      if (!r.ok) failed++;
      setState({ done: i + 1, total: drafts.length, failed });
    }
    router.refresh();
  }

  const running = !!state && state.done < state.total && !stop.current;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm">
      <span className="text-slate-600">Changed your writing notes? Tune one draft, then apply it to the rest.</span>
      {running
        ? <button type="button" className={btnGhost} onClick={() => { stop.current = true; setState((s) => (s ? { ...s } : s)); }}><Square className="h-4 w-4" /> Stop</button>
        : <button type="button" className={btnGhost} onClick={run} disabled={!drafts.length}><RefreshCw className="h-4 w-4" /> Redraft all ({drafts.length})</button>}
      {state && <span className="text-slate-500">{running && <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />}{state.done} of {state.total} redrafted{state.failed ? `, ${state.failed} failed` : ""}{stop.current && state.done < state.total ? " (stopped)" : ""}.</span>}
    </div>
  );
}

function DraftCard({ m, lead, signature, optout, postal, showLead }: { m: Message; lead: Lead; signature: string; optout: OptoutStyle; postal: boolean; showLead: (id: string) => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [notes, setNotes] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const { busy, setBusy, msg, setMsg } = useBusy();
  const words = body.trim().split(/\s+/).filter(Boolean).length;

  async function act(action: string, extra: Record<string, unknown> = {}, done?: string) {
    setBusy(action); setMsg(null);
    const r = await api<{ to?: string; note?: string }>(action, extra);
    if (r.ok) {
      setMsg({ ok: true, text: done ?? r.data.note ?? (r.data.to ? `Test sent to ${r.data.to}.` : "Done.") });
      if (action !== "test_email") router.refresh();
      if (action === "enrich") { setNoteOpen(false); setNote(""); }
    } else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }

  return (
    <article className={`${card} overflow-hidden`}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="min-w-0">
          <button type="button" className="text-left font-medium text-slate-900 hover:text-sky-700" onClick={() => showLead(lead.id)}>{lead.business_name}</button>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email ?? "no email"}{lead.email_mx_ok === false && <span className="text-rose-700"> (domain takes no mail)</span>}</span>
            {lead.city && <span>{lead.city}{lead.state ? `, ${lead.state}` : ""}</span>}
            {lead.website && <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">site <ExternalLink className="h-3 w-3" /></a>}
            <span>Step {m.step}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FitPill fit={lead.fit} reason={lead.fit_reason} />
          {m.ai && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"><Sparkles className="h-3 w-3" /> {m.ai_line && m.body.includes(m.ai_line) ? "AI opener" : "AI draft"}</span>}
          {m.edited && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Edited</span>}
        </div>
      </header>
      {lead.fit && lead.fit !== "good" && lead.fit_reason && (
        <p className={`border-b px-4 py-2 text-sm ${lead.fit === "no" ? "border-rose-100 bg-rose-50/60 text-rose-800" : "border-amber-100 bg-amber-50/60 text-amber-900"}`}>{FIT_LABEL[lead.fit]}: {lead.fit_reason}</p>
      )}
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          {m.step === 1 ? (
            <label className="block text-sm"><span className="text-slate-600">Subject</span>
              <input className={`${input} mt-1`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} />
            </label>
          ) : <p className="text-sm text-slate-500">Sent as a reply under email 1{subject ? `, subject “${subject}”` : ""}.</p>}
          <label className="block text-sm"><span className="text-slate-600">Email</span>
            <textarea className={`${input} mt-1 min-h-[180px] font-[inherit] leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </label>
          <p className={`text-xs ${words > 130 ? "text-amber-700" : "text-slate-500"}`}>{words} words{words > 130 ? ". Shorter first emails get more replies." : ""}</p>
          {/* The footer exactly as it sends (same function as the engine), with the address and link as placeholders. */}
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-500">{footer(signature, postal ? "[your postal address]" : null, optout === "link" ? "[unsubscribe link]" : null)}</pre>
        </div>
        <aside className="space-y-3 text-sm">
          {m.ai_line && m.body.includes(m.ai_line) && (
            <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Claude wrote</p><p className="mt-1 rounded-lg bg-sky-50 p-2 text-sky-900">{m.ai_line}</p><p className="mt-1 text-xs text-slate-500">The rest is your template (Sequence &amp; settings).</p></div>
          )}
          {m.ai_detail && <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">From their site</p><p className="mt-1 text-slate-700">{m.ai_detail}</p></div>}
          {lead.fit === "good" && lead.fit_reason && <p className="text-slate-600"><span className="font-medium text-emerald-800">Good fit:</span> {lead.fit_reason}</p>}
          {lead.instagram && <p className="text-slate-600">Instagram: <span className="font-medium text-slate-800">@{lead.instagram}</span>{lead.ig_dm ? <span className="text-xs text-slate-500"> (DM drafted for the Instagram step)</span> : null}</p>}
          {lead.first_name && <p className="text-slate-600">Greeting name: <span className="font-medium text-slate-800">{lead.first_name}</span> <span className="text-xs text-slate-500">(check it&apos;s the owner)</span></p>}
          {lead.emails_found.length > 1 && <p className="text-slate-600">Other emails on the site: <span className="text-slate-800">{lead.emails_found.filter((e) => e !== lead.email).slice(0, 3).join(", ")}</span></p>}
          {lead.error && <p className="text-amber-800">{lead.error}</p>}
          {lead.site_notes && (
            <div>
              <button type="button" className="text-xs font-medium text-sky-700 hover:underline" onClick={() => setNotes((v) => !v)}>{notes ? "Hide" : "Show"} what we read</button>
              {notes && <p className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{lead.site_notes}</p>}
            </div>
          )}
        </aside>
      </div>
      {noteOpen && (
        <form className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3" onSubmit={(e) => { e.preventDefault(); act("enrich", { lead_id: lead.id, redraft: true, note }); }}>
          <input className={`${input} flex-1`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional note for this draft, e.g. mention their membership, keep it shorter" aria-label="Note for the redraft" autoFocus />
          <button type="submit" className={btnPrimary} disabled={busy !== null}>{busy === "enrich" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Redraft</button>
          <button type="button" className={btnGhost} onClick={() => setNoteOpen(false)}>Cancel</button>
        </form>
      )}
      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button type="button" className={btnPrimary} disabled={busy !== null || !lead.email} onClick={() => act("approve", { message_id: m.id, subject, body }, "Approved. It goes out in the next open send slot.")}>
          {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
        </button>
        <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("save_draft", { message_id: m.id, subject, body }, "Saved.")}>Save</button>
        {m.step === 1 && (
          <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => setNoteOpen((v) => !v)} title="Read the site again and write a new draft, with an optional note">
            <RefreshCw className="h-4 w-4" /> Redraft…
          </button>
        )}
        <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("test_email", { subject: subject || "Follow-up", body })} title="Send this to your own email from the outreach mailbox">
          {busy === "test_email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Test to me
        </button>
        <button type="button" className={`${btnDanger} ml-auto`} disabled={busy !== null} onClick={() => act("skip", { lead_id: lead.id }, "Skipped. This spa won't be emailed.")}>
          <X className="h-4 w-4" /> Skip spa
        </button>
        <div className="w-full"><Note msg={msg} /></div>
      </footer>
    </article>
  );
}

function NoEmailList({ leads, showLead }: { leads: Lead[]; showLead: (id: string) => void }) {
  return (
    <section className={`${card} p-4`}>
      <h3 className="font-medium text-slate-900">No email found ({leads.length})</h3>
      <p className="mt-0.5 text-sm text-slate-500">Their sites don&apos;t publish one (often just a contact form). Add an email in the lead&apos;s drawer if you have it, or call them.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {leads.slice(0, 40).map((l) => (
          <li key={l.id}><button type="button" onClick={() => showLead(l.id)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50">{l.business_name}</button></li>
        ))}
      </ul>
    </section>
  );
}
