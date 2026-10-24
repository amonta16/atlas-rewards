"use client";
/**
 * JourneyDetail — CP-217 · one suite journey: read-only flowchart on the left,
 * every message in order on the right with a realistic preview (iPhone lock
 * screen + in-app bell for push, inbox + the real branded email for email),
 * inline editing of words and points (wf_suite_update) and a reset to the
 * Atlas default (wf_suite_reset). Timing and logic stay Atlas-managed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Check, Clock3, Gift, Info, Loader2, Lock, Mail, Pencil, RotateCcw, Smartphone, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { hub, EngineError } from "@/lib/automations/client";
import { VARIABLES, VAR_LABEL, renderVars, type VarSample } from "@/lib/automations/catalog";
import { autoLayout, toFlow } from "@/lib/automations/graph";
import type { BusinessOption, SuiteJourney, SuiteMessage, SuitePatch, SuitePreviewData } from "@/lib/automations/types";
import { nodeTypes, edgeTypes, ArrowDefs } from "./nodes";
import { BellPreview, EmailPreview, PushPreview, type PreviewBrand } from "./previews";

export function JourneyDetail({ business, journey: j, preview, onBack, onToggle, togglePending, onChanged, onReload }: {
  business: BusinessOption; journey: SuiteJourney; preview: SuitePreviewData;
  onBack: () => void; onToggle: (v: boolean) => void; togglePending: boolean; onChanged: (j: SuiteJourney) => void; onReload: () => Promise<void> | void;
}) {
  const [active, setActive] = useState<string | null>(j.messages[0]?.node_id ?? null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = j.engine === "workflow";

  const brand: PreviewBrand = { name: preview.brand.name || business.name, logoUrl: preview.brand.logo_url, primary: preview.brand.primary || "#0B5FD6", heroUrl: preview.brand.hero_url };
  const baseVals: VarSample = { ...preview.sample, business: brand.name };

  const reset = async () => {
    setResetting(true); setError(null);
    try { await hub.suiteReset(business.id, j.key); await onReload(); setConfirmReset(false); }
    catch (e) { setError(e instanceof EngineError ? e.message : "Couldn't reset. Try again."); }
    finally { setResetting(false); }
  };
  const jump = (nodeId: string) => {
    if (!j.messages.some((m) => m.node_id === nodeId)) return;
    setActive(nodeId);
    document.getElementById(`msg-${nodeId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-8 mt-2">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[12.5px] font-medium text-zinc-500 hover:text-[#14213d]"><ArrowLeft className="h-3.5 w-3.5" />All journeys</button>

      {/* Title row */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-[720px]">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[20px] font-semibold tracking-tight text-[#14213d]">{j.name}</h2>
            {j.engine === "legacy" && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Built-in</span>}
          </div>
          <p className="mt-1 text-[13.5px] text-zinc-500">{j.why}</p>
        </div>
        <div className="flex items-center gap-3">
          {editable && (confirmReset ? (
            <span className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900 ring-1 ring-amber-200">
              Undo every edit to this journey?
              <button onClick={reset} disabled={resetting} className="font-semibold hover:underline">{resetting ? "Resetting…" : "Reset"}</button>
              <button onClick={() => setConfirmReset(false)} className="text-amber-700 hover:underline">Cancel</button>
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset to Atlas default</Button>
          ))}
          <label className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5">
            <span className={cn("text-[12.5px] font-semibold", j.enabled ? "text-[#047857]" : "text-zinc-500")}>{j.enabled ? "On" : "Off"}</span>
            <Switch className="data-[state=checked]:bg-[#0B5FD6] data-[state=unchecked]:bg-zinc-300" checked={j.enabled} disabled={togglePending} onCheckedChange={onToggle} aria-label="Journey on or off" />
          </label>
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800 ring-1 ring-rose-200">{error}</div>}

      {/* Facts */}
      <div className="mt-4 flex flex-wrap items-stretch divide-x divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-[12.5px]">
        <Fact icon={<Zap className="h-3.5 w-3.5" />} label="Starts" value={j.trigger_text} />
        <Fact icon={<Clock3 className="h-3.5 w-3.5" />} label="Timing" value={j.timing_text} />
        <Fact icon={j.channels.includes("email") ? <Mail className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />} label="Channels" value={j.channels.map((c) => (c === "push" ? "Push + in-app" : "Email")).join(" · ") || "—"} />
        <Fact icon={<Gift className="h-3.5 w-3.5" />} label="Reward" value={j.reward_text ?? "None"} />
        <div className="ml-auto flex items-center gap-5 px-4 py-2.5" title="Last 30 days">
          <Stat v={j.entered_30d} l="entered" /><Stat v={j.sent_30d} l="sent" /><Stat v={j.converted_30d} l="converted" green />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-5">
        {/* Left: flowchart + research */}
        <div className="sticky top-4 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
              <span className="text-[12px] font-semibold text-[#14213d]">How it runs</span>
              <span className="flex items-center gap-1 text-[11px] text-zinc-400"><Lock className="h-3 w-3" />Logic managed by Atlas</span>
            </div>
            <div className="h-[calc(100vh-140px)] max-h-[680px] min-h-[460px]">
              <ReactFlowProvider><Flow journey={j} active={active} onPick={jump} /></ReactFlowProvider>
            </div>
          </div>
          {j.research && (
            <div className="rounded-2xl border border-[#d6e4fa] bg-[#f5f9ff] px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#06318F]"><Info className="h-3.5 w-3.5" />Why this timing</div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#2a3a5c]">{j.research}</p>
            </div>
          )}
        </div>

        {/* Right: messages in order */}
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{j.messages.length} message{j.messages.length === 1 ? "" : "s"}, in order</span>
            <span className="text-[11.5px] text-zinc-400">Previewed for {preview.sample.first_name}</span>
          </div>
          {j.messages.map((m, i) => (
            <MessageCard key={m.node_id} n={i + 1} m={m} journey={j} business={business} brand={brand} baseVals={baseVals} preview={preview}
              editable={editable} active={active === m.node_id} onFocus={() => setActive(m.node_id)} onSaved={onChanged} />
          ))}
          {j.messages.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-[13px] text-zinc-500">This journey doesn&apos;t send a message of its own.</div>}
          {!editable && <p className="px-1 text-[12px] text-zinc-500">Built-in journeys run on the existing system automation. You can switch it on or off here; its words follow the defaults.</p>}
        </div>
      </div>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{icon}{label}</div>
      <div className="mt-0.5 text-[13px] font-medium text-[#14213d]">{value}</div>
    </div>
  );
}
const Stat = ({ v, l, green }: { v: number; l: string; green?: boolean }) => (
  <span className="flex items-baseline gap-1.5"><b className={cn("text-[16px] font-semibold tabular-nums", green && v > 0 ? "text-[#047857]" : "text-[#14213d]")}>{v.toLocaleString()}</b><span className="text-[11px] text-zinc-500">{l}</span></span>
);

/* ───────────── read-only flowchart ───────────── */
function Flow({ journey, active, onPick }: { journey: SuiteJourney; active: string | null; onPick: (id: string) => void }) {
  const rf = useReactFlow();
  const base = useMemo(() => {
    const g = journey.graph.nodes.some((n) => n.position && (n.position.x || n.position.y)) ? journey.graph : autoLayout(journey.graph);
    return toFlow(g);
  }, [journey.graph]);
  const msgIds = useMemo(() => new Set(journey.messages.map((m) => m.node_id)), [journey.messages]);
  const nodes = useMemo(() => base.nodes.map((n) => ({ ...n, draggable: false, connectable: false, data: { ...n.data, readOnly: true, highlight: n.id === active }, style: { cursor: msgIds.has(n.id) ? "pointer" : "default" } })), [base.nodes, active, msgIds]);
  const box = useRef<HTMLDivElement>(null);
  // Fit the WIDTH (readable cards), start at the top, scroll/pan for the rest.
  const fitTop = useCallback(() => {
    const el = box.current; if (!el || !base.nodes.length) return;
    const b = rf.getNodesBounds(base.nodes);
    const zoom = Math.max(0.4, Math.min(0.85, (el.clientWidth - 32) / Math.max(1, b.width)));
    rf.setViewport({ x: (el.clientWidth - b.width * zoom) / 2 - b.x * zoom, y: 20 - b.y * zoom, zoom });
  }, [rf, base.nodes]);
  useEffect(() => { const t = setTimeout(fitTop, 160); return () => clearTimeout(t); }, [journey.key, fitTop]);
  // Keep the selected message's step in view.
  useEffect(() => {
    const el = box.current; const n = base.nodes.find((x) => x.id === active); if (!el || !n) return;
    const { x, y, zoom } = rf.getViewport();
    const top = n.position.y * zoom + y, bottom = top + 90 * zoom;
    if (top < 16 || bottom > el.clientHeight - 16) rf.setViewport({ x, y: el.clientHeight / 3 - n.position.y * zoom, zoom }, { duration: 300 });
  }, [active, base.nodes, rf]);
  return (
    <div ref={box} className="relative h-full">
      <ArrowDefs />
      <ReactFlow nodes={nodes} edges={base.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} edgesFocusable={false} zoomOnScroll={false} panOnScroll
        onNodeClick={(_, n) => onPick(n.id)}
        minZoom={0.25} maxZoom={1.2} proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="#e3e9f0" />
        <Controls position="bottom-left" showInteractive={false} className="!rounded-lg !border !border-zinc-200 !shadow-sm" />
      </ReactFlow>
    </div>
  );
}

/* ───────────── one message: preview + inline editing ───────────── */
type FieldKey = "title" | "body" | "subject" | "preheader" | "heading" | "cta_label" | "footnote";

function MessageCard({ n, m, journey, business, brand, baseVals, preview, editable, active, onFocus, onSaved }: {
  n: number; m: SuiteMessage; journey: SuiteJourney; business: BusinessOption; brand: PreviewBrand; baseVals: VarSample; preview: SuitePreviewData;
  editable: boolean; active: boolean; onFocus: () => void; onSaved: (j: SuiteJourney) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SuitePatch>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const focused = useRef<{ key: FieldKey; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const cur = { ...m, ...draft };
  const vals: VarSample = { ...baseVals, ...(cur.points != null ? { points: cur.points } : {}) };
  const r = (s: string | null | undefined) => renderVars(s, vals);
  const isPush = m.channel === "push";

  const start = () => { setDraft({}); setErr(null); setEditing(true); onFocus(); };
  const cancel = () => { setDraft({}); setEditing(false); setErr(null); };
  const set = (k: keyof SuitePatch, v: string | number | null) => setDraft((d) => ({ ...d, [k]: v }));
  const insertVar = (v: string) => {
    const f = focused.current;
    const key: FieldKey = f?.key ?? "body";
    const val = String(cur[key] ?? "");
    const s0 = f?.el.selectionStart ?? val.length, e0 = f?.el.selectionEnd ?? val.length;
    const next = val.slice(0, s0) + v + val.slice(e0);
    set(key, next);
    requestAnimationFrame(() => { const el = f?.el; if (el) { el.focus(); const p = s0 + v.length; el.setSelectionRange(p, p); } });
  };
  const changed = (Object.keys(draft) as (keyof SuitePatch)[]).filter((k) => draft[k] !== m[k]);
  const save = async () => {
    if (!changed.length) { setEditing(false); return; }
    setSaving(true); setErr(null);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, draft[k]])) as SuitePatch;
      const row = await hub.suiteUpdate(business.id, journey.key, m.node_id, patch);
      onSaved(row); setDraft({}); setEditing(false); setSavedTick(true); setTimeout(() => setSavedTick(false), 2200);
    } catch (e) { setErr(e instanceof EngineError ? e.message : "Couldn't save. Try again."); }
    finally { setSaving(false); }
  };

  const field = (k: FieldKey, label: string, opts: { area?: boolean; rows?: number; placeholder?: string } = {}) => {
    const common = {
      value: String(cur[k] ?? ""), placeholder: opts.placeholder,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value),
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { focused.current = { key: k, el: e.currentTarget }; },
      onSelect: (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => { focused.current = { key: k, el: e.currentTarget }; },
    };
    return (
      <div>
        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</label>
        {opts.area
          ? <textarea {...common} rows={opts.rows ?? 4} className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] leading-snug outline-none focus:ring-2 focus:ring-[#0B5FD6]" />
          : <Input {...common} className="h-9 text-[13px]" />}
      </div>
    );
  };

  return (
    <div id={`msg-${m.node_id}`} onClick={onFocus}
      className={cn("scroll-mt-4 overflow-hidden rounded-2xl border bg-white transition-shadow", active ? "border-[#9cc3f5] shadow-[0_12px_32px_-20px_rgba(11,95,214,.5)]" : "border-zinc-200")}>
      {/* header */}
      <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#06318F] text-[11px] font-semibold text-white">{n}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#14213d]">{m.when_text}</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">{isPush ? <><Smartphone className="h-3 w-3" />Push + in-app</> : <><Mail className="h-3 w-3" />Email</>}</span>
        {savedTick && <span className="flex items-center gap-1 text-[11.5px] font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />Saved</span>}
        {editable && !editing && <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={(e) => { e.stopPropagation(); start(); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>}
      </div>

      <div className={cn("grid gap-5 p-4", isPush ? "grid-cols-[300px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_280px]")}>
        {/* preview */}
        {isPush ? (
          <PushPreview brand={brand} title={r(cur.title)} body={r(cur.body)} />
        ) : (
          <EmailPreview brand={brand} toName={`${preview.sample.first_name} <${preview.sample.first_name.toLowerCase()}@example.com>`} sender={preview.sender}
            subject={r(cur.subject)} preheader={r(cur.preheader)} heading={cur.heading ? r(cur.heading) : null} body={r(cur.body)}
            ctaLabel={cur.cta_label ? r(cur.cta_label) : null} ctaUrl={cur.cta_label ? cur.cta_path || "#" : null} footnote={cur.footnote ? r(cur.footnote) : null} />
        )}

        {/* side: editor or details */}
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              {isPush ? (<>{field("title", "Title")}{field("body", "Message", { area: true, rows: 4 })}</>) : (<>
                {field("subject", "Subject")}{field("preheader", "Preview text")}{field("heading", "Heading")}{field("body", "Body", { area: true, rows: 6 })}
                {field("cta_label", "Button")}{field("footnote", "Footnote", { placeholder: "Optional" })}
              </>)}
              {m.points != null && (
                <div>
                  <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Points</label>
                  <Input type="number" min={0} step={10} value={cur.points ?? 0} onChange={(e) => set("points", Math.max(0, Number(e.target.value) || 0))} className="h-9 w-28 text-[13px]" />
                </div>
              )}
              <div>
                <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Insert</div>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map((v) => { const k = v.replace(/[{}]/g, ""); return (
                    <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)} title={v}
                      className="rounded-md bg-[#eaf1fc] px-2 py-1 text-[11px] font-medium text-[#0B5FD6] hover:bg-[#dbe8fb]">{VAR_LABEL[k] ?? k}</button>
                  ); })}
                </div>
              </div>
              {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{err}</div>}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="bg-[#06318F] text-white hover:bg-[#0B5FD6]" disabled={saving} onClick={save}>{saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save</Button>
                <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
                <span className="ml-auto text-[11px] text-zinc-400">{changed.length ? `${changed.length} change${changed.length === 1 ? "" : "s"}` : "No changes yet"}</span>
              </div>
            </div>
          ) : isPush ? (
            <div className="space-y-4">
              <BellPreview brand={brand} title={r(cur.title)} body={r(cur.body)} />
              <dl className="space-y-2 text-[12.5px]">
                {m.cta_path && <Row k="Opens" v={<span className="font-mono text-[12px]">{m.cta_path}</span>} />}
                {m.points != null && <Row k="Reward" v={<span className="font-medium text-[#0B5FD6]">+{m.points} points</span>} />}
              </dl>
            </div>
          ) : (
            <dl className="space-y-2.5 text-[12.5px]">
              <Row k="From" v={`${preview.sender.from_name || brand.name}`} sub={preview.sender.from_address} />
              <Row k="Replies go to" v={preview.sender.reply_to ?? "The clinic's contact email"} />
              {m.cta_label && <Row k="Button" v={m.cta_label} sub={m.cta_path ?? undefined} />}
              {m.points != null && <Row k="Reward" v={<span className="font-medium text-[#0B5FD6]">+{m.points} points</span>} />}
              <Row k="Unsubscribe" v="Link in every email" />
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) => (
  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
    <dt className="text-zinc-400">{k}</dt>
    <dd className="min-w-0 text-[#14213d] [overflow-wrap:anywhere]">{v}{sub && <div className="text-[11.5px] text-zinc-500">{sub}</div>}</dd>
  </div>
);
