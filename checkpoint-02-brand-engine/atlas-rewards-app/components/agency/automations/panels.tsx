"use client";
/**
 * Right-hand panels of the Automation Hub (CP-216): node config, templates,
 * simulate (real member picker → wf_simulate), version history, existing
 * system automations, runs, business settings.
 */
import { useEffect, useRef, useState } from "react";
import { X, Lock, ChevronRight, Check, Play, Search, Loader2, AlertTriangle, RotateCcw, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KIND_META, AVAILABILITY_LABEL, TEMPLATE_GROUPS, VARIABLES, previewText, typeMeta } from "@/lib/automations/catalog";
import { humanMinutes, type WfEdge, type WfNode, type WfNodeData } from "@/lib/automations/graph";
import type { AutomationSettings, LegacyAutomation, MemberHit, NodeConfig, NodeMetrics, PathStep, RunRow, SimResult, ValidationItem, WorkflowVersionRow } from "@/lib/automations/types";
import { iconFor } from "./nodes";

/* ───────────── shared ───────────── */
export function DrawerHead({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
      <div><div className="text-[14px] font-semibold text-[#14213d]">{title}</div>{sub && <p className="mt-0.5 text-[12px] text-zinc-500">{sub}</p>}</div>
      <button onClick={onClose} className="rounded-full p-1.5 hover:bg-zinc-100" aria-label="Close"><X className="h-4 w-4 text-zinc-500" /></button>
    </div>
  );
}
const Label = ({ children }: { children: React.ReactNode }) => <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{children}</label>;
const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-[11px] leading-snug text-zinc-500">{children}</p>;
const Seg = <T extends string | number,>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) => (
  <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0,1fr))` }}>
    {options.map(([v, l]) => (
      <button key={String(v)} type="button" onClick={() => onChange(v)} className={cn("rounded-lg border px-2 py-1.5 text-[12px] font-medium", value === v ? "border-[#06318F] bg-[#06318F] text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")}>{l}</button>
    ))}
  </div>
);

/* ───────────── node config ───────────── */
export function ConfigPanel({ node, metrics, business, isMedspa, issues, onChange, onDelete, onClose, edges, nodes }: {
  node: WfNode; metrics?: NodeMetrics; business: string; isMedspa: boolean; issues: ValidationItem[];
  onChange: (p: { title?: string; config?: NodeConfig }) => void; onDelete: () => void; onClose: () => void; edges: WfEdge[]; nodes: WfNode[];
}) {
  const m = typeMeta(node.data.typeId); const k = KIND_META[m.kind];
  const c = node.data.config;
  const set = (patch: NodeConfig) => onChange({ config: { ...c, ...patch } });
  const num = (key: string, d = 0) => Number(c[key] ?? d);
  const ta = useRef<HTMLTextAreaElement>(null);
  const insertVar = (v: string) => {
    const el = ta.current; const msg = String(c.body ?? "");
    if (!el) { set({ body: msg + v }); return; }
    const s = el.selectionStart ?? msg.length, e = el.selectionEnd ?? msg.length;
    set({ body: msg.slice(0, s) + v + msg.slice(e) });
  };
  const incoming = edges.filter((e) => e.target === node.id).map((e) => nodes.find((n) => n.id === e.source)?.data.title).filter(Boolean);
  const avail = AVAILABILITY_LABEL[m.availability];
  const t = node.data.typeId;
  const hasMessage = t === "a.push" || t === "a.email" || t === "a.sms" || t === "a.offer" || t === "a.notify_admin";

  return (
    <div className="px-5 pb-6 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: k.soft, color: k.color }}>{iconFor(t, m.kind)}</span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: k.color }}>{k.singular}</div>
            <div className="text-[14px] font-semibold text-[#14213d]">{m.label}</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-zinc-100" aria-label="Close"><X className="h-4 w-4 text-zinc-500" /></button>
      </div>

      {avail && (
        <div className={cn("mt-4 flex items-start gap-2 rounded-lg p-3 text-[12px]", m.availability === "coming_soon" ? "bg-zinc-100 text-zinc-600" : "bg-amber-50 text-amber-800")}>
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b className="font-semibold">{avail}.</b>{" "}
            {m.availability === "coming_soon" ? "SMS isn't planned for a while. You can sketch with it, but the workflow can't be published until it's removed."
              : m.availability === "needs_setup" ? "Email needs templates, an unsubscribe link and consent capture first. Publish is blocked while this step is in the flow."
              : `Needs new tracking (${m.source}). Publish is blocked while this step is in the flow.`}
          </span>
        </div>
      )}
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((i, idx) => <li key={idx} className={cn("flex items-start gap-1.5 text-[12px]", i.level === "error" ? "text-rose-700" : "text-amber-700")}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{i.message}</li>)}
        </ul>
      )}

      <Label>Step name</Label>
      <Input value={node.data.title} onChange={(e) => onChange({ title: e.target.value })} className="mt-1.5" />

      {/* Trigger config */}
      {t === "t.inactive" && (<><Label>Days without a visit</Label><Input type="number" min={1} value={num("days", 14)} onChange={(e) => set({ days: Number(e.target.value) })} className="mt-1.5 w-32" /><Note>Checked nightly in the business's timezone. Re-entry is controlled by the workflow's re-entry window.</Note></>)}
      {t === "t.spend" && (<><Label>Lifetime spend reaches ($)</Label><Input type="number" min={1} value={num("min_cents") / 100} onChange={(e) => set({ min_cents: Math.round(Number(e.target.value) * 100) })} className="mt-1.5 w-32" /><Note>Uses desk-recorded purchases and shop orders.</Note></>)}
      {t === "t.points" && (<><Label>Only when balance reaches (optional)</Label><Input type="number" min={0} value={num("min_balance")} onChange={(e) => set({ min_balance: Number(e.target.value) || null })} className="mt-1.5 w-32" /></>)}
      {t === "t.booking" && (<><Label>Booking status</Label><Seg value={String(c.status ?? "created")} options={[["created", "Booked"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["no_show", "No-show"]]} onChange={(v) => set({ status: v })} /></>)}

      {/* Conditions */}
      {t === "c.visited" && (<><Label>Visited within</Label><div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-700"><Input type="number" min={1} value={num("within_days", 14)} onChange={(e) => set({ within_days: Number(e.target.value) })} className="h-9 w-24" /> days</div></>)}
      {t === "c.points" && (<><Label>Points balance</Label><div className="mt-1.5 flex items-center gap-2"><select value={String(c.op ?? "gte")} onChange={(e) => set({ op: e.target.value })} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]"><option value="gte">is at least</option><option value="lt">is under</option></select><Input type="number" min={0} value={num("value")} onChange={(e) => set({ value: Number(e.target.value) })} className="h-9 w-24" /></div></>)}
      {t === "c.new_vs_returning" && (<><Label>Branch Yes when the customer is</Label><Seg value={String(c.is ?? "new")} options={[["new", "New (≤ 1 visit)"], ["returning", "Returning"]]} onChange={(v) => set({ is: v })} /></>)}
      {t === "c.redeemed" && (<><Label>Redeemed within</Label><div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-700"><Input type="number" min={1} value={num("within_days", 7)} onChange={(e) => set({ within_days: Number(e.target.value) })} className="h-9 w-24" /> days</div><Label>Specific reward id (optional)</Label><Input value={String(c.reward_id ?? "")} onChange={(e) => set({ reward_id: e.target.value || null })} className="mt-1.5" placeholder="any reward" /></>)}
      {t === "c.tier" && (<><Label>Tier</Label><Input value={String(c.tier ?? "")} onChange={(e) => set({ tier: e.target.value })} className="mt-1.5" placeholder="gold" /></>)}
      {t === "c.tagged" && (<><Label>Tag</Label><Input value={String(c.tag ?? "")} onChange={(e) => set({ tag: e.target.value })} className="mt-1.5" placeholder="VIP" /></>)}
      {t === "c.eligible" && (<><Label>Automated offer config id</Label><Input value={String(c.offer_config_id ?? "")} onChange={(e) => set({ offer_config_id: e.target.value })} className="mt-1.5" placeholder="from Offers → Automated" /><Note>Yes when the customer hasn't received that offer since their last visit.</Note></>)}
      {m.kind === "condition" && <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500"><span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">YES</span> left branch <span className="text-zinc-300">·</span><span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">NO</span> right branch</div>}

      {/* Messages */}
      {hasMessage && (
        <>
          <Label>{t === "a.email" ? "Subject" : "Title"}</Label>
          <Input value={String((t === "a.email" ? c.subject : c.title) ?? "")} onChange={(e) => set(t === "a.email" ? { subject: e.target.value } : { title: e.target.value })} className="mt-1.5" />
          <Label>Message</Label>
          <textarea ref={ta} value={String(c.body ?? "")} onChange={(e) => set({ body: e.target.value })} rows={4}
            className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#0B5FD6]" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIABLES.map((v) => <button key={v} type="button" onClick={() => insertVar(v)} className="rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-700 hover:bg-zinc-200">{v}</button>)}
          </div>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Preview · Jane Doe</div>
            {!!(c.title || c.subject) && <div className="mt-1 text-[13px] font-semibold text-[#14213d]">{previewText(String(c.title ?? c.subject), business, isMedspa)}</div>}
            <div className="mt-0.5 text-[13px] text-zinc-800">{c.body ? previewText(String(c.body), business, isMedspa) : <span className="text-zinc-400">Type a message…</span>}</div>
            <div className="mt-1 text-[10px] text-zinc-400">Missing values fall back safely, e.g. {"{{first_name|there}}"}.</div>
          </div>
          {t === "a.push" && (<><Label>Opens (optional)</Label><Input value={String(c.link_path ?? "")} onChange={(e) => set({ link_path: e.target.value || null })} className="mt-1.5" placeholder="/app/rewards" /></>)}
          {t === "a.offer" && (<>
            <Label>Bonus points (optional)</Label><Input type="number" min={0} value={num("bonus_points")} onChange={(e) => set({ bonus_points: Number(e.target.value) || null })} className="mt-1.5 w-32" />
            <Label>Expires after</Label><div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-700"><Input type="number" min={1} value={num("expires_days", 7)} onChange={(e) => set({ expires_days: Number(e.target.value) })} className="h-9 w-24" /> days</div>
            <Note>Shows as the Home banner for this customer only.</Note>
          </>)}
        </>
      )}

      {t === "a.points" && (<><Label>Points</Label><Input type="number" min={0} value={num("points")} onChange={(e) => set({ points: Number(e.target.value) })} className="mt-1.5 w-32" /><Label>Ledger note</Label><Input value={String(c.note ?? "")} onChange={(e) => set({ note: e.target.value })} className="mt-1.5" placeholder="Win-back bonus" /><Note>Awarded once per customer per run. The ledger key is run + step, so a retry never double-credits.</Note></>)}
      {t === "a.unlock" && (<><Label>Reward id</Label><Input value={String(c.reward_id ?? "")} onChange={(e) => set({ reward_id: e.target.value })} className="mt-1.5" placeholder="from Rewards" /><Note>Grants a saved gift with a desk code, like the welcome gift.</Note></>)}
      {t === "a.tag" && (<><Label>Tag</Label><Input value={String(c.tag ?? "")} onChange={(e) => set({ tag: e.target.value })} className="mt-1.5" placeholder="At Risk" /><Seg value={c.remove ? "remove" : "add"} options={[["add", "Add tag"], ["remove", "Remove tag"]]} onChange={(v) => set({ remove: v === "remove" })} /></>)}
      {t === "a.enroll" && (<><Label>Workflow id</Label><Input value={String(c.workflow_id ?? "")} onChange={(e) => set({ workflow_id: e.target.value })} className="mt-1.5" /><Seg value={c.remove ? "remove" : "add"} options={[["add", "Add to it"], ["remove", "Remove from it"]]} onChange={(v) => set({ remove: v === "remove" })} /></>)}

      {/* Timing */}
      {t === "w.wait" && (<>
        <Label>Delay</Label>
        <Seg value={num("minutes")} options={[[60, "1 hour"], [1440, "1 day"], [4320, "3 days"], [10080, "7 days"]]} onChange={(v) => set({ minutes: v })} />
        <div className="mt-2 flex items-center gap-2 text-[12px] text-zinc-600">Custom: <Input type="number" min={0} value={Math.round(num("minutes") / 60)} onChange={(e) => set({ minutes: Number(e.target.value) * 60 })} className="h-8 w-20" /> hours <span className="text-zinc-400">({humanMinutes(num("minutes"))})</span></div>
        <Note>Runs on the server. A message due inside quiet hours slides to the next allowed minute.</Note>
      </>)}
      {t === "w.until_date" && (<><Label>Wait until</Label><Input type="datetime-local" value={String(c.at ?? "")} onChange={(e) => set({ at: e.target.value })} className="mt-1.5" /></>)}
      {t === "w.until" && (<><Label>Give up after</Label><Seg value={num("timeout_minutes")} options={[[1440, "1 day"], [4320, "3 days"], [10080, "7 days"], [43200, "30 days"]]} onChange={(v) => set({ timeout_minutes: v })} /><Label>Condition</Label><Seg value={String(c.condition_type ?? "checkin")} options={[["checkin", "Checks in"], ["redeem", "Redeems"], ["purchase", "Purchases"], ["booking", "Books"]]} onChange={(v) => set({ condition_type: v })} /><Note>Continues the moment it happens; follows the No path on timeout if one exists.</Note></>)}
      {t === "w.stop_on_convert" && (<><Label>Goal</Label><Seg value={String(c.goal ?? "checkin")} options={[["checkin", "Check-in"], ["redeem", "Redemption"], ["purchase", "Purchase"]]} onChange={(v) => set({ goal: v })} /><Note>The run exits as soon as the goal event arrives, and counts as a conversion.</Note></>)}
      {t === "w.no_reentry" && (<><Label>No re-entry for</Label><div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-700"><Input type="number" min={1} value={num("days", 30)} onChange={(e) => set({ days: Number(e.target.value) })} className="h-9 w-24" /> days</div></>)}
      {t === "w.cap" && (<><Label>Max messages per customer</Label><div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-700"><Input type="number" min={1} value={num("per_week", 3)} onChange={(e) => set({ per_week: Number(e.target.value) })} className="h-9 w-24" /> per week</div><Note>Stricter than the business cap wins.</Note></>)}

      {metrics && metrics.reached > 0 && (
        <div className="mt-6 rounded-xl border border-zinc-200 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Performance · 30 days</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([["Reached", metrics.reached], ["Completed", metrics.completed], ["Waiting", metrics.waiting], ["Sent", metrics.sent], ["Delivered", metrics.delivered], ["Failed", metrics.failed], ["Skipped", metrics.skipped], ["Converted", metrics.converted]] as const).filter(([, v]) => v > 0).map(([l, v]) => (
              <div key={l} className="rounded-lg bg-zinc-50 px-2 py-2"><div className="text-[18px] font-semibold tabular-nums text-[#14213d]">{v.toLocaleString()}</div><div className="text-[10px] text-zinc-500">{l}</div></div>
            ))}
          </div>
        </div>
      )}
      {incoming.length > 0 && <p className="mt-4 text-[11px] text-zinc-500">Comes after: {incoming.join(", ")}</p>}
      <button type="button" onClick={onDelete} className="mt-6 text-[12px] font-medium text-rose-600 hover:underline">Remove this step</button>
    </div>
  );
}

export function EmptyPanel({ validation }: { validation: ValidationItem[] }) {
  const errs = validation.filter((v) => v.level === "error"), warns = validation.filter((v) => v.level === "warn");
  return (
    <div className="px-5 py-5">
      {validation.length > 0 ? (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Before you publish</div>
          <ul className="mt-2 space-y-1.5">
            {[...errs, ...warns].map((v, i) => <li key={i} className={cn("flex items-start gap-2 rounded-lg p-2 text-[12px]", v.level === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800")}><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{v.message}</li>)}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-300 p-5 text-center">
          <Check className="mx-auto h-5 w-5 text-emerald-600" />
          <div className="mt-2 text-[13px] font-semibold text-[#14213d]">Ready to publish</div>
          <p className="mt-1 text-[12px] text-zinc-500">Select a step to edit it, or press Test to walk a customer through.</p>
        </div>
      )}
      <div className="mt-6 space-y-2 text-[12px] text-zinc-600">
        {(["trigger", "condition", "action", "timing"] as const).map((k) => <div key={k} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: KIND_META[k].color }} />{KIND_META[k].label} {k === "trigger" ? "start a workflow" : k === "condition" ? "split into Yes / No" : k === "action" ? "send, award or tag" : "wait, cap and exit"}</div>)}
      </div>
    </div>
  );
}

/* ───────────── templates ───────────── */
export function TemplatesDrawer({ isMedspa, busy, onClose, onLoad }: { isMedspa: boolean; busy: string | null; onClose: () => void; onLoad: (key: string) => void }) {
  const groups = [...TEMPLATE_GROUPS].sort((a, b) => (a.id === "medspa") === isMedspa ? -1 : (b.id === "medspa") === isMedspa ? 1 : 0);
  return (
    <div>
      <DrawerHead title="Template library" sub="Creates a draft you can edit, test, then publish." onClose={onClose} />
      <div className="space-y-6 p-5">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{g.label}</div>
            <p className="mt-0.5 text-[11px] text-zinc-400">{g.note}</p>
            <div className="mt-2 space-y-1.5">
              {g.templates.map((t) => (
                <button key={t.key} type="button" disabled={!!t.locked || !!busy} onClick={() => onLoad(t.key)}
                  className={cn("flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left hover:border-[#0B5FD6]/40", t.locked && "cursor-not-allowed opacity-50")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#14213d]">{t.name}</div>
                    <div className="truncate text-[11px] text-zinc-500">{t.locked ?? t.summary}</div>
                  </div>
                  {busy === t.key ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : t.locked ? <Lock className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── simulate ───────────── */
export function SimulateDrawer({ nodes, result, step, running, error, onPick, onClose, onReplay, searchMembers }: {
  nodes: WfNode[]; result: SimResult | null; step: number; running: boolean; error: string | null;
  onPick: (m: MemberHit | null) => void; onClose: () => void; onReplay: () => void; searchMembers: (q: string) => Promise<MemberHit[]>;
}) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<MemberHit[]>([]); const [picked, setPicked] = useState<MemberHit | null>(null);
  useEffect(() => { let off = false; const t = setTimeout(() => { searchMembers(q).then((h) => { if (!off) setHits(h); }).catch(() => setHits([])); }, 220); return () => { off = true; clearTimeout(t); }; }, [q, searchMembers]);
  const done = !!result && step >= result.path.length - 1;
  return (
    <div>
      <DrawerHead title="Simulate a customer" sub="Dry run on the server. Nothing is sent and no points are awarded." onClose={onClose} />
      <div className="p-5">
        {!result && (
          <>
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a member by name or email" className="pl-9" /></div>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.membership_id}><button type="button" onClick={() => setPicked(h)} className={cn("flex w-full items-center gap-3 rounded-lg border p-2.5 text-left", picked?.membership_id === h.membership_id ? "border-[#06318F] bg-[#eaf1fc]" : "border-zinc-200 bg-white hover:bg-zinc-50")}>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#14213d] text-[11px] font-semibold text-white">{(h.full_name ?? h.email ?? "?").slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-[#14213d]">{h.full_name ?? "Unnamed"}</span><span className="block truncate text-[11px] text-zinc-500">{h.email} · {h.points_balance} pts</span></span>
                </button></li>
              ))}
              {hits.length === 0 && q && <li className="p-2 text-[12px] text-zinc-500">No members match.</li>}
            </ul>
            <div className="mt-4 flex gap-2">
              <Button size="sm" className="flex-1 bg-[#06318F] text-white hover:bg-[#0B5FD6]" disabled={running} onClick={() => onPick(picked)}>{running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}{picked ? `Run for ${picked.full_name?.split(" ")[0] ?? "member"}` : "Run with a sample customer"}</Button>
            </div>
            {error && <p className="mt-3 text-[12px] text-rose-700">{error}</p>}
          </>
        )}
        {result && (
          <>
            <ol className="space-y-2">
              {result.path.map((p, i) => {
                const n = nodes.find((x) => x.id === p.node_id); if (!n) return null;
                const k = KIND_META[typeMeta(n.data.typeId).kind];
                const reached = i <= step, active = i === step && !done;
                return (
                  <li key={`${p.node_id}_${i}`} className={cn("flex items-start gap-2.5 rounded-lg border border-zinc-200 p-2.5 transition-all", reached ? "bg-white" : "opacity-40", active && "ring-2 ring-emerald-400")}>
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: reached ? (p.result === "no" ? "#e11d48" : "#10b981") : "#d4d4d8" }}>{reached ? <Check className="h-3 w-3" /> : i + 1}</span>
                    <div className="min-w-0"><div className="text-[12px] font-semibold" style={{ color: k.color }}>{n.data.title}{p.result === "yes" || p.result === "no" ? <span className="ml-1.5 text-zinc-500">→ {p.result.toUpperCase()}</span> : null}</div>{p.detail && <div className="text-[11px] text-zinc-500">{typeof p.detail === "string" ? p.detail : JSON.stringify(p.detail)}</div>}</div>
                  </li>
                );
              })}
            </ol>
            {done && (
              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-[12px] text-emerald-800">
                <b className="font-semibold">Simulation complete.</b> {result.path.length} steps · {result.would_send.length} message{result.would_send.length === 1 ? "" : "s"} would have gone out.
                {result.would_send.map((w, i) => <div key={i} className="mt-1.5 rounded border border-emerald-200 bg-white p-2 text-[11px] text-zinc-700"><b className="font-semibold uppercase text-emerald-700">{w.channel}</b> {w.title && <b className="font-semibold">{w.title} · </b>}{w.body}</div>)}
              </div>
            )}
            <div className="mt-4 flex gap-2"><Button variant="outline" size="sm" className="flex-1" onClick={onReplay}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Pick another member</Button></div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────── history ───────────── */
export function HistoryDrawer({ versions, currentVersionId, busy, onRestore, onClose }: { versions: WorkflowVersionRow[]; currentVersionId: string | null; busy: boolean; onRestore: (id: string) => void; onClose: () => void }) {
  return (
    <div>
      <DrawerHead title="Version history" sub="Every save is a draft version. Publish makes it live; restore repoints to an older one." onClose={onClose} />
      <ul className="divide-y divide-zinc-100">
        {versions.map((v) => {
          const live = v.id === currentVersionId;
          return (
            <li key={v.id} className="flex items-start gap-3 px-5 py-3.5">
              <span className={cn("mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", live ? "bg-[#06318F] text-white" : "bg-zinc-100 text-zinc-700")}>v{v.version}</span>
              <div className="min-w-0 flex-1"><div className="text-[13px] text-[#14213d]">{v.notes || (v.published_at ? "Published" : "Draft")}</div><div className="text-[11px] text-zinc-500">{live ? "Live now" : v.published_at ? `Published ${new Date(v.published_at).toLocaleDateString()}` : "Not published"}</div></div>
              {!live && v.published_at && <button disabled={busy} onClick={() => onRestore(v.id)} className="text-[12px] font-medium text-[#0B5FD6] hover:underline disabled:opacity-50">Restore</button>}
            </li>
          );
        })}
        {versions.length === 0 && <li className="px-5 py-6 text-[12px] text-zinc-500">Save the workflow to create its first version.</li>}
      </ul>
    </div>
  );
}

/* ───────────── existing (system) automations ───────────── */
export function SystemDrawer({ rows, loading, onClose }: { rows: LegacyAutomation[]; loading: boolean; onClose: () => void }) {
  return (
    <div>
      <DrawerHead title="Existing automations" sub="What Atlas already runs for this business, from the old triggers and scheduled jobs. Read-only here; switch them in their own settings." onClose={onClose} />
      {loading ? <div className="p-5 text-[12px] text-zinc-500">Loading…</div> : (
        <ul className="space-y-2 p-5">
          {rows.map((a) => (
            <li key={a.key} className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#14213d]"><span className={cn("h-2 w-2 rounded-full", a.enabled ? "bg-emerald-500" : "bg-zinc-300")} />{a.name}</div>
                <span className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-200"><Lock className="h-3 w-3" />System</span>
              </div>
              <div className="mt-1.5 text-[11px] text-zinc-600"><b className="font-semibold">When:</b> {a.trigger_text}</div>
              <div className="text-[11px] text-zinc-600"><b className="font-semibold">Does:</b> {a.action_text} <span className="text-zinc-400">· {a.channel}</span></div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500"><span>{a.sent_30d.toLocaleString()} in 30 days{a.last_fired_at ? ` · last ${timeAgo(a.last_fired_at)}` : ""}</span><span className="truncate pl-2 text-zinc-400">{a.controlled_by}</span></div>
            </li>
          ))}
          {rows.length === 0 && <li className="text-[12px] text-zinc-500">Nothing reported for this business.</li>}
        </ul>
      )}
      <p className="px-5 pb-5 text-[11px] text-zinc-500">Migrating one means rebuilding it as a workflow, running it in Testing, then switching the old job off for this business. Both never message the same person twice: the family rule stops that.</p>
    </div>
  );
}

/* ───────────── runs ───────────── */
export function RunsDrawer({ runs, loading, nodes, path, onPick, onClose }: { runs: RunRow[]; loading: boolean; nodes: WfNode[]; path: { membership: RunRow; steps: PathStep[] } | null; onPick: (r: RunRow) => void; onClose: () => void }) {
  const name = (id: string | null) => nodes.find((n) => n.id === id)?.data.title ?? "—";
  return (
    <div>
      <DrawerHead title="Customers in this workflow" sub="Recent runs. Click one to see that customer's actual path." onClose={onClose} />
      {path ? (
        <div className="p-5">
          <button onClick={() => onPick(path.membership)} className="text-[12px] font-medium text-[#0B5FD6] hover:underline">← All runs</button>
          <div className="mt-3 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#14213d] text-white"><User className="h-4 w-4" /></span><div><div className="text-[13px] font-semibold text-[#14213d]">{path.membership.member_name ?? "Member"}</div><div className="text-[11px] text-zinc-500">Entered {timeAgo(path.membership.entered_at)}{path.membership.exit_reason ? ` · exited: ${path.membership.exit_reason}` : ""}</div></div></div>
          <ol className="mt-4 space-y-2">
            {path.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-lg border border-zinc-200 bg-white p-2.5">
                <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white", s.result === "error" ? "bg-rose-500" : s.result === "no" ? "bg-rose-400" : s.result === "skipped" ? "bg-amber-400" : s.result === "waiting" ? "bg-violet-400" : "bg-emerald-500")}>{s.result === "waiting" ? <Clock className="h-3 w-3" /> : <Check className="h-3 w-3" />}</span>
                <div className="min-w-0 flex-1"><div className="text-[12px] font-semibold text-[#14213d]">{name(s.node_id)} <span className="font-normal text-zinc-500">· {s.result}</span></div>{s.detail && <div className="truncate text-[11px] text-zinc-500">{Object.entries(s.detail).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</div>}</div>
                <span className="shrink-0 text-[10px] text-zinc-400">{timeAgo(s.at)}</span>
              </li>
            ))}
            {path.steps.length === 0 && <li className="text-[12px] text-zinc-500">No steps recorded yet.</li>}
          </ol>
        </div>
      ) : loading ? <div className="p-5 text-[12px] text-zinc-500">Loading…</div> : (
        <ul className="divide-y divide-zinc-100">
          {runs.map((r) => (
            <li key={r.id}><button onClick={() => onPick(r)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-zinc-50">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", r.status === "error" ? "bg-rose-500" : r.status === "waiting" ? "bg-violet-400" : r.status === "running" ? "bg-[#0B5FD6]" : "bg-zinc-300")} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-[#14213d]">{r.member_name ?? "Member"}</span><span className="block truncate text-[11px] text-zinc-500">{r.status === "waiting" && r.wake_at ? `Waiting at "${name(r.current_node_id)}" · next ${timeAgo(r.wake_at)}` : r.exit_reason ? `Exited · ${r.exit_reason}` : `At "${name(r.current_node_id)}"`}</span></span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            </button></li>
          ))}
          {runs.length === 0 && <li className="px-5 py-6 text-[12px] text-zinc-500">No customers have entered this workflow yet.</li>}
        </ul>
      )}
    </div>
  );
}

/* ───────────── settings ───────────── */
export function SettingsPanel({ value, saving, onSave, onClose, searchMembers }: { value: AutomationSettings; saving: boolean; onSave: (s: AutomationSettings) => void; onClose: () => void; searchMembers: (q: string) => Promise<MemberHit[]> }) {
  const [s, setS] = useState<AutomationSettings>(value);
  const [q, setQ] = useState(""); const [hits, setHits] = useState<MemberHit[]>([]);
  useEffect(() => { if (!q) { setHits([]); return; } let off = false; const t = setTimeout(() => searchMembers(q).then((h) => { if (!off) setHits(h); }).catch(() => undefined), 220); return () => { off = true; clearTimeout(t); }; }, [q, searchMembers]);
  return (
    <div>
      <DrawerHead title="Automation settings" sub="Guardrails for every workflow on this business." onClose={onClose} />
      <div className="px-5 pb-6">
        <div className="mt-5 flex items-center justify-between rounded-lg border border-zinc-200 p-3">
          <div><div className="text-[13px] font-semibold text-[#14213d]">Engine on for this business</div><div className="text-[11px] text-zinc-500">Off: no new runs start, waiting runs hold. System automations are unaffected.</div></div>
          <Switch checked={s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} />
        </div>
        <Label>Quiet hours (local time)</Label>
        <div className="mt-1.5 flex items-center gap-2 text-[13px] text-zinc-700"><Input type="time" value={s.quiet_start} onChange={(e) => setS({ ...s, quiet_start: e.target.value })} className="h-9 w-32" /> to <Input type="time" value={s.quiet_end} onChange={(e) => setS({ ...s, quiet_end: e.target.value })} className="h-9 w-32" /></div>
        <Note>Messages due in this window slide to the end of it.</Note>
        <Label>Max messages per customer per week</Label>
        <Input type="number" min={1} max={14} value={s.max_msgs_per_member_per_week} onChange={(e) => setS({ ...s, max_msgs_per_member_per_week: Number(e.target.value) })} className="mt-1.5 w-24" />
        <Label>Test members</Label>
        <Note>Workflows in Testing only run for these members, with [TEST] on every message.</Note>
        <div className="mt-2 flex flex-wrap gap-1.5">{s.test_membership_ids.map((id) => <span key={id} className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 font-mono text-[10px]">{id.slice(0, 8)}…<button onClick={() => setS({ ...s, test_membership_ids: s.test_membership_ids.filter((x) => x !== id) })} aria-label="Remove"><X className="h-3 w-3" /></button></span>)}</div>
        <div className="relative mt-2"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a member by name or email" className="pl-9" /></div>
        {hits.length > 0 && <ul className="mt-1 rounded-lg border border-zinc-200 bg-white">{hits.map((h) => <li key={h.membership_id}><button onClick={() => { if (!s.test_membership_ids.includes(h.membership_id)) setS({ ...s, test_membership_ids: [...s.test_membership_ids, h.membership_id] }); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-zinc-50"><span>{h.full_name ?? h.email}</span><span className="text-zinc-400">{h.email}</span></button></li>)}</ul>}
        <Button className="mt-6 w-full bg-[#06318F] text-white hover:bg-[#0B5FD6]" disabled={saving} onClick={() => onSave(s)}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Save settings</Button>
      </div>
    </div>
  );
}

export function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000; const f = d < 0;
  const a = Math.abs(d);
  const s = a < 60 ? "just now" : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return s === "just now" ? s : f ? `in ${s}` : `${s} ago`;
}
