"use client";
/**
 * components/agency/outreach/warmup.tsx — CP-250e · the Warm-up card on Overview.
 * Where warm-up stands (day N of 14, today's emails, replies, bounces), the readiness checks, the
 * friends/family addresses it emails, and Go live (un-pauses real spa emails) once it's ready.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Flame, Loader2, Plus, Rocket, Trash2 } from "lucide-react";
import { WARMUP_DAYS } from "@/lib/outreach/warmup";
import type { OutreachData } from "./outreach-app";
import { api, btnGhost, btnPrimary, card, inputBase, Note, useBusy, when } from "./ui";

export function WarmupCard({ data }: { data: OutreachData }) {
  const router = useRouter();
  const w = data.warmup;
  const s = data.settings;
  const { busy, setBusy, msg, setMsg } = useBusy();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [showLog, setShowLog] = useState(false);
  const passed = w.readiness.checks.filter((c) => c.ok).length;
  const live = !s.paused;
  const day = w.readiness.day;

  async function act(action: string, extra: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action); setMsg(null);
    const r = await api<{ note?: string }>(action, extra);
    if (r.ok) { if (r.data.note) setMsg({ ok: true, text: r.data.note }); if (action === "warmup_add") { setEmail(""); setName(""); } router.refresh(); }
    else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }

  const status = live
    ? { text: "Live: real spas are getting emails", tint: "bg-emerald-100 text-emerald-900" }
    : w.readiness.ready
      ? { text: "Ready for real spas", tint: "bg-emerald-100 text-emerald-900" }
      : !s.warmup_enabled
        ? { text: "Warm-up off", tint: "bg-slate-200 text-slate-700" }
        : day
          ? { text: `Warming up · day ${Math.min(day, 99)} of ${WARMUP_DAYS}`, tint: "bg-amber-100 text-amber-900" }
          : { text: "Warm-up starts with the next send window", tint: "bg-amber-100 text-amber-900" };

  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium text-slate-900"><Flame className="h-4 w-4 text-amber-500" /> Mailbox warm-up</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            A new mailbox that suddenly emails strangers lands in spam. Until this says ready, the engine emails the people below a few times a day (8am–6pm Pacific), asking them to reply, and real spas wait. It ramps up over {WARMUP_DAYS} days by itself. You don&apos;t need to do anything; it helps if they reply and move it out of Spam/Promotions.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.tint}`}>{status.text}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {([
          ["Today", `${w.stats.sentToday} / ${w.target}`, "warm-up emails"],
          ["Sent", w.stats.sent, "warm-up emails in total"],
          ["Replies", w.stats.replies, `${w.stats.sent ? Math.round((w.stats.replies / w.stats.sent) * 100) : 0}% · from ${w.stats.repliedContacts} people`],
          ["Bounces", w.stats.bounces, w.stats.failed ? `${w.stats.failed} failed to send` : "keep at 0"],
        ] as Array<[string, string | number, string]>).map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-800">Ready for real spas?</span><span className="text-slate-500">{passed} of {w.readiness.checks.length} checks</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(passed / w.readiness.checks.length) * 100}%` }} /></div>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {w.readiness.checks.map((c) => (
            <li key={c.label} className="flex gap-2 text-sm">
              {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
              <span><span className={c.ok ? "text-slate-800" : "text-slate-700"}>{c.label}</span><span className="block text-xs text-slate-500">{c.detail}</span></span>
            </li>
          ))}
        </ul>
        {!data.setup.live && <p className="mt-2 text-xs text-amber-800">Sending is off (OUTREACH_SEND), so warm-up emails can&apos;t go out either.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {live ? (
          <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("save_settings", { ...s, paused: true })}>Pause real spa emails</button>
        ) : w.readiness.ready ? (
          <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => act("go_live", {}, "Go live? Approved spa emails start going out in the next send window, up to your daily cap. Warm-up keeps running lightly.")}>
            {busy === "go_live" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Go live
          </button>
        ) : (
          <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("go_live", {}, `Warm-up isn't finished (${passed} of ${w.readiness.checks.length} checks). Emailing spas now risks the spam folder for this whole domain. Go live anyway?`)}>
            <Rocket className="h-4 w-4" /> Go live anyway
          </button>
        )}
        <button type="button" className={btnGhost} disabled={busy !== null} onClick={() => act("warmup_enabled", { enabled: !s.warmup_enabled })}>{s.warmup_enabled ? "Turn warm-up off" : "Turn warm-up on"}</button>
        {s.warmup_started_at && <span className="text-xs text-slate-500">Started {when(s.warmup_started_at)}</span>}
        <div className="w-full"><Note msg={msg} /></div>
      </div>

      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Warm-up people ({w.contacts.filter((c) => c.active).length})</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {w.contacts.map((c) => {
              const mine = w.recent.filter((l) => l.email === c.email);
              return (
                <li key={c.email} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0"><span className="block truncate text-slate-800">{c.name ? `${c.name} · ` : ""}{c.email}{c.is_me ? " (you)" : ""}</span>
                    <span className="text-xs text-slate-500">{mine.length ? `${mine.length} recent · ${mine.filter((l) => l.replied_at).length} replied` : "none yet"}</span></span>
                  <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600" aria-label={`Remove ${c.email}`} disabled={busy !== null} onClick={() => act("warmup_remove", { email: c.email }, `Stop warm-up emails to ${c.email}?`)}><Trash2 className="h-4 w-4" /></button>
                </li>
              );
            })}
            {!w.contacts.length && <li className="px-3 py-3 text-sm text-slate-500">Add 3 or more people who&apos;ll reply: your own Gmail, family, friends.</li>}
          </ul>
          <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act("warmup_add", { email, name }); }}>
            <input className={`${inputBase} min-w-0 flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" aria-label="Warm-up email" />
            <input className={`${inputBase} w-32`} value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" aria-label="First name (optional)" />
            <button type="submit" className={btnGhost} disabled={busy !== null || email.trim().length < 6}><Plus className="h-4 w-4" /> Add</button>
          </form>
          <p className="mt-1 text-xs text-slate-500">Give them a heads-up: a few short emails a day from {data.setup.from ?? "the outreach mailbox"} for two weeks, and a reply helps.</p>
        </div>
        <div>
          <button type="button" className="text-xs font-medium uppercase tracking-wide text-sky-700 hover:underline" onClick={() => setShowLog((v) => !v)}>{showLog ? "Hide" : "Show"} recent warm-up emails ({w.recent.length})</button>
          {showLog && (
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs text-slate-600">
              {w.recent.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="truncate">{when(l.sent_at)} · {l.email.split("@")[0]} · {l.subject}</span>
                  <span className={l.status !== "sent" ? "text-rose-700" : l.replied_at ? "text-emerald-700" : "text-slate-400"}>{l.status !== "sent" ? l.status : l.replied_at ? "replied" : "sent"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
