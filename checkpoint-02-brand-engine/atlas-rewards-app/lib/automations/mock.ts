/**
 * lib/automations/mock.ts — CP-216 · in-memory stand-in for the engine RPCs,
 * used only when NEXT_PUBLIC_SUPABASE_URL points at 127.0.0.1 (local harness
 * and screenshots). Production never touches this file.
 */
import type {
  AutomationSettings, Graph, HubSummary, LegacyAutomation, MemberHit, NodeMetrics, PathStep, RunRow, SaveResult, SimResult,
  ValidationItem, WorkflowDetail, WorkflowListRow, WorkflowStatus,
} from "./types";
import { chainGraph, typeMeta, winBackGraph } from "./catalog";
import { autoLayout, validateGraph } from "./graph";

const now = () => new Date().toISOString();
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

const store: { workflows: Map<string, WorkflowDetail & { rows: WorkflowListRow }>; settings: AutomationSettings } = {
  workflows: new Map(),
  settings: { enabled: true, quiet_start: "20:00", quiet_end: "10:00", max_msgs_per_member_per_week: 3, test_membership_ids: [] },
};

function seed() {
  if (store.workflows.size) return;
  const g = autoLayout(winBackGraph(14));
  const id = "wf_mock_winback";
  store.workflows.set(id, {
    id, business_id: "b", name: "Customer Win-Back", family: "winback", status: "active", reentry_days: 30, current_version_id: "v3", version: 3, graph: g,
    versions: [
      { id: "v3", version: 3, published_at: ago(9), notes: "Shortened the second wait from 7 to 5 days" },
      { id: "v2", version: 2, published_at: ago(23), notes: "Added the At Risk tag step" },
      { id: "v1", version: 1, published_at: ago(31), notes: "Created from “Inactive customer win-back”" },
    ],
    updated_at: ago(9),
    rows: { id, name: "Customer Win-Back", family: "winback", status: "active", version: 3, updated_at: ago(9), enrolled_total: 412, running_now: 102, sent_30d: 543, converted_30d: 97, last_error: null },
  });
  const id2 = "wf_mock_bday";
  const g2 = autoLayout(chainGraph([["t.birthday", "Birthday week"], ["a.unlock", "Birthday gift", { reward_id: "" }], ["a.push", "Happy birthday", { title: "Happy birthday", body: "Happy birthday, {{first_name}}! A gift is on your Home." }], ["w.exit", "End"]]));
  store.workflows.set(id2, {
    id: id2, business_id: "b", name: "Birthday rewards", family: "birthday", status: "draft", reentry_days: 300, current_version_id: null, version: 1, graph: g2,
    versions: [{ id: "v1", version: 1, published_at: null, notes: "Created from “Birthday rewards”" }], updated_at: ago(2),
    rows: { id: id2, name: "Birthday rewards", family: "birthday", status: "draft", version: 1, updated_at: ago(2), enrolled_total: 0, running_now: 0, sent_30d: 0, converted_30d: 0, last_error: null },
  });
}

const METRICS: Record<string, Partial<NodeMetrics>> = {
  "t.inactive": { reached: 412, completed: 412 }, "c.visited": { reached: 412, completed: 412 }, "a.push": { reached: 351, completed: 351, sent: 351, delivered: 347, failed: 4 },
  "w.wait": { reached: 347, completed: 289, waiting: 58 }, "c.redeemed": { reached: 289, completed: 289 }, "a.points": { reached: 97, completed: 97, converted: 97 },
  "a.email": { reached: 192, completed: 192, sent: 192, delivered: 190, failed: 2 }, "a.tag": { reached: 118, completed: 118 }, "w.exit": { reached: 146, completed: 146 },
};

export const mock = {
  async summary(): Promise<HubSummary> {
    seed();
    return { active_workflows: 1, enrolled_30d: 1284, push_sent_30d: 3912, push_delivered_30d: 3869, email_sent_30d: 0, conversions_30d: 214, return_visits_after_msg_30d: 317, engine_enabled: store.settings.enabled, settings: store.settings };
  },
  async legacy(): Promise<LegacyAutomation[]> {
    return [
      { key: "welcome_gift", name: "Welcome gift", kind: "trigger", trigger_text: "Member joins", action_text: "Saved gift or points + notification", channel: "In-app + push", enabled: true, sent_30d: 31, last_fired_at: ago(0.3), controlled_by: "Offers → Automated → Welcome" },
      { key: "birthday_points", name: "Birthday points", kind: "cron", trigger_text: "Birthday (hourly check)", action_text: "Credits point_rules.birthday once a year", channel: "Points + push", enabled: true, sent_30d: 4, last_fired_at: ago(3), controlled_by: "Rewards → point rules" },
      { key: "birthday_offer", name: "Birthday special", kind: "cron", trigger_text: "Birthday (hourly check)", action_text: "Grants the Birthday automated offer", channel: "Gift + push", enabled: false, sent_30d: 0, last_fired_at: null, controlled_by: "Offers → Automated → Birthday" },
      { key: "holiday_offers", name: "Holiday offers", kind: "cron", trigger_text: "Dated occasion window (daily 17:00 UTC)", action_text: "Featured offer to every member", channel: "Offer + push to all", enabled: true, sent_30d: 1, last_fired_at: ago(12), controlled_by: "Offers → Automated → holidays" },
      { key: "comeback", name: "Comeback (14 days)", kind: "cron", trigger_text: "No visit in 14 days (hourly check)", action_text: "Per-member comeback offer", channel: "Gift + push", enabled: true, sent_30d: 38, last_fired_at: ago(0.1), controlled_by: "Offers → Automated → Comeback" },
      { key: "anniversary", name: "Signup anniversary", kind: "cron", trigger_text: "Joined a year ago", action_text: "Anniversary offer", channel: "Gift + push", enabled: false, sent_30d: 0, last_fired_at: null, controlled_by: "Offers → Automated → Anniversary" },
      { key: "reward_unlocked", name: "Reward unlocked", kind: "trigger", trigger_text: "Balance crosses a reward's cost", action_text: "“You unlocked …” notification", channel: "In-app + push", enabled: true, sent_30d: 88, last_fired_at: ago(0.05), controlled_by: "Settings → Notifications" },
      { key: "checkin_available", name: "Check-in available again", kind: "trigger", trigger_text: "12 h after a check-in", action_text: "Queued reminder, 10–20 h local", channel: "Push", enabled: true, sent_30d: 141, last_fired_at: ago(0.02), controlled_by: "Settings → Notifications" },
      { key: "review_request", name: "Review request", kind: "trigger", trigger_text: "Redemption fulfilled, no review yet", action_text: "Ask for a Google review (14-day cooldown)", channel: "Push", enabled: true, sent_30d: 22, last_fired_at: ago(1), controlled_by: "Settings → Notifications" },
      { key: "expiring_gifts", name: "Gift expiring reminder", kind: "cron", trigger_text: "Gift or redemption expires in < 48 h", action_text: "reward_expiration notification", channel: "Push", enabled: true, sent_30d: 17, last_fired_at: ago(0.5), controlled_by: "Settings → Notifications" },
      { key: "streak_milestone", name: "Streak milestone gift", kind: "trigger", trigger_text: "Check-in reaches a milestone", action_text: "Streak gift + notification", channel: "Gift + push", enabled: true, sent_30d: 26, last_fired_at: ago(0.4), controlled_by: "Streaks" },
      { key: "referral_payout", name: "Referral payout", kind: "trigger", trigger_text: "Referred friend's first purchase", action_text: "Points to both members", channel: "Points", enabled: true, sent_30d: 6, last_fired_at: ago(4), controlled_by: "Referrals" },
      { key: "dormancy", name: "Dormancy (60 days)", kind: "cron", trigger_text: "No visit in 60 days (daily)", action_text: "Marks the member dormant", channel: "Status only", enabled: true, sent_30d: 9, last_fired_at: ago(0.7), controlled_by: "System" },
    ];
  },
  async list(): Promise<WorkflowListRow[]> { seed(); return [...store.workflows.values()].map((w) => w.rows); },
  async get(id: string): Promise<WorkflowDetail> {
    seed();
    const w = store.workflows.get(id);
    if (!w) throw new Error("Workflow not found");
    const { rows: _r, ...d } = w; void _r; return structuredClone(d);
  },
  async save(a: { workflowId: string | null; businessId: string; name: string; family: string | null; graph: Graph; notes?: string }): Promise<SaveResult> {
    seed();
    const id = a.workflowId ?? `wf_mock_${Date.now().toString(36)}`;
    const cur = store.workflows.get(id);
    const version = (cur?.versions[0]?.version ?? 0) + 1;
    const vid = `v${version}_${Date.now().toString(36)}`;
    const versions = [{ id: vid, version, published_at: null, notes: a.notes ?? "Draft" }, ...(cur?.versions ?? [])];
    const rows: WorkflowListRow = cur?.rows ?? { id, name: a.name, family: a.family, status: "draft", version, updated_at: now(), enrolled_total: 0, running_now: 0, sent_30d: 0, converted_30d: 0, last_error: null };
    store.workflows.set(id, { ...(cur ?? { id, business_id: a.businessId, status: "draft", reentry_days: 30, current_version_id: null }), name: a.name, family: a.family, graph: a.graph, version, versions, updated_at: now(), rows: { ...rows, name: a.name, version, updated_at: now() } } as WorkflowDetail & { rows: WorkflowListRow });
    return { workflow_id: id, version_id: vid, version, validation: validateGraph(a.graph) };
  },
  async validate(g: Graph): Promise<ValidationItem[]> { return validateGraph(g); },
  async publish(id: string) { const w = store.workflows.get(id); if (!w) return; w.status = "active"; w.rows.status = "active"; w.current_version_id = w.versions[0]?.id ?? null; w.versions[0].published_at = now(); },
  async setStatus(id: string, s: WorkflowStatus) { const w = store.workflows.get(id); if (!w) return; w.status = s; w.rows.status = s; },
  async rollback(id: string, vid: string) { const w = store.workflows.get(id); if (!w) return; w.current_version_id = vid; const v = w.versions.find((x) => x.id === vid); if (v) w.version = v.version; },
  async simulate(g: Graph): Promise<SimResult> {
    const trig = g.nodes.find((n) => typeMeta(n.type).kind === "trigger");
    const path: SimResult["path"] = []; const would: SimResult["would_send"] = [];
    if (!trig) return { path, would_send: would };
    let cur = trig; let guard = 0;
    const member = { daysSince: 21, points: 340, cameBack: false };
    while (cur && guard++ < 60) {
      const k = typeMeta(cur.type).kind;
      if (k === "condition") {
        const yes = cur.type === "c.points" ? (cur.config.op === "lt" ? member.points < Number(cur.config.value) : member.points >= Number(cur.config.value))
          : cur.type === "c.visited" || cur.type === "c.redeemed" ? member.cameBack : cur.type === "c.new_vs_returning" ? cur.config.is !== "new" : false;
        path.push({ node_id: cur.id, result: yes ? "yes" : "no", detail: yes ? "Condition met" : "Condition not met" });
        const e = g.edges.find((e) => e.from === cur.id && e.branch === (yes ? "yes" : "no"));
        if (!e) break; cur = g.nodes.find((n) => n.id === e.to)!; continue;
      }
      if (k === "action") { path.push({ node_id: cur.id, result: "ok", detail: "Would run (test mode, nothing sent)" }); if (cur.type === "a.push" || cur.type === "a.email") would.push({ node_id: cur.id, channel: cur.type === "a.push" ? "push" : "email", title: String(cur.config.title ?? cur.config.subject ?? ""), body: String(cur.config.body ?? "") }); }
      else if (cur.type === "w.exit") { path.push({ node_id: cur.id, result: "ok", detail: "Exits the workflow" }); break; }
      else path.push({ node_id: cur.id, result: k === "timing" ? "waiting" : "ok", detail: k === "timing" ? "Would wait here" : "Enters the workflow" });
      const e = g.edges.find((e) => e.from === cur.id); if (!e) break; cur = g.nodes.find((n) => n.id === e.to)!;
    }
    return { path, would_send: would };
  },
  async metrics(id: string): Promise<NodeMetrics[]> {
    seed(); const w = store.workflows.get(id); if (!w || w.status === "draft") return [];
    return w.graph.nodes.map((n) => ({ node_id: n.id, reached: 0, completed: 0, waiting: 0, sent: 0, delivered: 0, failed: 0, skipped: 0, converted: 0, ...(METRICS[n.type] ?? {}) }));
  },
  async path(): Promise<PathStep[]> {
    seed(); const w = store.workflows.get("wf_mock_winback")!; const ids = w.graph.nodes.map((n) => n.id);
    return [
      { node_id: ids[0], node_type: "t.inactive", result: "ok", detail: { days_since_last_visit: 14 }, at: ago(9) },
      { node_id: ids[1], node_type: "c.visited", result: "no", detail: null, at: ago(9) },
      { node_id: ids[3], node_type: "a.push", result: "ok", detail: { delivered: true }, at: ago(9) },
      { node_id: ids[4], node_type: "w.wait", result: "ok", detail: { minutes: 4320 }, at: ago(6) },
      { node_id: ids[5], node_type: "c.redeemed", result: "yes", detail: { event: "checkin" }, at: ago(6) },
      { node_id: ids[6], node_type: "a.points", result: "ok", detail: { points: 100 }, at: ago(6) },
      { node_id: ids[7], node_type: "w.exit", result: "ok", detail: { exit_reason: "converted" }, at: ago(6) },
    ];
  },
  async runs(): Promise<RunRow[]> {
    seed(); const w = store.workflows.get("wf_mock_winback")!; const ids = w.graph.nodes.map((n) => n.id);
    const names = ["Maya Chen", "Jordan Ruiz", "Priya Patel", "Sam Okafor", "Lena Fischer", "Diego Alvarez", "Aisha Khan", "Noah Bennett"];
    return names.map((nm, i) => ({ id: `run_${i}`, membership_id: `m_${i}`, member_name: nm, status: i % 3 === 0 ? "done" : "waiting", current_node_id: i % 3 === 0 ? ids[7] : ids[4 + (i % 2) * 4], wake_at: i % 3 === 0 ? null : new Date(Date.now() + (i + 1) * 36e5).toISOString(), entered_at: ago(i + 1), exited_at: i % 3 === 0 ? ago(i) : null, exit_reason: i % 3 === 0 ? "converted" : null }));
  },
  async setSettings(s: AutomationSettings) { store.settings = s; },
  async loadTemplate(key: string): Promise<WorkflowDetail> {
    seed();
    const graph = key.includes("winback") ? winBackGraph(key.startsWith("ms") ? 45 : 14)
      : key === "ms.welcome" ? chainGraph([["t.signup", "Patient joins"], ["a.push", "Welcome", { title: "Welcome to {{business}}", body: "Welcome, {{first_name}}! Your gift is waiting on Home." }], ["w.wait", "Wait 2 days", { minutes: 2880 }], ["a.offer", "First-visit incentive", { title: "$25 off your first treatment", body: "Use it on any treatment this month.", expires_days: 14 }], ["w.wait", "Wait 5 days", { minutes: 7200 }], ["c.visited", "Booked or visited?", { within_days: 7 }], ["a.push", "Follow-up", { title: "Ready when you are", body: "Hi {{first_name}}, your $25 is still waiting." }], ["w.exit", "End"]])
      : key === "ms.vip" ? chainGraph([["t.spend", "Lifetime spend ≥ $2,000", { min_cents: 200000 }], ["a.tag", "Tag: VIP", { tag: "VIP" }], ["a.push", "You're a VIP", { title: "You're a VIP", body: "{{first_name}}, you're now a VIP at {{business}}. Priority booking is on." }], ["a.unlock", "Exclusive reward", {}], ["w.exit", "End"]])
      : key === "cl.points_milestone" ? chainGraph([["t.points", "Earns points"], ["c.points", "Within 100 of a reward?", { op: "lt", value: 100 }], ["a.push", "Almost there", { title: "Almost there", body: "Hey {{first_name}}, you're only {{points_remaining}} points away from your next reward!" }], ["w.exit", "End"]])
      : chainGraph([["t.signup", "Customer joins"], ["a.unlock", "Welcome gift", {}], ["w.wait", "Wait 3 days", { minutes: 4320 }], ["c.visited", "Visited?", { within_days: 3 }], ["a.push", "Your gift is waiting", { title: "Your gift is waiting", body: "{{first_name}}, your welcome gift expires soon." }], ["w.exit", "End"]]);
    const name = key.split(".")[1].replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const r = await mock.save({ workflowId: null, businessId: "b", name, family: key.split(".")[1], graph: autoLayout(graph), notes: `Created from template ${key}` });
    return mock.get(r.workflow_id);
  },
  async members(q: string): Promise<MemberHit[]> {
    const all: MemberHit[] = [["Jane Doe", "jane@example.com", 340], ["Maya Chen", "maya@example.com", 120], ["Jordan Ruiz", "jordan@example.com", 860], ["Sam Okafor", "sam@example.com", 40]].map(([n, e, p], i) => ({ membership_id: `m_${i}`, user_id: `u_${i}`, full_name: String(n), email: String(e), points_balance: Number(p) }));
    return all.filter((m) => !q || m.full_name!.toLowerCase().includes(q.toLowerCase()) || m.email!.includes(q.toLowerCase()));
  },
};
