"use client";
/**
 * components/agency/outreach/leads.tsx — CP-250 · every spa with its status, and a drawer per lead:
 * details, its emails (draft / queued / sent / failed), its replies, and the actions.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Loader2, MessageCircle, Phone, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { FIT_LABEL, MANUAL_STATUSES, REPLY_LABEL, STATUS_LABEL, instagramUrl, type Fit, type Lead, type LeadStatus } from "@/lib/outreach/shared";
import type { OutreachData } from "./outreach-app";
import { ago, api, btnGhost, btnPrimary, card, Empty, FitPill, input, inputBase, Note, StatusPill, useBusy, when } from "./ui";

export function LeadsTab({ data, openId, setOpenId }: { data: OutreachData; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [camp, setCamp] = useState("all");
  const [fit, setFit] = useState<Fit | "all">("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of data.leads) c.set(l.status, (c.get(l.status) ?? 0) + 1);
    return c;
  }, [data.leads]);
  const list = data.leads.filter((l) =>
    (status === "all" || l.status === status) && (camp === "all" || l.campaign_id === camp) && (fit === "all" || l.fit === fit)
    && (!q || `${l.business_name} ${l.email ?? ""} ${l.city ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const open = openId ? data.leads.find((l) => l.id === openId) ?? null : null;
  const campName = new Map(data.campaigns.map((c) => [c.id, c.name]));

  if (!data.leads.length) return <Empty title="No leads yet" text="Use Find leads to search an area or import a list." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input className={`${inputBase} w-56 pl-8`} placeholder="Search name, email, city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        </div>
        {data.campaigns.length > 0 && (
          <select className={`${inputBase} w-auto`} value={camp} onChange={(e) => setCamp(e.target.value)} aria-label="Campaign">
            <option value="all">All campaigns</option>
            {data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.paused ? " (paused)" : ""}</option>)}
          </select>
        )}
        <select className={`${inputBase} w-auto`} value={fit} onChange={(e) => setFit(e.target.value as Fit | "all")} aria-label="Fit">
          <option value="all">Any fit</option>
          {(Object.keys(FIT_LABEL) as Fit[]).map((f) => <option key={f} value={f}>{FIT_LABEL[f]}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip on={status === "all"} onClick={() => setStatus("all")}>All {data.leads.length}</Chip>
        {(Object.keys(STATUS_LABEL) as LeadStatus[]).filter((s) => counts.get(s)).map((s) => (
          <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]} {counts.get(s)}</Chip>
        ))}
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2 font-medium">Spa</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Fit</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Step</th><th className="px-3 py-2 font-medium">Next / last</th><th className="px-3 py-2 font-medium">Campaign</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((l) => (
              <tr key={l.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(l.id)}>
                <td className="px-3 py-2"><span className="font-medium text-slate-900">{l.business_name}</span><span className="block text-xs text-slate-500">{[l.city, l.state].filter(Boolean).join(", ")}</span></td>
                <td className="px-3 py-2 text-slate-600">{l.email ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2"><FitPill fit={l.fit} reason={l.fit_reason} /></td>
                <td className="px-3 py-2"><StatusPill status={l.status} />{l.error && <span className="ml-1 text-xs text-amber-700" title={l.error}>!</span>}</td>
                <td className="px-3 py-2 text-slate-600">{l.step}/{data.steps.filter((s) => s.enabled).length || 3}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{l.status === "later" && l.recontact_at ? `re-contact ${l.recontact_at}` : l.next_at ? `next ${ago(l.next_at)}` : l.last_reply_at ? `replied ${ago(l.last_reply_at)}` : ago(l.updated_at)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{l.campaign_id ? campName.get(l.campaign_id) ?? "" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-sm text-slate-500">No leads match.</p>}
      </div>

      {open && <LeadDrawer lead={open} data={data} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{children}</button>;
}

const MSG_TINT: Record<string, string> = { draft: "text-sky-700", approved: "text-indigo-700", sending: "text-indigo-700", sent: "text-emerald-700", failed: "text-rose-700", cancelled: "text-slate-400", skipped: "text-slate-400" };
const MSG_LABEL: Record<string, string> = { draft: "In review", approved: "Queued", sending: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled", skipped: "Skipped" };

function LeadDrawer({ lead, data, onClose }: { lead: Lead; data: OutreachData; onClose: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState(lead.email ?? "");
  const [first, setFirst] = useState(lead.first_name ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [ig, setIg] = useState(lead.instagram ?? "");
  const [laterOn, setLaterOn] = useState(false);
  const [date, setDate] = useState(lead.recontact_at ?? new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10));
  const calls = data.tasks.filter((t) => t.lead_id === lead.id);
  const { busy, setBusy, msg, setMsg } = useBusy();
  const msgs = data.messages.filter((m) => m.lead_id === lead.id).sort((a, b) => a.step - b.step);
  const replies = data.replies.filter((r) => r.lead_id === lead.id);

  async function act(action: string, extra: Record<string, unknown>, done = "Saved.") {
    setBusy(action); setMsg(null);
    const r = await api<{ note?: string }>(action, { lead_id: lead.id, ...extra });
    setMsg(r.ok ? { ok: true, text: r.data.note ?? done } : { ok: false, text: r.error });
    setBusy(null);
    if (r.ok) router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose} role="dialog" aria-modal="true" aria-label={lead.business_name}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-start justify-between gap-2 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{lead.business_name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><StatusPill status={lead.status} /><FitPill fit={lead.fit} reason={lead.fit_reason} />{lead.stopped_reason && <span>{lead.stopped_reason}</span>}</div>
          </div>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 px-5 py-4 text-sm">
          <section className="space-y-1 text-slate-600">
            {lead.address && <p>{lead.address}</p>}
            <p className="flex flex-wrap gap-x-4">
              {lead.website && <a className="inline-flex items-center gap-1 text-sky-700 hover:underline" href={lead.website} target="_blank" rel="noreferrer">{lead.domain ?? "website"} <ExternalLink className="h-3 w-3" /></a>}
              {lead.phone && <a className="inline-flex items-center gap-1 text-sky-700 hover:underline" href={`tel:${lead.phone}`}><Phone className="h-3 w-3" />{lead.phone}</a>}
              {lead.instagram && <a className="inline-flex items-center gap-1 text-sky-700 hover:underline" href={instagramUrl(lead.instagram)} target="_blank" rel="noreferrer"><MessageCircle className="h-3 w-3" />@{lead.instagram}</a>}
              {lead.rating != null && <span>★ {lead.rating} ({lead.reviews ?? 0})</span>}
            </p>
            {lead.fit && lead.fit_reason && <p><span className="font-medium text-slate-700">{FIT_LABEL[lead.fit]}:</span> {lead.fit_reason}</p>}
            {lead.error && <p className="text-amber-800">{lead.error}</p>}
            {calls.length > 0 && <p className="text-sky-800">Call due on the To-do list (step {calls[0].step}).</p>}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label><span className="text-slate-600">Email</span><input className={`${input} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@spa.com" /></label>
            <label><span className="text-slate-600">First name (greeting)</span><input className={`${input} mt-1`} value={first} onChange={(e) => setFirst(e.target.value)} placeholder="there" /></label>
            <label className="sm:col-span-2"><span className="text-slate-600">Instagram</span><input className={`${input} mt-1`} value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@handle or instagram.com/… link" /></label>
            {lead.ig_dm && <p className="text-xs text-slate-500 sm:col-span-2">Instagram DM Claude drafted: <span className="text-slate-700">{lead.ig_dm}</span></p>}
            <label className="sm:col-span-2"><span className="text-slate-600">Notes</span><textarea className={`${input} mt-1 min-h-[60px]`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            {lead.emails_found.length > 0 && <p className="text-xs text-slate-500 sm:col-span-2">Found on their site: {lead.emails_found.join(", ")}</p>}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => act("update_lead", { ...(email.trim() !== (lead.email ?? "") ? { email } : {}), first_name: first, notes, ...(ig.trim() !== (lead.instagram ?? "") ? { instagram: ig } : {}) })}>{busy === "update_lead" && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
              <button type="button" className={btnGhost} disabled={busy !== null || !!msgs.find((m) => m.step === 1 && m.status !== "draft")} onClick={() => act("enrich", { redraft: true })} title="Read their site again and redraft email 1">
                {busy === "enrich" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Re-read site
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Set status</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {MANUAL_STATUSES.map((s) => (
                <button key={s} type="button" className={btnGhost} disabled={busy !== null || lead.status === s} onClick={() => act("set_status", { status: s }, `Marked ${STATUS_LABEL[s].toLowerCase()}. Its sequence has stopped.`)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            <div className="mt-2">
              {!laterOn
                ? <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => setLaterOn(true)}><CalendarClock className="h-4 w-4" /> {lead.status === "later" ? `Later: ${lead.recontact_at ?? "no date"} (change)` : "Later…"}</button>
                : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" className={`${inputBase} w-auto`} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Re-contact on" />
                    <button type="button" className={btnPrimary} disabled={busy !== null || !date} onClick={() => act("later", { date })}>{busy === "later" && <Loader2 className="h-4 w-4 animate-spin" />}Re-contact then</button>
                    <button type="button" className={btnGhost} onClick={() => setLaterOn(false)}>Cancel</button>
                  </div>
                )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Any of these stops the remaining emails. Not interested also adds them to the do-not-contact list. Later puts them on the To-do list on that date.</p>
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Emails</h3>
            {!msgs.length && <p className="mt-2 text-slate-500">None yet.</p>}
            <ol className="mt-2 space-y-3">
              {msgs.map((m) => (
                <li key={m.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700">Step {m.step}{m.subject ? ` · ${m.subject}` : ""}</span>
                    <span className={MSG_TINT[m.status]}>{MSG_LABEL[m.status]}{m.sent_at ? ` ${when(m.sent_at)}` : ""}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">{m.body}</p>
                  {m.error && <p className="mt-2 text-xs text-rose-700">{m.error}</p>}
                  {m.status === "failed" && <button type="button" className={`${btnGhost} mt-2`} disabled={busy !== null} onClick={() => act("retry", { message_id: m.id }, "Back in the queue.")}><RotateCcw className="h-4 w-4" /> Retry</button>}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Replies</h3>
            {!replies.length && <p className="mt-2 text-slate-500">None.</p>}
            <ul className="mt-2 space-y-3">
              {replies.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{r.from_email}</span><span>{r.class ? REPLY_LABEL[r.class] : r.kind} · {when(r.received_at)}</span></div>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">{r.body || "(no text)"}</p>
                </li>
              ))}
            </ul>
            {replies.length > 0 && <p className="mt-2 text-xs text-slate-500">Answer from the outreach mailbox in Gmail: the thread is there.</p>}
          </section>
          <Note msg={msg} />
        </div>
      </div>
    </div>
  );
}
