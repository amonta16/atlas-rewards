"use client";
/**
 * Node + edge renderers for the Automation Hub canvas (CP-216).
 */
import { Handle, Position, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type NodeProps, type EdgeProps, type NodeTypes, type EdgeTypes } from "@xyflow/react";
import {
  Zap, GitBranch, Send, Mail, MessageSquare, Coins, Gift, Tag, Bell, Clock, CalendarClock, Hourglass, Square, Flag, ShieldOff, Gauge, AlertTriangle, Lock,
  Sparkles, UserPlus, QrCode, Flame, FlameKindling, UserX, Cake, Crown, ShoppingBag, CalendarX, Trophy, Repeat, CheckCircle2, Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_META, AVAILABILITY_LABEL, typeMeta } from "@/lib/automations/catalog";
import { configSummary, type WfNode, type WfNodeData } from "@/lib/automations/graph";
import type { NodeKind, NodeMetrics, NodeTypeId } from "@/lib/automations/types";

const ICONS: Partial<Record<NodeTypeId, React.ReactNode>> = {
  "t.signup": <UserPlus className="h-4 w-4" />, "t.checkin": <QrCode className="h-4 w-4" />, "t.points": <Coins className="h-4 w-4" />, "t.redeem": <Gift className="h-4 w-4" />,
  "t.streak_hit": <Flame className="h-4 w-4" />, "t.streak_break": <FlameKindling className="h-4 w-4" />, "t.inactive": <UserX className="h-4 w-4" />, "t.booking": <CalendarClock className="h-4 w-4" />,
  "t.booking_cancel": <CalendarX className="h-4 w-4" />, "t.purchase": <ShoppingBag className="h-4 w-4" />, "t.spend": <Trophy className="h-4 w-4" />, "t.birthday": <Cake className="h-4 w-4" />, "t.tier": <Crown className="h-4 w-4" />,
  "c.tagged": <Tags className="h-4 w-4" />,
  "a.push": <Send className="h-4 w-4" />, "a.email": <Mail className="h-4 w-4" />, "a.sms": <MessageSquare className="h-4 w-4" />, "a.points": <Coins className="h-4 w-4" />, "a.unlock": <Gift className="h-4 w-4" />, "a.offer": <Sparkles className="h-4 w-4" />,
  "a.tag": <Tag className="h-4 w-4" />, "a.notify_admin": <Bell className="h-4 w-4" />, "a.enroll": <Repeat className="h-4 w-4" />,
  "w.wait": <Clock className="h-4 w-4" />, "w.until_date": <CalendarClock className="h-4 w-4" />, "w.until": <Hourglass className="h-4 w-4" />,
  "w.exit": <Square className="h-4 w-4" />, "w.stop_on_convert": <Flag className="h-4 w-4" />, "w.no_reentry": <ShieldOff className="h-4 w-4" />, "w.cap": <Gauge className="h-4 w-4" />,
};
export const iconFor = (id: NodeTypeId, kind: NodeKind) => ICONS[id] ?? (kind === "trigger" ? <Zap className="h-4 w-4" /> : kind === "condition" ? <GitBranch className="h-4 w-4" /> : <Send className="h-4 w-4" />);

export type NodeExtra = { invalid?: boolean; warn?: boolean; simState?: "path" | "active" | "yes" | "no"; metrics?: NodeMetrics; dim?: boolean };

export function WfNodeView({ data, selected }: NodeProps<WfNode>) {
  const d = data as WfNodeData & NodeExtra;
  const m = typeMeta(d.typeId);
  const k = KIND_META[m.kind];
  const isCond = m.kind === "condition";
  const isEnd = d.typeId === "w.exit";
  const mt = d.metrics;
  const summary = configSummary(d.typeId, d.config);
  const avail = AVAILABILITY_LABEL[m.availability];
  return (
    <div
      className={cn(
        "relative w-[264px] rounded-xl bg-white ring-1 transition-all",
        selected ? "ring-2 ring-[#06318F] shadow-[0_10px_30px_-12px_rgba(6,49,143,.35)]" : "ring-zinc-200 shadow-[0_6px_20px_-14px_rgba(15,23,42,.3)]",
        d.simState === "path" && "ring-2 ring-emerald-500",
        d.simState === "active" && "ring-[3px] ring-emerald-400 scale-[1.02]",
        d.dim && "opacity-40",
      )}
    >
      <span className="absolute inset-y-3 left-0 w-[3px] rounded-r" style={{ background: k.color }} />
      {m.kind !== "trigger" && <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-zinc-400" />}
      <div className="flex items-start gap-3 px-4 pb-2.5 pt-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: k.soft, color: k.color }}>{iconFor(d.typeId, m.kind)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: k.color }}>{k.singular}</div>
          <div className="truncate text-[13px] font-semibold text-[#14213d]">{d.title}</div>
          {summary && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">{summary}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {d.invalid && <span title="Fix before publishing" className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white"><AlertTriangle className="h-3 w-3" /></span>}
          {!d.invalid && d.warn && <span title="Check this step" className="grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-white"><AlertTriangle className="h-3 w-3" /></span>}
          {avail && <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", m.availability === "coming_soon" ? "bg-zinc-100 text-zinc-500" : "bg-amber-50 text-amber-700")}>{avail}</span>}
        </div>
      </div>
      {mt && !isEnd && (mt.reached > 0 || mt.waiting > 0) && (
        <div className="flex flex-wrap gap-1 border-t border-zinc-100 px-4 py-2">
          <Pill label="reached" v={mt.reached} />
          {mt.waiting > 0 && <Pill label="waiting" v={mt.waiting} tone="violet" />}
          {mt.sent > 0 && <Pill label="sent" v={mt.sent} tone="blue" />}
          {mt.failed > 0 && <Pill label="failed" v={mt.failed} tone="rose" />}
          {mt.skipped > 0 && <Pill label="skipped" v={mt.skipped} tone="amber" />}
          {mt.converted > 0 && <Pill label="converted" v={mt.converted} tone="emerald" />}
        </div>
      )}
      {d.simState === "yes" || d.simState === "no" ? (
        <span className={cn("absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full text-white shadow", d.simState === "yes" ? "bg-emerald-500" : "bg-rose-500")}><CheckCircle2 className="h-3.5 w-3.5" /></span>
      ) : null}
      {isCond ? (
        <>
          <Handle id="yes" type="source" position={Position.Bottom} style={{ left: "30%" }} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-500" />
          <Handle id="no" type="source" position={Position.Bottom} style={{ left: "70%" }} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-rose-500" />
          <span className="pointer-events-none absolute -bottom-4 left-[30%] -translate-x-1/2 text-[9px] font-bold text-emerald-600">YES</span>
          <span className="pointer-events-none absolute -bottom-4 left-[70%] -translate-x-1/2 text-[9px] font-bold text-rose-600">NO</span>
        </>
      ) : !isEnd ? (
        <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-zinc-400" />
      ) : null}
      {m.availability !== "ready" && <span className="absolute -left-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-200"><Lock className="h-3 w-3" /></span>}
    </div>
  );
}

export function Pill({ label, v, tone = "zinc" }: { label: string; v: number; tone?: "zinc" | "violet" | "blue" | "rose" | "emerald" | "amber" }) {
  const t = { zinc: "bg-zinc-100 text-zinc-700", violet: "bg-violet-50 text-violet-700", blue: "bg-[#eaf1fc] text-[#0B5FD6]", rose: "bg-rose-50 text-rose-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" }[tone];
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", t)}><b className="font-semibold">{v.toLocaleString()}</b> {label}</span>;
}

export function WfEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, data, selected }: EdgeProps) {
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, offset: 24 });
  const hot = !!(data as { hot?: boolean } | undefined)?.hot;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={hot ? "url(#wf-arrow-hot)" : "url(#wf-arrow)"} style={{ stroke: hot ? "#10b981" : selected ? "#06318F" : "#a8b0bd", strokeWidth: hot ? 2.5 : 1.6 }} />
      {label && (
        <EdgeLabelRenderer>
          <div className={cn("pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", label === "Yes" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-rose-200")} style={{ left: lx, top: ly }}>{String(label)}</div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const nodeTypes: NodeTypes = { wf: WfNodeView };
export const edgeTypes: EdgeTypes = { wf: WfEdgeView };

export function ArrowDefs() {
  return (
    <svg width="0" height="0" className="absolute">
      <defs>
        <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a8b0bd" /></marker>
        <marker id="wf-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" /></marker>
      </defs>
    </svg>
  );
}
