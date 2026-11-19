"use client";
/**
 * components/agency/outreach/outreach-app.tsx — CP-250 · Admin → Outreach shell: header, tabs, Overview.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed, Inbox, ListChecks, Loader2, Play, Search, Settings2, Users } from "lucide-react";
import type { SetupStatus } from "@/lib/outreach/config";
import type { Campaign, Lead, LeadStatus, Message, Reply, Settings, Step } from "@/lib/outreach/shared";
import { STATUS_LABEL } from "@/lib/outreach/shared";
import { FindTab } from "./find";
import { ReviewTab } from "./review";
import { LeadsTab } from "./leads";
import { InboxTab } from "./inbox";
import { SettingsTab } from "./settings";
import { ago, api, btnGhost, card } from "./ui";

export type OutreachData = {
  sqlMissing: boolean;
  setup: SetupStatus;
  settings: Settings;
  steps: Step[];
  campaigns: Campaign[];
  leads: Lead[];
  messages: Message[];
  replies: Reply[];
  suppressions: Array<{ value: string; reason: string; created_at: string }>;
  stats: { sentToday: number; sent7: number; sentAll: number; replies7: number; bounces7: number };
};

type Tab = "overview" | "find" | "review" | "leads" | "inbox" | "settings";

export function OutreachApp({ data }: { data: OutreachData }) {
  const router = useRouter();
  const drafts = data.messages.filter((m) => m.status === "draft");
  const unhandled = data.replies.filter((r) => !r.handled && r.kind === "reply").length;
  const [tab, setTab] = useState<Tab>(data.leads.length ? (drafts.length ? "review" : "overview") : "find");
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Search; count?: number }> = [
    { id: "overview", label: "Overview", icon: ListChecks },
    { id: "find", label: "Find leads", icon: Search },
    { id: "review", label: "Review", icon: CheckCircle2, count: drafts.length },
    { id: "leads", label: "Leads", icon: Users, count: data.leads.length },
    { id: "inbox", label: "Inbox", icon: Inbox, count: unhandled },
    { id: "settings", label: "Sequence & settings", icon: Settings2 },
  ];

  async function runNow() {
    setRunning(true); setRunNote(null);
    const r = await api<{ sent: number; wouldSend: number; notes: string[]; read: number; inbox: number }>("run_now");
    setRunNote(r.ok ? [r.data.sent ? `Sent ${r.data.sent}.` : r.data.wouldSend ? `Would send ${r.data.wouldSend}.` : "", r.data.read ? `Read ${r.data.read} site(s).` : "", ...(r.data.notes ?? [])].filter(Boolean).join(" ") || "Nothing due right now." : r.error);
    setRunning(false);
    router.refresh();
  }

  const showLead = (id: string) => { setOpenLead(id); setTab("leads"); };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Outreach</h1>
          <p className="mt-1 text-sm text-slate-500">Find med spas, read their sites, send a short personal email and two follow-ups. Small volume, every first email reviewed by you.</p>
        </div>
        <div className="flex items-center gap-2">
          <SendBadge live={data.setup.live} paused={data.settings.paused} />
          <button type="button" className={btnGhost} onClick={runNow} disabled={running || data.sqlMissing} title="Runs the engine once now: inbox, new sites, follow-ups, one send">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
          </button>
        </div>
      </div>
      {runNote && <p className="mt-2 text-sm text-slate-600">{runNote}</p>}

      {data.sqlMissing && (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The outreach tables don&apos;t exist yet. Apply <code>db/history/checkpoint-250-outreach/cp250_outreach.sql</code> to Supabase, then reload.</span>
        </div>
      )}

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Outreach sections">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${tab === t.id ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
            {!!t.count && <span className={`rounded-full px-1.5 text-xs ${t.id === "review" || t.id === "inbox" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}>{t.count}</span>}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "overview" && <Overview data={data} go={setTab} />}
        {tab === "find" && <FindTab campaigns={data.campaigns} disabled={data.sqlMissing} placesReady={data.setup.places} onDone={() => setTab("review")} />}
        {tab === "review" && <ReviewTab data={data} showLead={showLead} />}
        {tab === "leads" && <LeadsTab data={data} openId={openLead} setOpenId={setOpenLead} />}
        {tab === "inbox" && <InboxTab data={data} showLead={showLead} />}
        {tab === "settings" && <SettingsTab data={data} />}
      </div>
    </div>
  );
}

function SendBadge({ live, paused }: { live: boolean; paused: boolean }) {
  if (paused) return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">Paused</span>;
  return live
    ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">Sending is on</span>
    : <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700" title="Set OUTREACH_SEND=1 on Vercel to send for real">Sending is off · dry run</span>;
}

function Overview({ data, go }: { data: OutreachData; go: (t: Tab) => void }) {
  const counts = useMemo(() => {
    const c = {} as Record<LeadStatus, number>;
    for (const l of data.leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [data.leads]);
  const contacted = data.leads.filter((l) => l.step > 0).length;
  const replied = (counts.replied ?? 0) + (counts.booked ?? 0) + (counts.not_interested ?? 0) + (counts.unsubscribed ?? 0);
  const rate = contacted ? Math.round((replied / contacted) * 100) : 0;
  const queued = data.messages.filter((m) => m.status === "approved").length;
  const s = data.setup;
  const checklist: Array<[boolean, string, string]> = [
    [!data.sqlMissing, "Database tables", "Apply the CP-250 SQL."],
    [s.places, "Google Places key", "GOOGLE_PLACES_API_KEY on Vercel (already used by App Previews)."],
    [s.ai, "Claude key", "ANTHROPIC_API_KEY on Vercel."],
    [s.smtp, "Outreach mailbox", "OUTREACH_SMTP_USER + OUTREACH_SMTP_PASS (app password) on Vercel."],
    [s.postal, "Postal address", "MAIL_POSTAL_ADDRESS on Vercel (CAN-SPAM)."],
    [s.live, "Sending switched on", "OUTREACH_SEND=1, only after the domain is warmed up."],
  ];
  const tiles: Array<[string, string | number, string?]> = [
    ["Sent today", `${data.stats.sentToday} / ${data.settings.daily_cap}`, "Daily cap per mailbox"],
    ["Queued", queued, "Approved, waiting for a send slot"],
    ["In review", data.messages.filter((m) => m.status === "draft").length],
    ["Sent (7 days)", data.stats.sent7],
    ["Reply rate", contacted ? `${rate}%` : "—", `${replied} of ${contacted} contacted`],
    ["Bounces (7 days)", data.stats.bounces7, data.stats.sent7 ? `${Math.round((data.stats.bounces7 / data.stats.sent7) * 100)}% (pauses above 5%)` : undefined],
  ];
  const funnel: LeadStatus[] = ["new", "no_email", "review", "queued", "contacted", "done", "replied", "booked", "not_interested", "bounced", "unsubscribed", "stopped"];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className={`${card} p-4`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
            {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
          </div>
        ))}
        <div className={`${card} col-span-2 p-4 sm:col-span-3`}>
          <p className="text-sm font-medium text-slate-800">Leads by status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {funnel.map((st) => (
              <button key={st} type="button" onClick={() => go("leads")} className="rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-50">
                <span className="block text-lg font-semibold text-slate-900">{counts[st] ?? 0}</span>
                <span className="text-xs text-slate-500">{STATUS_LABEL[st]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className={`${card} p-4`}>
          <p className="text-sm font-medium text-slate-800">Setup</p>
          <ul className="mt-3 space-y-2">
            {checklist.map(([ok, label, fix]) => (
              <li key={label} className="flex gap-2 text-sm">
                {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                <span><span className={ok ? "text-slate-800" : "text-slate-600"}>{label}</span>{!ok && <span className="block text-xs text-slate-500">{fix}</span>}</span>
              </li>
            ))}
          </ul>
          {s.from && <p className="mt-3 text-xs text-slate-500">Sending as {s.from}</p>}
        </div>
        <div className={`${card} p-4 text-sm`}>
          <p className="font-medium text-slate-800">Engine</p>
          <p className="mt-1 text-slate-600">Last run {ago(data.settings.last_tick_at)}{data.settings.last_tick_note ? `: ${data.settings.last_tick_note}` : ""}</p>
          {data.settings.paused && <p className="mt-2 text-amber-800">Paused{data.settings.paused_reason ? `: ${data.settings.paused_reason}` : ""}</p>}
          <p className="mt-2 text-xs text-slate-500">Runs every 5 minutes. Sends at most one email per run, inside {data.settings.window_start}:00–{data.settings.window_end}:00 in each spa&apos;s time zone.</p>
        </div>
      </div>
    </div>
  );
}
