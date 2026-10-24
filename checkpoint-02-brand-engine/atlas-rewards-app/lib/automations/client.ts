"use client";
/**
 * lib/automations/client.ts — CP-216 · typed wrappers for the Automation Hub
 * RPCs (automation-hub-contract.md). Every call goes through `rpc()` so an
 * unreachable engine surfaces as one EngineError the UI can show, and the
 * local harness (Supabase URL on 127.0.0.1) gets mock data instead.
 */
import { createClient } from "@/lib/supabase/client";
import type {
  AutomationSettings, Graph, HubSummary, LegacyAutomation, MemberHit, NodeMetrics, PathStep, RunRow, SaveResult, SimResult,
  ValidationItem, WorkflowDetail, WorkflowListRow, WorkflowStatus,
} from "./types";
import { mock } from "./mock";

export class EngineError extends Error {
  constructor(message: string, public readonly rpc: string) { super(message); this.name = "EngineError"; }
}

export const isMockHost = () => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) throw new EngineError(friendly(error.message, fn), fn);
  return data as T;
}
function friendly(msg: string, fn: string) {
  if (/does not exist|schema cache|404/i.test(msg)) return `The engine isn't installed yet (${fn} missing). Apply the CP-216 migration.`;
  if (/permission|denied|42501|only agency/i.test(msg)) return "Only agency admins can use the Automation Hub.";
  if (/fetch|network|aborted|timeout/i.test(msg)) return "Couldn't reach the engine. Check your connection and try again.";
  return msg;
}
const first = <T,>(d: T | T[] | null): T | null => (Array.isArray(d) ? d[0] ?? null : d);

export const hub = {
  summary: (businessId: string): Promise<HubSummary> =>
    isMockHost() ? mock.summary() : rpc<HubSummary | HubSummary[]>("wf_hub_summary", { p_business_id: businessId }).then((d) => first(d) as HubSummary),

  legacy: (businessId: string): Promise<LegacyAutomation[]> =>
    isMockHost() ? mock.legacy() : rpc<LegacyAutomation[]>("wf_legacy_automations", { p_business_id: businessId }).then((d) => d ?? []),

  list: (businessId: string): Promise<WorkflowListRow[]> =>
    isMockHost() ? mock.list() : rpc<WorkflowListRow[]>("wf_list", { p_business_id: businessId }).then((d) => d ?? []),

  get: (workflowId: string): Promise<WorkflowDetail> =>
    isMockHost() ? mock.get(workflowId) : rpc<WorkflowDetail | WorkflowDetail[]>("wf_get", { p_workflow_id: workflowId }).then((d) => first(d) as WorkflowDetail),

  saveDraft: (args: { workflowId: string | null; businessId: string; name: string; family: string | null; graph: Graph; notes?: string }): Promise<SaveResult> =>
    isMockHost() ? mock.save(args) : rpc<SaveResult | SaveResult[]>("wf_save_draft", {
      p_workflow_id: args.workflowId, p_business_id: args.businessId, p_name: args.name, p_family: args.family, p_graph: args.graph, p_notes: args.notes ?? null,
    }).then((d) => first(d) as SaveResult),

  validate: (graph: Graph): Promise<ValidationItem[]> =>
    isMockHost() ? mock.validate(graph) : rpc<ValidationItem[]>("wf_validate", { p_graph: graph }).then((d) => d ?? []),

  publish: (workflowId: string, versionId: string, mode: "active" | "testing" = "active"): Promise<void> =>
    isMockHost() ? mock.publish(workflowId) : rpc<unknown>("wf_publish", { p_workflow_id: workflowId, p_version_id: versionId, p_mode: mode }).then(() => undefined),

  setStatus: (workflowId: string, status: WorkflowStatus): Promise<void> =>
    isMockHost() ? mock.setStatus(workflowId, status) : rpc<unknown>("wf_set_status", { p_workflow_id: workflowId, p_status: status }).then(() => undefined),

  rollback: (workflowId: string, versionId: string): Promise<void> =>
    isMockHost() ? mock.rollback(workflowId, versionId) : rpc<unknown>("wf_rollback", { p_workflow_id: workflowId, p_version_id: versionId }).then(() => undefined),

  simulate: (workflowId: string, versionId: string | null, membershipId: string | null, graph: Graph): Promise<SimResult> =>
    isMockHost() ? mock.simulate(graph) : rpc<SimResult | SimResult[]>("wf_simulate", { p_workflow_id: workflowId, p_version_id: versionId, p_membership_id: membershipId }).then((d) => first(d) as SimResult),

  nodeMetrics: (workflowId: string, days = 30): Promise<NodeMetrics[]> =>
    isMockHost() ? mock.metrics(workflowId) : rpc<NodeMetrics[]>("wf_node_metrics", { p_workflow_id: workflowId, p_days: days }).then((d) => d ?? []),

  memberPath: (workflowId: string, membershipId: string): Promise<PathStep[]> =>
    isMockHost() ? mock.path() : rpc<PathStep[]>("wf_member_path", { p_workflow_id: workflowId, p_membership_id: membershipId }).then((d) => d ?? []),

  runs: (workflowId: string, status: string | null = null, limit = 50): Promise<RunRow[]> =>
    isMockHost() ? mock.runs() : rpc<RunRow[]>("wf_runs", { p_workflow_id: workflowId, p_status: status, p_limit: limit }).then((d) => d ?? []),

  setSettings: (businessId: string, settings: AutomationSettings): Promise<void> =>
    isMockHost() ? mock.setSettings(settings) : rpc<unknown>("wf_set_settings", { p_business_id: businessId, p_settings: settings }).then(() => undefined),

  loadTemplate: (businessId: string, key: string): Promise<WorkflowDetail> =>
    isMockHost() ? mock.loadTemplate(key) : rpc<WorkflowDetail | WorkflowDetail[]>("wf_load_template", { p_business_id: businessId, p_template_key: key }).then((d) => first(d) as WorkflowDetail),

  /** Member picker for Test: the hub's 3-arg search_members (admin-only, returns is_demo).
   *  p_limit must always be passed — the 2-arg overload is the staff desk's. */
  searchMembers: async (businessId: string, q: string): Promise<MemberHit[]> => {
    if (isMockHost()) return mock.members(q);
    const { data, error } = await createClient().rpc("search_members", { p_business_id: businessId, p_q: q, p_limit: 20 });
    if (error) throw new EngineError(friendly(error.message, "search_members"), "search_members");
    return ((data ?? []) as MemberHit[]).slice(0, 8);
  },
};
