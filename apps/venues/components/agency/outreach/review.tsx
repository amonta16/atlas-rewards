"use client";
/**
 * components/agency/outreach/review.tsx — CP-250 · every draft waits here: read what the AI used from
 * their site, edit, then Approve (it queues), Redraft, Skip the spa, or send yourself a test.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Mail, RefreshCw, Send, Sparkles, X } from "lucide-react";
import type { Lead, Message } from "@/lib/outreach/shared";
import type { OutreachData } from "./outreach-app";
import { api, btnDanger, btnGhost, btnPrimary, card, Empty, input, Note, useBusy } from "./ui";

export function ReviewTab({ data, showLead }: { data: OutreachData; showLead: (id: string) => void }) {
  const leads = new Map(data.leads.map((l) => [l.id, l]));
  const drafts = data.messages
    .filter((m) => m.status === "draft" && leads.has(m.lead_id))
    .sort((a, b) => a.step - b.step || a.created_at.localeCompare(b.created_at));
  const noEmail = data.leads.filter((l) => l.status === "no_email");
  if (!drafts.length) {
    return (
      <div className="space-y-4">
        <Empty title="Nothing to review" text="New spas you add are read and drafted automatically. Their first emails show up here for you to approve." />
        {noEmail.length > 0 && <NoEmailList leads={noEmail} showLead={showLead} />}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{drafts.length} email{drafts.length === 1 ? "" : "s"} waiting. Approved emails go out one at a time inside the send window, up to {data.settings.daily_cap} a day.</p>
      {drafts.map((m) => <DraftCard key={m.id} m={m} lead={leads.get(m.lead_id)!} signature={data.settings.signature} showLead={showLead} />)}
      {noEmail.length > 0 && <NoEmailList leads={noEmail} showLead={showLead} />}
    </div>
  );
}

function DraftCard({ m, lead, signature, showLead }: { m: Message; lead: Lead; signature: string; showLead: (id: string) => void }) {
  const router = useRouter();
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const [notes, setNotes] = useState(false);
  const { busy, setBusy, msg, setMsg } = useBusy();
  const words = body.trim().split(/\s+/).filter(Boolean).length;

  async function act(action: string, extra: Record<string, unknown> = {}, done?: string) {
    setBusy(action); setMsg(null);
    const r = await api<{ to?: string; note?: string }>(action, extra);
    if (r.ok) {
      setMsg({ ok: true, text: done ?? r.data.note ?? (r.data.to ? `Test sent to ${r.data.to}.` : "Done.") });
      if (action !== "test_email") router.refresh();
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
        {m.ai && <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"><Sparkles className="h-3 w-3" /> AI draft</span>}
      </header>
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
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-500">{`${signature}\n[postal address]\n\nNot for you? Reply "no thanks" or use this link and I won't email again: [unsubscribe link]`}</pre>
        </div>
        <aside className="space-y-3 text-sm">
          {m.ai_detail && <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">From their site</p><p className="mt-1 text-slate-700">{m.ai_detail}</p></div>}
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
      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        <button type="button" className={btnPrimary} disabled={busy !== null || !lead.email} onClick={() => act("approve", { message_id: m.id, subject, body }, "Approved. It goes out in the next open send slot.")}>
          {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
        </button>
        <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("save_draft", { message_id: m.id, subject, body }, "Saved.")}>Save</button>
        {m.step === 1 && (
          <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("enrich", { lead_id: lead.id, redraft: true })} title="Read the site again and write a new draft">
            {busy === "enrich" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Redraft
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
