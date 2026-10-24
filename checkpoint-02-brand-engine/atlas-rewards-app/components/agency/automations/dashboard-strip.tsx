"use client";
/**
 * DashboardStrip — the business-level automation numbers (spec §7), as one
 * slim bar so the canvas keeps the room. Navy lead cell for the attributed
 * outcome, then measured counts, then the guardrails, all on one line.
 * "Measured" = plain counts; "Attributed" = a goal event inside the
 * attribution window after a message (marked with a small dot + tooltip).
 */
import { cn } from "@/lib/utils";
import type { HubSummary } from "@/lib/automations/types";

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

export function DashboardStrip({ s, loading }: { s: HubSummary | null; loading: boolean; businessName?: string }) {
  const engineOff = !!s && !s.engine_enabled;
  const v = (x: string) => (loading ? null : x);
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-200 bg-white text-[#14213d]">
      {/* Lead: attributed outcome, in Atlas navy */}
      <div className="flex shrink-0 items-center gap-5 px-4 py-2 text-white" style={{ background: "linear-gradient(120deg, #06318F, #0B5FD6)" }}>
        <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-white/70">Last<br />30 days</span>
        <Stat dark label="Return visits" value={v(fmt(s?.return_visits_after_msg_30d))} attributed />
        <Stat dark label="Conversions" value={v(fmt(s?.conversions_30d))} attributed />
      </div>

      {/* Measured */}
      <div className="flex min-w-0 flex-1 items-center divide-x divide-zinc-100 overflow-x-auto">
        <Stat label="Active workflows" value={v(fmt(s?.active_workflows))} sub={s ? `${fmt(s.enrolled_30d)} entered` : undefined} />
        <Stat label="Push sent" value={v(fmt(s?.push_sent_30d))} sub={s ? `${pct(s.push_delivered_30d, s.push_sent_30d)} delivered` : undefined} />
        <Stat label="Email" value={v(fmt(s?.email_sent_30d))} sub={s && s.email_sent_30d === 0 ? "needs setup" : undefined} muted={!!s && s.email_sent_30d === 0} />
        <span className="hidden flex-1 lg:block" />
        {/* Guardrails, compact */}
        <div className="flex shrink-0 items-center gap-4 px-4 text-[11.5px] text-zinc-500">
          <span title="Sending window (local). Outside it, messages wait for the next allowed minute">Sends <b className="font-semibold text-[#14213d]">{loading || !s?.settings ? "…" : `${hhmm(s.settings.quiet_end)}–${hhmm(s.settings.quiet_start)}`}</b></span>
          <span title="Max messages per customer per week, across every source">Cap <b className="font-semibold text-[#14213d]">{loading || !s?.settings ? "…" : `${s.settings.max_msgs_per_member_per_week}/wk`}</b></span>
          <span className="flex items-center gap-1.5" title={engineOff ? "Workflows don't run for this business. System automations still do." : "Engine on for this business"}>
            <span className={cn("h-1.5 w-1.5 rounded-full", loading ? "animate-pulse bg-zinc-300" : engineOff ? "bg-amber-500" : "bg-emerald-500")} />
            <b className={cn("font-semibold", engineOff ? "text-amber-700" : "text-[#14213d]")}>{loading || !s ? "…" : engineOff ? "Engine off" : "Engine on"}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Quiet hours are stored as the allowed window start/end; show the window messages are sent in. */
function hhmm(t: string) { const [h, m] = t.split(":").map(Number); const d = new Date(); d.setHours(h, m || 0, 0, 0); return d.toLocaleTimeString([], { hour: "numeric", minute: m ? "2-digit" : undefined }).replace(" ", "").toLowerCase(); }

function Stat({ label, value, sub, dark, attributed, muted }: { label: string; value: string | null; sub?: string; dark?: boolean; attributed?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-baseline gap-2", !dark && "px-4 py-2")} title={attributed ? "Attributed: a visit or goal within 7 days of a message, not proven" : "Measured"}>
      <span className={cn("text-[20px] font-semibold leading-none tabular-nums tracking-tight", muted && "text-zinc-400")}>
        {value ?? <span className={cn("inline-block h-4 w-8 animate-pulse rounded align-middle", dark ? "bg-white/25" : "bg-zinc-100")} />}
      </span>
      <span className="flex flex-col leading-tight">
        <span className={cn("flex items-center gap-1 text-[11px] font-medium", dark ? "text-white/80" : "text-zinc-500")}>
          {label}{attributed && <span className="h-1 w-1 rounded-full bg-[#7cc4ff]" />}
        </span>
        {sub && <span className={cn("text-[10.5px]", dark ? "text-white/55" : "text-zinc-400")}>{sub}</span>}
      </span>
    </div>
  );
}
