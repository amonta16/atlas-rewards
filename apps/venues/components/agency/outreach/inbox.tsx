"use client";
/**
 * components/agency/outreach/inbox.tsx — CP-250 · what came back to the outreach mailbox.
 * Replies already stopped their lead's sequence; this is where you see them and mark them handled.
 * You answer in Gmail (the full thread is there); "handled" just clears it from this list.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { REPLY_LABEL, type Reply } from "@/lib/outreach/shared";
import type { OutreachData } from "./outreach-app";
import { api, btnGhost, card, Empty, inputBase, Note, useBusy, when } from "./ui";

const CLASS_TINT: Record<string, string> = {
  interested: "bg-emerald-100 text-emerald-900", not_now: "bg-amber-50 text-amber-900", not_interested: "bg-rose-50 text-rose-800",
  unsubscribe: "bg-rose-50 text-rose-800", out_of_office: "bg-slate-100 text-slate-600", bounce: "bg-rose-50 text-rose-800", other: "bg-slate-100 text-slate-700",
};

export function InboxTab({ data, showLead }: { data: OutreachData; showLead: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const list = data.replies.filter((r) => all || (!r.handled && r.kind === "reply"));
  const leads = new Map(data.leads.map((l) => [l.id, l]));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{data.setup.imap ? "Read from the outreach mailbox every 5 minutes." : "The mailbox isn't connected yet, so replies can't be read. Set OUTREACH_SMTP_USER / OUTREACH_SMTP_PASS."}</p>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="accent-sky-600" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show handled, bounces and auto-replies</label>
      </div>
      {!list.length ? <Empty title={all ? "Nothing yet" : "All caught up"} text="Replies to outreach emails land here and stop that spa's sequence automatically." /> : list.map((r) => <ReplyCard key={r.id} r={r} lead={r.lead_id ? leads.get(r.lead_id) ?? null : null} data={data} showLead={showLead} />)}
    </div>
  );
}

function ReplyCard({ r, lead, data, showLead }: { r: Reply; lead: OutreachData["leads"][number] | null; data: OutreachData; showLead: (id: string) => void }) {
  const router = useRouter();
  const [link, setLink] = useState("");
  const { busy, setBusy, msg, setMsg } = useBusy();
  async function handled() {
    setBusy("h"); setMsg(null);
    const res = await api("handle_reply", { reply_id: r.id, lead_id: lead ? null : link || null });
    if (res.ok) router.refresh(); else setMsg({ ok: false, text: res.error });
    setBusy(null);
  }
  return (
    <article className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {lead ? <button type="button" className="font-medium text-slate-900 hover:text-sky-700" onClick={() => showLead(lead.id)}>{lead.business_name}</button> : <span className="font-medium text-slate-900">Not matched to a lead</span>}
          <p className="text-xs text-slate-500">{r.from_email} · {when(r.received_at)}{r.subject ? ` · ${r.subject}` : ""}</p>
        </div>
        {r.class && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASS_TINT[r.class] ?? ""}`}>{REPLY_LABEL[r.class]}</span>}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{r.body || "(no text)"}</p>
      {!r.handled && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!lead && (
            <select className={`${inputBase} w-auto`} value={link} onChange={(e) => setLink(e.target.value)} aria-label="Link to a lead">
              <option value="">Link to a lead (optional)…</option>
              {data.leads.map((l) => <option key={l.id} value={l.id}>{l.business_name}</option>)}
            </select>
          )}
          <button type="button" className={btnGhost} onClick={handled} disabled={busy !== null}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark handled</button>
          <Note msg={msg} />
        </div>
      )}
    </article>
  );
}
