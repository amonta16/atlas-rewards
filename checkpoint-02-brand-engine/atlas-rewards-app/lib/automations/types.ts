/**
 * lib/automations/types.ts — CP-216 · Automation Hub shared types.
 *
 * The graph JSON here is the exact shape stored in workflow_versions.graph
 * (see automation-hub-contract.md). The builder converts to/from React Flow
 * in lib/automations/graph.ts and nowhere else.
 */

export type NodeKind = "trigger" | "condition" | "action" | "timing";

export type NodeTypeId =
  // triggers
  | "t.signup" | "t.checkin" | "t.points" | "t.redeem" | "t.streak_hit" | "t.streak_break" | "t.inactive"
  | "t.booking" | "t.booking_cancel" | "t.purchase" | "t.spend" | "t.birthday" | "t.tier"
  // conditions
  | "c.visited" | "c.points" | "c.new_vs_returning" | "c.opened" | "c.redeemed" | "c.tier" | "c.tagged" | "c.eligible"
  // actions
  | "a.push" | "a.email" | "a.sms" | "a.points" | "a.unlock" | "a.offer" | "a.tag" | "a.notify_admin" | "a.enroll"
  // timing / control
  | "w.wait" | "w.until_date" | "w.until" | "w.exit" | "w.stop_on_convert" | "w.no_reentry" | "w.cap";

/** Per-type config, keys exactly as the contract names them. */
export type NodeConfig = Record<string, string | number | boolean | null | undefined>;

export type GraphNode = { id: string; type: NodeTypeId; label: string; position: { x: number; y: number }; config: NodeConfig };
export type GraphEdge = { id: string; from: string; to: string; branch: "yes" | "no" | null };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type WorkflowStatus = "draft" | "testing" | "active" | "paused" | "archived" | "error";

export type ValidationItem = { node_id: string | null; level: "error" | "warn"; message: string };

export type HubSummary = {
  active_workflows: number;
  enrolled_30d: number;
  push_sent_30d: number;
  push_delivered_30d: number;
  email_sent_30d: number;
  conversions_30d: number;
  return_visits_after_msg_30d: number;
  engine_enabled: boolean;
  settings: AutomationSettings | null;
};

export type AutomationSettings = {
  enabled: boolean;
  quiet_start: string;   // "20:00"
  quiet_end: string;     // "10:00"
  max_msgs_per_member_per_week: number;
  test_membership_ids: string[];
};

export type LegacyAutomation = {
  key: string;
  name: string;
  kind: "trigger" | "cron" | "route";
  trigger_text: string;
  action_text: string;
  channel: string;
  enabled: boolean;
  sent_30d: number;
  last_fired_at: string | null;
  controlled_by: string;
};

export type WorkflowListRow = {
  id: string;
  name: string;
  family: string | null;
  status: WorkflowStatus;
  version: number;
  updated_at: string;
  enrolled_total: number;
  running_now: number;
  sent_30d: number;
  converted_30d: number;
  last_error: string | null;
};

export type WorkflowVersionRow = { id: string; version: number; published_at: string | null; notes: string | null; created_at?: string };

export type WorkflowDetail = {
  id: string;
  business_id: string;
  name: string;
  family: string | null;
  status: WorkflowStatus;
  reentry_days: number | null;
  current_version_id: string | null;
  version: number;
  graph: Graph;
  versions: WorkflowVersionRow[];
  updated_at?: string;
};

export type SaveResult = { workflow_id: string; version_id: string; version: number; validation: ValidationItem[] };

export type SimResult = {
  path: { node_id: string; result: string; detail?: string | Record<string, unknown> | null }[];
  would_send: { node_id: string; channel: string; title?: string; body?: string }[];
};

export type NodeMetrics = {
  node_id: string;
  reached: number;
  completed: number;
  waiting: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  converted: number;
};

export type RunRow = {
  id: string;
  membership_id: string;
  member_name: string | null;
  status: string;
  current_node_id: string | null;
  wake_at: string | null;
  entered_at: string;
  exited_at: string | null;
  exit_reason: string | null;
};

export type PathStep = { node_id: string; node_type: string; result: string; detail: Record<string, unknown> | null; at: string };

export type MemberHit = { membership_id: string; user_id: string; full_name: string | null; email: string | null; points_balance: number };

export type BusinessOption = { id: string; slug: string; name: string; layout_preset: string | null; is_demo: boolean };
