/**
 * lib/automations/graph.ts — CP-216 · the ONE place the contract graph JSON
 * is converted to/from React Flow, plus layout and the client-side mirror of
 * wf_validate (so the UI can disable Publish before a round-trip).
 */
import type { Edge, Node } from "@xyflow/react";
import type { Graph, GraphEdge, GraphNode, NodeConfig, NodeTypeId, ValidationItem } from "./types";
import { typeMeta, VARIABLES } from "./catalog";

export type WfNodeData = { typeId: NodeTypeId; title: string; config: NodeConfig; [key: string]: unknown };
export type WfNode = Node<WfNodeData, "wf">;
export type WfEdge = Edge;

export function toFlow(g: Graph): { nodes: WfNode[]; edges: WfEdge[] } {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, type: "wf", position: n.position ?? { x: 0, y: 0 }, data: { typeId: n.type, title: n.label, config: n.config ?? {} } })),
    edges: g.edges.map((e) => ({
      id: e.id, source: e.from, target: e.to, type: "wf",
      sourceHandle: e.branch ?? undefined,
      label: e.branch === "yes" ? "Yes" : e.branch === "no" ? "No" : undefined,
    })),
  };
}

export function fromFlow(nodes: WfNode[], edges: WfEdge[]): Graph {
  return {
    nodes: nodes.map<GraphNode>((n) => ({ id: n.id, type: n.data.typeId, label: n.data.title, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, config: n.data.config ?? {} })),
    edges: edges.map<GraphEdge>((e) => ({ id: e.id, from: e.source, to: e.target, branch: e.sourceHandle === "yes" ? "yes" : e.sourceHandle === "no" ? "no" : null })),
  };
}

/** Layered top-down layout; Yes branches left, No branches right. */
export function autoLayout(g: Graph): Graph {
  const depth = new Map<string, number>();
  const incoming = new Map<string, number>();
  g.nodes.forEach((n) => incoming.set(n.id, 0));
  g.edges.forEach((e) => incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1));
  const queue = g.nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  queue.forEach((id) => depth.set(id, 0));
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const id = queue.shift()!;
    for (const e of g.edges.filter((e) => e.from === id)) {
      const d = (depth.get(id) ?? 0) + 1;
      if ((depth.get(e.to) ?? -1) < d && d < 200) { depth.set(e.to, d); queue.push(e.to); }
    }
  }
  const rows = new Map<number, string[]>();
  g.nodes.forEach((n) => { const d = depth.get(n.id) ?? 0; rows.set(d, [...(rows.get(d) ?? []), n.id]); });
  const order = (id: string) => { const e = g.edges.find((e) => e.to === id); return e?.branch === "yes" ? 0 : e?.branch === "no" ? 2 : 1; };
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      const d = depth.get(n.id) ?? 0;
      const row = [...(rows.get(d) ?? [])].sort((a, b) => order(a) - order(b));
      const i = row.indexOf(n.id);
      return { ...n, position: { x: (i - (row.length - 1) / 2) * 320, y: d * 150 } };
    }),
  };
}

const VAR_RE = /\{\{\s*([a-z_]+)\s*(?:\|[^}]*)?\}\}/g;
const KNOWN_VARS = new Set(VARIABLES.map((v) => v.replace(/[{}]/g, "")));

/** Client-side mirror of wf_validate. The server is authoritative. */
export function validateGraph(g: Graph): ValidationItem[] {
  const out: ValidationItem[] = [];
  const triggers = g.nodes.filter((n) => typeMeta(n.type).kind === "trigger");
  if (triggers.length === 0) out.push({ node_id: null, level: "error", message: "Add a trigger to start the workflow." });
  if (triggers.length > 1) out.push({ node_id: triggers[1].id, level: "error", message: "Only one trigger per workflow." });
  const inc = new Map<string, GraphEdge[]>(), outE = new Map<string, GraphEdge[]>();
  g.edges.forEach((e) => { inc.set(e.to, [...(inc.get(e.to) ?? []), e]); outE.set(e.from, [...(outE.get(e.from) ?? []), e]); });
  for (const n of g.nodes) {
    const m = typeMeta(n.type);
    if (m.kind !== "trigger" && !(inc.get(n.id)?.length)) out.push({ node_id: n.id, level: "error", message: `"${n.label}" isn't connected to anything before it.` });
    if (n.type !== "w.exit" && !(outE.get(n.id)?.length)) out.push({ node_id: n.id, level: "error", message: `"${n.label}" has nothing after it.` });
    if (m.kind === "condition") {
      const b = new Set((outE.get(n.id) ?? []).map((e) => e.branch));
      if (!b.has("yes") || !b.has("no")) out.push({ node_id: n.id, level: "error", message: `"${n.label}" needs both a Yes and a No branch.` });
    }
    if (m.availability === "coming_soon") out.push({ node_id: n.id, level: "error", message: `${m.label} is coming soon and can't be published yet.` });
    if (m.availability === "needs_setup") out.push({ node_id: n.id, level: "error", message: `${m.label} needs setup (templates, unsubscribe and consent) before it can be published.` });
    if (m.availability === "needs_tracking") out.push({ node_id: n.id, level: "error", message: `${m.label} needs new tracking before it can run.` });
    for (const k of ["title", "body", "subject"]) {
      const v = n.config?.[k];
      if (typeof v !== "string") continue;
      for (const mm of v.matchAll(VAR_RE)) if (!KNOWN_VARS.has(mm[1])) out.push({ node_id: n.id, level: "error", message: `Unknown variable {{${mm[1]}}} in "${n.label}".` });
    }
    if (n.type === "a.push" && !(n.config?.body as string | undefined)?.trim()) out.push({ node_id: n.id, level: "warn", message: `"${n.label}" has no message yet.` });
    if (n.type === "w.wait" && !(Number(n.config?.minutes) > 0)) out.push({ node_id: n.id, level: "warn", message: `"${n.label}" has no delay set.` });
    if (n.type === "a.points" && !(Number(n.config?.points) > 0)) out.push({ node_id: n.id, level: "warn", message: `"${n.label}" awards 0 points.` });
  }
  // cycle without a wait
  const adj = new Map<string, string[]>();
  g.edges.forEach((e) => adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]));
  const isWait = (id: string) => { const t = g.nodes.find((n) => n.id === id)?.type; return t === "w.wait" || t === "w.until" || t === "w.until_date"; };
  const color = new Map<string, 0 | 1 | 2>();
  const dfs = (id: string, waits: number): boolean => {
    color.set(id, 1);
    for (const nx of adj.get(id) ?? []) {
      const w = waits + (isWait(nx) ? 1 : 0);
      if (color.get(nx) === 1 && w === 0) return true;
      if (!color.get(nx) && dfs(nx, w)) return true;
    }
    color.set(id, 2); return false;
  };
  for (const n of g.nodes) if (!color.get(n.id) && dfs(n.id, isWait(n.id) ? 1 : 0)) { out.push({ node_id: n.id, level: "error", message: "The workflow loops back on itself without a wait." }); break; }
  return out;
}

export const hasErrors = (v: ValidationItem[]) => v.some((x) => x.level === "error");

/** Human summary for the config on a node card. */
export function configSummary(type: NodeTypeId, c: NodeConfig): string | null {
  const n = (k: string) => Number(c[k] ?? 0);
  switch (type) {
    case "t.inactive": return `${n("days") || 14} days without a visit`;
    case "t.spend": return `Lifetime spend ≥ $${(n("min_cents") / 100).toLocaleString()}`;
    case "t.booking": return c.status ? `When a booking is ${c.status}` : null;
    case "c.visited": return `Visited in the last ${n("within_days") || 14} days`;
    case "c.points": return `${c.op === "lt" ? "Under" : "At least"} ${n("value")} points`;
    case "c.redeemed": return `Redeemed in the last ${n("within_days") || 7} days`;
    case "c.tier": return c.tier ? `In tier "${c.tier}"` : null;
    case "c.tagged": return c.tag ? `Has tag "${c.tag}"` : null;
    case "c.new_vs_returning": return c.is === "returning" ? "Returning customer" : "New customer";
    case "a.push": return (c.body as string) || null;
    case "a.email": return (c.subject as string) || (c.body as string) || null;
    case "a.points": return `+${n("points")} points`;
    case "a.tag": return c.tag ? `${c.remove ? "Remove" : "Add"} tag "${c.tag}"` : null;
    case "a.offer": return (c.title as string) || null;
    case "a.notify_admin": return (c.title as string) || null;
    case "w.wait": return humanMinutes(n("minutes"));
    case "w.until": return `Up to ${humanMinutes(n("timeout_minutes"))}`;
    case "w.no_reentry": return `No re-entry for ${n("days") || 30} days`;
    case "w.cap": return `Max ${n("per_week") || 3} messages / week`;
    case "w.stop_on_convert": return c.goal ? `Goal: ${c.goal}` : null;
    default: return null;
  }
}

export function humanMinutes(m: number): string {
  if (!m) return "No delay set";
  if (m % 1440 === 0) { const d = m / 1440; return `${d} day${d === 1 ? "" : "s"}`; }
  if (m % 60 === 0) { const h = m / 60; return `${h} hour${h === 1 ? "" : "s"}`; }
  return `${m} min`;
}
