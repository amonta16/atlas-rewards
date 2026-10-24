"use client";
/**
 * WorkflowBuilder — CP-216 · the admin Automation Hub, wired to the engine.
 *
 * Layout (spec §10): dashboard strip → toolbar → palette | canvas | panel.
 * All data goes through lib/automations/client.ts (contract RPCs); the graph
 * is converted to/from React Flow in lib/automations/graph.ts only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, addEdge, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider, MarkerType, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Save, Rocket, Pause, History, LayoutTemplate, Wand2, AlertTriangle, Lock, Search, Plus, Settings2, Users, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hub, EngineError, isMockHost } from "@/lib/automations/client";
import { KIND_META, NODE_TYPES, typeMeta } from "@/lib/automations/catalog";
import { autoLayout, fromFlow, hasErrors, toFlow, validateGraph, type WfEdge, type WfNode } from "@/lib/automations/graph";
import type { AutomationSettings, BusinessOption, HubSummary, LegacyAutomation, MemberHit, NodeKind, NodeMetrics, NodeTypeId, PathStep, RunRow, SimResult, ValidationItem, WorkflowDetail, WorkflowListRow, WorkflowStatus } from "@/lib/automations/types";
import { nodeTypes, edgeTypes, ArrowDefs, iconFor as iconForPalette, type NodeExtra } from "./nodes";
import { DashboardStrip } from "./dashboard-strip";
import { ConfigPanel, EmptyPanel, TemplatesDrawer, SimulateDrawer, HistoryDrawer, SystemDrawer, RunsDrawer, SettingsPanel } from "./panels";

const STATUS: Record<WorkflowStatus, { label: string; dot: string }> = {
  draft: { label: "Draft", dot: "bg-zinc-400" }, testing: { label: "Testing", dot: "bg-amber-400" }, active: { label: "Active", dot: "bg-emerald-500" },
  paused: { label: "Paused", dot: "bg-orange-400" }, archived: { label: "Archived", dot: "bg-zinc-300" }, error: { label: "Error", dot: "bg-rose-500" },
};
const DEFAULT_SETTINGS: AutomationSettings = { enabled: false, quiet_start: "20:00", quiet_end: "10:00", max_msgs_per_member_per_week: 3, test_membership_ids: [] };

export function WorkflowBuilder({ businesses, business }: { businesses: BusinessOption[]; business: BusinessOption }) {
  return <ReactFlowProvider><Inner businesses={businesses} business={business} /></ReactFlowProvider>;
}

type Drawer = null | "templates" | "simulate" | "history" | "system" | "runs" | "settings";

function Inner({ businesses, business }: { businesses: BusinessOption[]; business: BusinessOption }) {
  const router = useRouter();
  const rf = useReactFlow();
  const isMedspa = business.layout_preset === "medspa";

  /* data */
  const [summary, setSummary] = useState<HubSummary | null>(null);
  const [legacy, setLegacy] = useState<LegacyAutomation[] | null>(null);
  const [list, setList] = useState<WorkflowListRow[] | null>(null);
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, NodeMetrics>>({});
  const [engineError, setEngineError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* canvas */
  const [nodes, setNodes, onNodesChange] = useNodesState<WfNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WfEdge>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [serverIssues, setServerIssues] = useState<ValidationItem[]>([]);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [paletteQ, setPaletteQ] = useState("");
  const [sim, setSim] = useState<{ result: SimResult | null; step: number; running: boolean; error: string | null }>({ result: null, step: 0, running: false, error: null });
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [runPath, setRunPath] = useState<{ membership: RunRow; steps: PathStep[] } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showWfMenu, setShowWfMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const fail = (e: unknown) => setEngineError(e instanceof EngineError ? e.message : e instanceof Error ? e.message : "Something went wrong.");
  const fit = () => setTimeout(() => rf.fitView({ padding: 0.15, duration: 400, minZoom: 0.5, maxZoom: 0.9 }), 60);

  /* load business-level data */
  const reloadBusiness = useCallback(async () => {
    setEngineError(null);
    try {
      const [s, l] = await Promise.all([hub.summary(business.id), hub.list(business.id)]);
      setSummary(s); setList(l);
      return l;
    } catch (e) { fail(e); setSummary(null); setList([]); return [] as WorkflowListRow[]; }
  }, [business.id]);

  const openWorkflow = useCallback(async (id: string) => {
    setBusy("open");
    try {
      const d = await hub.get(id);
      setWf(d); setIsNew(false); setName(d.name);
      const f = toFlow(d.graph.nodes.some((n) => n.position && (n.position.x || n.position.y)) ? d.graph : autoLayout(d.graph));
      setNodes(f.nodes); setEdges(f.edges); setSelectedId(null); setDirty(false); setServerIssues([]); setSim({ result: null, step: 0, running: false, error: null }); setRuns(null); setRunPath(null);
      fit();
      hub.nodeMetrics(id, 30).then((m) => setMetrics(Object.fromEntries(m.map((x) => [x.node_id, x])))).catch(() => setMetrics({}));
    } catch (e) { fail(e); } finally { setBusy(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes, setEdges]);

  const newBlank = () => {
    setWf(null); setIsNew(true); setName("Untitled workflow"); setNodes([]); setEdges([]); setMetrics({}); setSelectedId(null); setDirty(false); setServerIssues([]); setDrawer("templates"); setShowWfMenu(false);
  };

  useEffect(() => {
    let off = false;
    (async () => {
      const l = await reloadBusiness();
      if (off) return;
      if (l.length) openWorkflow(l[0].id); else newBlank();
    })();
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  /* graph helpers */
  const graph = useMemo(() => fromFlow(nodes, edges), [nodes, edges]);
  const clientIssues = useMemo(() => validateGraph(graph), [graph]);
  const issues = useMemo(() => {
    const seen = new Set(clientIssues.map((i) => `${i.node_id}|${i.message}`));
    return [...clientIssues, ...serverIssues.filter((i) => !seen.has(`${i.node_id}|${i.message}`))];
  }, [clientIssues, serverIssues]);
  const blocked = hasErrors(issues);
  const errorNodes = useMemo(() => new Set(issues.filter((i) => i.level === "error" && i.node_id).map((i) => i.node_id!)), [issues]);
  const warnNodes = useMemo(() => new Set(issues.filter((i) => i.level === "warn" && i.node_id).map((i) => i.node_id!)), [issues]);

  const simPath = sim.result?.path ?? [];
  const viewNodes = useMemo(() => nodes.map((n) => {
    const idx = simPath.findIndex((p) => p.node_id === n.id);
    const reached = idx >= 0 && idx <= sim.step;
    const extra: NodeExtra = {
      invalid: errorNodes.has(n.id), warn: warnNodes.has(n.id), metrics: metrics[n.id],
      simState: !sim.result ? undefined : idx === sim.step ? "active" : reached ? (simPath[idx].result === "yes" ? "yes" : simPath[idx].result === "no" ? "no" : "path") : undefined,
      dim: !!sim.result && idx < 0,
    };
    return { ...n, data: { ...n.data, ...extra } };
  }), [nodes, errorNodes, warnNodes, metrics, sim, simPath]);
  const viewEdges = useMemo(() => edges.map((e) => {
    if (!sim.result) return e;
    const ids = simPath.slice(0, sim.step + 1).map((p) => p.node_id);
    const i = ids.indexOf(e.source);
    const hot = i >= 0 && ids[i + 1] === e.target && (!e.sourceHandle || e.sourceHandle === simPath[i].result);
    return { ...e, data: { ...(e.data ?? {}), hot } };
  }), [edges, sim, simPath]);
  useEffect(() => {
    if (!sim.result || sim.step >= sim.result.path.length - 1) return;
    const t = setTimeout(() => setSim((s) => ({ ...s, step: s.step + 1 })), 650);
    return () => clearTimeout(t);
  }, [sim]);

  const onConnect = useCallback((c: Connection) => {
    const src = nodes.find((n) => n.id === c.source);
    const isCond = src && typeMeta(src.data.typeId).kind === "condition";
    const branch = isCond ? (c.sourceHandle === "yes" ? "yes" : "no") : null;
    setEdges((eds) => addEdge({ ...c, id: `e_${c.source}_${c.target}_${branch ?? "x"}`, type: "wf", sourceHandle: branch ?? undefined, label: branch === "yes" ? "Yes" : branch === "no" ? "No" : undefined }, eds));
    setDirty(true);
  }, [nodes, setEdges]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const updateSelected = (p: { title?: string; config?: Record<string, unknown> }) => {
    if (!selected) return;
    setNodes((ns) => ns.map((n) => n.id === selected.id ? { ...n, data: { ...n.data, ...(p.title != null ? { title: p.title } : {}), ...(p.config ? { config: p.config as WfNode["data"]["config"] } : {}) } } : n));
    setDirty(true);
  };
  const deleteSelected = () => { if (!selected) return; setNodes((ns) => ns.filter((n) => n.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSelectedId(null); setDirty(true); };

  const onDragStart = (e: React.DragEvent, typeId: NodeTypeId) => { e.dataTransfer.setData("application/atlas-node", typeId); e.dataTransfer.effectAllowed = "move"; };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const typeId = e.dataTransfer.getData("application/atlas-node") as NodeTypeId; if (!typeId) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const m = typeMeta(typeId);
    const n: WfNode = { id: `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: "wf", position: { x: pos.x - 132, y: pos.y - 30 }, data: { typeId, title: m.label, config: typeId === "w.wait" ? { minutes: 1440 } : typeId === "t.inactive" ? { days: 14 } : {} } };
    setNodes((ns) => [...ns, n]); setSelectedId(n.id); setDirty(true);
  };
  const doAutoLayout = () => { const f = toFlow(autoLayout(graph)); setNodes((ns) => ns.map((n) => ({ ...n, position: f.nodes.find((x) => x.id === n.id)?.position ?? n.position }))); setDirty(true); fit(); };

  /* actions */
  const save = async (): Promise<{ workflowId: string; versionId: string } | null> => {
    setBusy("save"); setEngineError(null);
    try {
      const r = await hub.saveDraft({ workflowId: isNew ? null : wf?.id ?? null, businessId: business.id, name: name.trim() || "Untitled workflow", family: wf?.family ?? null, graph });
      setServerIssues(r.validation ?? []);
      setDirty(false); setSavedAt(new Date());
      const d = await hub.get(r.workflow_id);
      setWf(d); setIsNew(false);
      reloadBusiness();
      return { workflowId: r.workflow_id, versionId: r.version_id };
    } catch (e) { fail(e); return null; } finally { setBusy(null); }
  };
  const publish = async () => {
    const saved = dirty || isNew || !wf ? await save() : { workflowId: wf.id, versionId: wf.versions[0]?.id ?? "" };
    if (!saved) return;
    if (blocked) return;
    setBusy("publish");
    try {
      const mode = (summary?.settings?.test_membership_ids.length ?? 0) > 0 && wf?.status !== "active" ? "testing" : "active";
      await hub.publish(saved.workflowId, saved.versionId, mode);
      await openWorkflow(saved.workflowId); reloadBusiness();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const setStatus = async (s: WorkflowStatus) => { if (!wf) return; setBusy("status"); try { await hub.setStatus(wf.id, s); await openWorkflow(wf.id); reloadBusiness(); } catch (e) { fail(e); } finally { setBusy(null); } };
  const rollback = async (vid: string) => { if (!wf) return; setBusy("rollback"); try { await hub.rollback(wf.id, vid); await openWorkflow(wf.id); } catch (e) { fail(e); } finally { setBusy(null); } };
  const loadTemplate = async (key: string) => {
    setBusy(`tpl:${key}`);
    try { const d = await hub.loadTemplate(business.id, key); await openWorkflow(d.id); reloadBusiness(); setDrawer(null); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };
  const runSim = async (m: MemberHit | null) => {
    setSim({ result: null, step: 0, running: true, error: null });
    try {
      let versionId = wf?.versions[0]?.id ?? null; let workflowId = wf?.id ?? null;
      if (dirty || isNew || !workflowId) { const s = await save(); if (!s) throw new Error("Save failed"); workflowId = s.workflowId; versionId = s.versionId; }
      const r = await hub.simulate(workflowId!, versionId, m?.membership_id ?? null, graph);
      setSim({ result: r, step: 0, running: false, error: null }); setSelectedId(null);
    } catch (e) { setSim({ result: null, step: 0, running: false, error: e instanceof Error ? e.message : "Simulation failed" }); }
  };
  const openRuns = async () => { setDrawer("runs"); setRunPath(null); if (!wf) return; setRuns(null); try { setRuns(await hub.runs(wf.id)); } catch (e) { fail(e); setRuns([]); } };
  const pickRun = async (r: RunRow) => { if (runPath?.membership.id === r.id) { setRunPath(null); return; } if (!wf) return; try { setRunPath({ membership: r, steps: await hub.memberPath(wf.id, r.membership_id) }); } catch (e) { fail(e); } };
  const saveSettings = async (s: AutomationSettings) => { setBusy("settings"); try { await hub.setSettings(business.id, s); await reloadBusiness(); setDrawer(null); } catch (e) { fail(e); } finally { setBusy(null); } };
  const openSystem = async () => { setDrawer("system"); if (legacy) return; try { setLegacy(await hub.legacy(business.id)); } catch (e) { fail(e); setLegacy([]); } };
  const searchMembers = useCallback((q: string) => hub.searchMembers(business.id, q), [business.id]);

  const palette = NODE_TYPES.filter((t) => !paletteQ || t.label.toLowerCase().includes(paletteQ.toLowerCase()));
  const kinds: NodeKind[] = ["trigger", "condition", "action", "timing"];
  const status: WorkflowStatus = wf?.status ?? "draft";
  const errCount = issues.filter((i) => i.level === "error").length;
  const selectedIssues = selected ? issues.filter((i) => i.node_id === selected.id) : [];
  const engineOff = summary ? !summary.engine_enabled : false;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="px-8 pb-3 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-semibold tracking-tight text-[#14213d]">Automations</h1>
              {isMockHost() && <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">Local preview · mock engine</span>}
            </div>
            <div className="relative mt-1.5">
              <button type="button" onClick={() => setShowPicker((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-zinc-600 hover:text-[#14213d]">
                <span className="font-medium text-[#14213d]">{business.name}</span><span className="text-zinc-400">·</span>{isMedspa ? "Med spa" : "Classic"} layout<ChevronDown className="h-3.5 w-3.5" />
              </button>
              {showPicker && (
                <div className="absolute left-0 top-7 z-30 max-h-80 w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
                  {businesses.map((b) => (
                    <button key={b.id} type="button" onClick={() => { setShowPicker(false); router.push(`/agency/automations?business=${encodeURIComponent(b.slug)}`); }}
                      className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-zinc-50", b.id === business.id && "bg-[#eaf1fc]")}>
                      <span className="truncate">{b.name}</span><span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">{b.layout_preset === "medspa" ? "med spa" : "classic"}{b.is_demo ? " · demo" : ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openSystem}><Lock className="mr-1.5 h-4 w-4" />Existing automations</Button>
            <Button variant="outline" size="sm" onClick={() => setDrawer("settings")}><Settings2 className="mr-1.5 h-4 w-4" />Settings</Button>
            <Button size="sm" className="bg-[#06318F] text-white hover:bg-[#0B5FD6]" onClick={() => setDrawer("templates")}><LayoutTemplate className="mr-1.5 h-4 w-4" />Templates</Button>
          </div>
        </div>

        {engineError && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">
            <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{engineError}</span>
            <button onClick={() => { setEngineError(null); reloadBusiness(); }} className="flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"><RefreshCw className="h-3 w-3" />Retry</button>
          </div>
        )}

        <div className="mt-3"><DashboardStrip s={summary} loading={!summary && !engineError} /></div>
      </div>

      {/* Toolbar */}
      <div className="mx-8 flex items-center gap-3 rounded-t-2xl border border-b-0 border-zinc-200 bg-white px-4 py-2.5">
        <div className="relative">
          <button type="button" onClick={() => setShowWfMenu((v) => !v)} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
            <Users className="h-3.5 w-3.5 text-zinc-500" />{list ? `${list.length} workflow${list.length === 1 ? "" : "s"}` : "…"}<ChevronDown className="h-3.5 w-3.5" />
          </button>
          {showWfMenu && (
            <div className="absolute left-0 top-10 z-30 w-[380px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
              {(list ?? []).map((w) => (
                <button key={w.id} type="button" onClick={() => { setShowWfMenu(false); openWorkflow(w.id); }} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-50", wf?.id === w.id && "bg-[#eaf1fc]")}>
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS[w.status].dot)} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-[#14213d]">{w.name}</span><span className="block text-[11px] text-zinc-500">{STATUS[w.status].label} · v{w.version}{w.running_now ? ` · ${w.running_now} in progress` : ""}{w.sent_30d ? ` · ${w.sent_30d} sent` : ""}</span></span>
                  {w.last_error && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                </button>
              ))}
              {list && list.length === 0 && <div className="px-3 py-2 text-[12px] text-zinc-500">No workflows yet.</div>}
              <button type="button" onClick={newBlank} className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-zinc-100 px-3 py-2 text-left text-[13px] font-medium text-[#0B5FD6] hover:bg-zinc-50"><Plus className="h-4 w-4" />New workflow</button>
            </div>
          )}
        </div>
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#14213d] outline-none" aria-label="Workflow name" />
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700"><span className={cn("h-2 w-2 rounded-full", STATUS[status].dot)} />{isNew ? "New" : STATUS[status].label}</span>
        <span className="text-[12px] text-zinc-500">{wf ? `v${wf.version}` : ""}{dirty ? " · unsaved" : savedAt ? ` · saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        {errCount > 0 && <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"><AlertTriangle className="h-3 w-3" />{errCount} to fix</span>}
        <div className="mx-1 h-6 w-px bg-zinc-200" />
        <Button variant="ghost" size="sm" onClick={doAutoLayout}><Wand2 className="mr-1.5 h-4 w-4" />Auto-layout</Button>
        <Button variant="ghost" size="sm" onClick={() => setDrawer("history")} disabled={!wf}><History className="mr-1.5 h-4 w-4" />History</Button>
        <Button variant="ghost" size="sm" onClick={openRuns} disabled={!wf || status === "draft"}><Users className="mr-1.5 h-4 w-4" />Runs</Button>
        <Button variant="outline" size="sm" onClick={save} disabled={busy === "save" || (!dirty && !isNew)}>{busy === "save" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Save</Button>
        <Button variant="outline" size="sm" onClick={() => { setSim({ result: null, step: 0, running: false, error: null }); setDrawer("simulate"); }} disabled={!nodes.length}><Play className="mr-1.5 h-4 w-4" />Test</Button>
        {status === "active" || status === "testing"
          ? <Button size="sm" className="bg-orange-500 text-white hover:bg-orange-600" disabled={!!busy} onClick={() => setStatus("paused")}><Pause className="mr-1.5 h-4 w-4" />Pause</Button>
          : status === "paused"
            ? <Button size="sm" className="bg-[#06318F] text-white hover:bg-[#0B5FD6]" disabled={!!busy} onClick={() => setStatus("active")}><Play className="mr-1.5 h-4 w-4" />Resume</Button>
            : <Button size="sm" className="bg-[#06318F] text-white hover:bg-[#0B5FD6]" disabled={blocked || !nodes.length || !!busy} title={blocked ? "Fix the items in the right panel first" : undefined} onClick={publish}>{busy === "publish" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}Publish</Button>}
      </div>
      {engineOff && status !== "draft" && !isNew && (
        <div className="mx-8 border-x border-zinc-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">The engine is switched off for {business.name}, so this workflow won't start new runs until it's turned on in Settings.</div>
      )}

      {/* Workspace */}
      <div className="mx-8 mb-6 flex h-[max(640px,calc(100vh-196px))] min-h-0 overflow-hidden rounded-b-2xl border border-zinc-200 bg-white">
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-zinc-200 bg-[#fafbfc]">
          <div className="p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" /><Input value={paletteQ} onChange={(e) => setPaletteQ(e.target.value)} placeholder="Search steps" className="h-8 pl-8 text-[12px]" /></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {kinds.map((k) => {
              const items = palette.filter((t) => t.kind === k); if (!items.length) return null;
              return (
                <div key={k} className="mb-5">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: KIND_META[k].color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_META[k].color }} />{KIND_META[k].label}</div>
                  <div className="space-y-1">
                    {items.map((t) => (
                      <div key={t.id} draggable onDragStart={(e) => onDragStart(e, t.id)} title={t.source ? `Source: ${t.source}` : t.hint}
                        className={cn("flex cursor-grab items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-[12px] font-medium text-zinc-800 active:cursor-grabbing hover:border-zinc-300", t.availability === "coming_soon" && "opacity-50", t.availability !== "ready" && t.availability !== "coming_soon" && "opacity-75")}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: KIND_META[k].soft, color: KIND_META[k].color }}>{iconForPalette(t.id, k)}</span>
                        <span className="min-w-0 flex-1 truncate">{t.label}</span>
                        {t.availability === "coming_soon" && <span className="shrink-0 text-[9px] font-semibold uppercase text-zinc-400">Soon</span>}
                        {t.availability === "needs_setup" && <span className="shrink-0 text-[9px] font-semibold uppercase text-amber-600">Setup</span>}
                        {t.availability === "needs_tracking" && <Lock className="h-3 w-3 shrink-0 text-zinc-400" />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div ref={wrap} className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
          <ArrowDefs />
          <ReactFlow
            nodes={viewNodes} edges={viewEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={(c) => { onNodesChange(c); if (c.some((x) => x.type === "position" || x.type === "remove")) setDirty(true); }}
            onEdgesChange={(c) => { onEdgesChange(c); if (c.some((x) => x.type === "remove")) setDirty(true); }}
            onConnect={onConnect}
            onNodeClick={(_, n) => { setSelectedId(n.id); if (drawer !== "simulate") setDrawer(null); }}
            onPaneClick={() => setSelectedId(null)}
            fitView fitViewOptions={{ padding: 0.15, minZoom: 0.5, maxZoom: 0.9 }} minZoom={0.3} maxZoom={1.6}
            defaultEdgeOptions={{ type: "wf", markerEnd: { type: MarkerType.ArrowClosed } }}
            proOptions={{ hideAttribution: true }} deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color="#e3e9f0" />
            <Controls position="bottom-left" showInteractive={false} className="!rounded-lg !border !border-zinc-200 !shadow-sm" />
            <MiniMap pannable zoomable position="bottom-right" className="!h-[90px] !w-[140px] !rounded-lg !border !border-zinc-200" nodeColor={(n) => KIND_META[typeMeta((n.data as WfNode["data"]).typeId).kind].color} />
          </ReactFlow>
          {busy === "open" && <div className="absolute inset-0 grid place-items-center bg-white/60"><Loader2 className="h-6 w-6 animate-spin text-[#06318F]" /></div>}
          {nodes.length === 0 && busy !== "open" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-[13px] text-zinc-500"><div>Drag a trigger from the left to start,<br />or load a template.</div></div>
          )}
        </div>

        <aside className="w-[360px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-white">
          {drawer === "templates" ? <TemplatesDrawer isMedspa={isMedspa} busy={busy?.startsWith("tpl:") ? busy.slice(4) : null} onClose={() => setDrawer(null)} onLoad={loadTemplate} />
            : drawer === "simulate" ? <SimulateDrawer nodes={nodes} result={sim.result} step={sim.step} running={sim.running} error={sim.error} onPick={runSim} onClose={() => { setDrawer(null); setSim({ result: null, step: 0, running: false, error: null }); }} onReplay={() => setSim({ result: null, step: 0, running: false, error: null })} searchMembers={searchMembers} />
            : drawer === "history" ? <HistoryDrawer versions={wf?.versions ?? []} currentVersionId={wf?.current_version_id ?? null} busy={busy === "rollback"} onRestore={rollback} onClose={() => setDrawer(null)} />
            : drawer === "system" ? <SystemDrawer rows={legacy ?? []} loading={legacy === null} onClose={() => setDrawer(null)} />
            : drawer === "runs" ? <RunsDrawer runs={runs ?? []} loading={runs === null} nodes={nodes} path={runPath} onPick={pickRun} onClose={() => setDrawer(null)} />
            : drawer === "settings" ? <SettingsPanel value={summary?.settings ?? DEFAULT_SETTINGS} saving={busy === "settings"} onSave={saveSettings} onClose={() => setDrawer(null)} searchMembers={searchMembers} />
            : selected ? <ConfigPanel node={selected} metrics={metrics[selected.id]} business={business.name} isMedspa={isMedspa} issues={selectedIssues} onChange={updateSelected} onDelete={deleteSelected} onClose={() => setSelectedId(null)} edges={edges} nodes={nodes} />
            : <EmptyPanel validation={issues} />}
        </aside>
      </div>
    </div>
  );
}

