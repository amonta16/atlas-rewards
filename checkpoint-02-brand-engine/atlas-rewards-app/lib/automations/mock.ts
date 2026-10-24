/**
 * lib/automations/mock.ts — CP-216 · in-memory stand-in for the engine RPCs,
 * used only when NEXT_PUBLIC_SUPABASE_URL points at 127.0.0.1 (local harness
 * and screenshots). Production never touches this file.
 */
import type {
  AutomationSettings, Graph, HubSummary, LegacyAutomation, MemberHit, NodeMetrics, PathStep, RunRow, SaveResult, SimResult,
  ValidationItem, WorkflowDetail, WorkflowListRow, WorkflowStatus, Graph as G, NodeTypeId, SuiteGroup, SuiteJourney, SuiteMessage, SuitePatch, SuitePreviewData, NodeConfig,
} from "./types";
import { chainGraph, makeGraphEdge, makeGraphNode, typeMeta, winBackGraph } from "./catalog";
import { autoLayout, validateGraph } from "./graph";

const now = () => new Date().toISOString();
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

const store: { workflows: Map<string, WorkflowDetail & { rows: WorkflowListRow }>; settings: AutomationSettings } = {
  workflows: new Map(),
  settings: { enabled: true, quiet_start: "10:00", quiet_end: "20:00", max_msgs_per_member_per_week: 3, test_membership_ids: [] },
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

/* ───────────── CP-217 · the Med Spa Suite (mirrors wf_install_medspa_suite) ───────────── */

type Step =
  | { k: "trigger"; type: NodeTypeId; label: string; config?: NodeConfig }
  | { k: "wait"; label: string; minutes: number }
  | { k: "goal"; label: string }                       // condition: Yes → End (goal reached), No → continue
  | { k: "msg"; id: string; when: string; m: Omit<SuiteMessage, "node_id" | "when_text"> }
  | { k: "points"; label: string; points: number }
  | { k: "tag"; label: string; tag: string };

const P = (title: string, body: string, cta_path: string | null = null, points: number | null = null): Omit<SuiteMessage, "node_id" | "when_text"> =>
  ({ channel: "push", title, body, subject: null, preheader: null, heading: null, cta_label: null, cta_path, footnote: null, points });
const E = (subject: string, preheader: string, heading: string, body: string, cta_label: string, cta_path: string, footnote: string | null = null, points: number | null = null): Omit<SuiteMessage, "node_id" | "when_text"> =>
  ({ channel: "email", title: null, body, subject, preheader, heading, cta_label, cta_path, footnote, points });

function build(steps: Step[]): { graph: G; messages: SuiteMessage[] } {
  const nodes: G["nodes"] = []; const edges: G["edges"] = []; const messages: SuiteMessage[] = [];
  let prev: { id: string; cond: boolean } | null = null;
  const link = (id: string) => { if (prev) edges.push(makeGraphEdge(prev.id, id, prev.cond ? "no" : null)); };
  for (const st of steps) {
    let n;
    if (st.k === "trigger") n = makeGraphNode(st.type, 0, 0, st.label, st.config ?? {});
    else if (st.k === "wait") n = makeGraphNode("w.wait", 0, 0, st.label, { minutes: st.minutes });
    else if (st.k === "goal") n = makeGraphNode("c.goal" as NodeTypeId, 0, 0, st.label, {});
    else if (st.k === "points") n = makeGraphNode("a.points", 0, 0, st.label, { points: st.points, note: st.label });
    else if (st.k === "tag") n = makeGraphNode("a.tag", 0, 0, st.label, { tag: st.tag });
    else {
      const isPush = st.m.channel === "push";
      n = makeGraphNode(isPush ? "a.push" : "a.email", 0, 0, `${isPush ? "Push" : "Email"} · ${st.when}`, isPush ? { title: st.m.title, body: st.m.body, link_path: st.m.cta_path } : { subject: st.m.subject, body: st.m.body });
      n.id = st.id;
      messages.push({ node_id: st.id, when_text: st.when, ...st.m });
    }
    nodes.push(n); link(n.id);
    if (st.k === "goal") { const g = makeGraphNode("w.exit", 0, 0, "Goal reached · exit"); nodes.push(g); edges.push(makeGraphEdge(n.id, g.id, "yes")); }
    prev = { id: n.id, cond: st.k === "goal" };
  }
  const end = makeGraphNode("w.exit", 0, 0, "End"); nodes.push(end); link(end.id);
  return { graph: autoLayout({ nodes, edges }), messages };
}

type Def = Omit<SuiteJourney, "enabled" | "workflow_id" | "entered_30d" | "sent_30d" | "converted_30d" | "graph" | "messages"> & { steps: Step[]; stats: [number, number, number]; on?: boolean };

const H = 60, D = 1440;
const SUITE_DEFS: Def[] = [
  { key: "ms.welcome", grp: "get_in", name: "New patient welcome", why: "Turns a fresh signup into a first booked visit.",
    research: "The first week is when a new patient is most likely to book. One welcome right away, an explainer the next day, then two nudges that stop the moment they book.",
    trigger_text: "When someone joins the app", timing_text: "Now, then day 1, 3 and 7", channels: ["push", "email"], reward_text: "First-visit bonus", engine: "workflow", stats: [64, 171, 23],
    steps: [
      { k: "trigger", type: "t.signup", label: "Patient joins the app" },
      { k: "msg", id: "welcome_push", when: "Right away", m: P("Welcome to {{business}}", "Hi {{first_name}}, your welcome gift is waiting on Home. Scratch it to see what you got.", "/app") },
      { k: "wait", label: "Wait 1 day", minutes: D },
      { k: "msg", id: "welcome_email", when: "1 day after joining", m: E("How your {{business}} app works", "Points, rewards, the shop and paying over time.", "Welcome, {{first_name}}", "Every visit and purchase earns points you can trade for treatments and products.\n\nBook from the app, shop skincare between visits, and split bigger treatments into 4 interest-free payments with Klarna.", "Open the app", "/app") },
      { k: "wait", label: "Wait 2 days", minutes: 2 * D },
      { k: "goal", label: "Booked yet?" },
      { k: "msg", id: "welcome_book", when: "Day 3, if no booking", m: P("Book your first visit", "{{first_name}}, pick a time that suits you. It takes under a minute.", "/book") },
      { k: "wait", label: "Wait 4 days", minutes: 4 * D },
      { k: "goal", label: "Booked yet?" },
      { k: "msg", id: "welcome_bonus", when: "Day 7, if still no booking", m: E("+{{points}} pts on your first visit", "A little thank-you for coming in.", "Your first visit earns +{{points}} points", "Book your first treatment at {{business}} and we'll add +{{points}} points to your balance after the visit.", "Book now", "/book", "First-visit bonus is added after your visit is checked in.", 150) },
    ] },
  { key: "ms.app_checkin", grp: "get_in", name: "New in the app", why: "Brings quiet patients back when there's something new to see.",
    research: "Content nudges work when they're rare and relevant. Only patients who haven't opened the app in 14+ days, at most twice a month.",
    trigger_text: "When you add a featured item, reward or news post", timing_text: "Once, to patients away 14+ days · max 2/month", channels: ["push"], reward_text: null, engine: "workflow", stats: [212, 188, 41],
    steps: [
      { k: "trigger", type: "t.points", label: "New content published", config: { event: "content.published" } },
      { k: "goal", label: "Opened the app in 14 days?" },
      { k: "msg", id: "checkin_push", when: "When content goes live", m: P("New at {{business}}: {{offer_name}}", "Take a look before it's gone, {{first_name}}.", "/app") },
    ] },
  { key: "ms.cart_recovery", grp: "convert", name: "Finish your order", why: "Recovers checkouts that were started but not paid.",
    research: "For higher-priced items a 3-touch sequence at about 2 hours, 24 hours and 72 hours works best, with the incentive saved for the last touch so earlier buyers pay full price.",
    trigger_text: "When checkout is opened but not paid", timing_text: "2 h, 24 h, 72 h", channels: ["push", "email"], reward_text: "+200 pts, last touch", engine: "workflow", stats: [38, 79, 11],
    steps: [
      { k: "trigger", type: "t.purchase", label: "Checkout started", config: { event: "checkout.started" } },
      { k: "wait", label: "Wait 2 hours", minutes: 2 * H },
      { k: "goal", label: "Paid?" },
      { k: "msg", id: "cart_push1", when: "2 hours after checkout", m: P("Still thinking about {{item}}?", "Your order is saved, {{first_name}}. Pick up right where you left off.", "/app/shop") },
      { k: "wait", label: "Wait 22 hours", minutes: 22 * H },
      { k: "goal", label: "Paid?" },
      { k: "msg", id: "cart_email", when: "24 hours after checkout", m: E("Your {{item}} is still waiting", "Or split it into 4 interest-free payments.", "Ready when you are, {{first_name}}", "You left {{item}} in your order at {{business}}. It's still saved for you.\n\nPrefer to spread it out? Pay in 4 interest-free payments with Klarna at checkout.", "Finish my order", "/app/shop") },
      { k: "wait", label: "Wait 2 days", minutes: 2 * D },
      { k: "goal", label: "Paid?" },
      { k: "msg", id: "cart_push2", when: "72 hours after checkout", m: P("Finish today, get +200 points", "Complete your {{item}} order today and we'll add +200 points.", "/app/shop", 200) },
      { k: "wait", label: "Up to 48 hours", minutes: 48 * H },
      { k: "points", label: "+200 pts if paid", points: 200 },
    ] },
  { key: "ms.browse_reminder", grp: "convert", name: "Viewed but didn't buy", why: "A gentle reminder about a treatment or product they looked at.",
    research: "Browse reminders convert best as a single message within about an hour of leaving, and only if they didn't book or buy in the meantime.",
    trigger_text: "When a patient opens a treatment or product twice", timing_text: "Once, 3 h later · max 1/week", channels: ["push"], reward_text: null, engine: "workflow", stats: [96, 71, 9],
    steps: [
      { k: "trigger", type: "t.purchase", label: "Viewed an item", config: { event: "shop.item_viewed" } },
      { k: "wait", label: "Wait 3 hours", minutes: 3 * H },
      { k: "goal", label: "Booked or bought?" },
      { k: "msg", id: "browse_push", when: "3 hours after viewing", m: P("{{item}} at {{business}}", "Still curious, {{first_name}}? Book it or see the details again.", "/app/shop") },
    ] },
  { key: "ms.membership_promo", grp: "convert", name: "Membership interest", why: "Follows up when someone looks at the membership but doesn't join.",
    research: "Lead with what members get, then show the yearly savings math a few days later. Also nudges non-members after their 2nd visit, when value is clearest.",
    trigger_text: "When a non-member views the membership", timing_text: "Day 1, then day 4", channels: ["push", "email"], reward_text: "+250 pts join bonus", engine: "workflow", stats: [27, 48, 4],
    steps: [
      { k: "trigger", type: "t.tier", label: "Viewed membership", config: { event: "membership.viewed" } },
      { k: "wait", label: "Wait 1 day", minutes: D },
      { k: "goal", label: "Joined?" },
      { k: "msg", id: "member_push", when: "1 day after viewing", m: P("What members get", "Monthly treatment credit, member pricing and priority booking. Join today for +250 points.", "/app/shop?tab=membership", 250) },
      { k: "wait", label: "Wait 3 days", minutes: 3 * D },
      { k: "goal", label: "Joined?" },
      { k: "msg", id: "member_email", when: "4 days after viewing", m: E("Your year as a {{business}} member", "Here's what the membership saves you.", "The math on membership", "Members get a monthly treatment credit, member-only pricing on every service and first pick of appointment times.\n\nMost patients who come in every 6–8 weeks save more than the membership costs in the first few months.", "See membership", "/app/shop?tab=membership", "Join this week and get +250 bonus points.", 250) },
    ] },
  { key: "ms.aftercare", grp: "care", name: "After your treatment", why: "Sends aftercare right after a visit and checks in two days later.",
    research: "Aftercare lands best within 2 hours, while instructions are still fresh. A check-in 24–48 hours later catches questions early.",
    trigger_text: "When a visit is completed", timing_text: "2 h after, then day 2", channels: ["push"], reward_text: null, engine: "workflow", stats: [118, 229, 0],
    steps: [
      { k: "trigger", type: "t.checkin", label: "Visit completed", config: { event: "visit.completed" } },
      { k: "wait", label: "Wait 2 hours", minutes: 2 * H },
      { k: "msg", id: "care_push1", when: "2 hours after the visit", m: P("Aftercare for {{treatment}}", "Hi {{first_name}}, here's how to look after your skin for the next few days.", "/app/care") },
      { k: "wait", label: "Wait 2 days", minutes: 2 * D },
      { k: "msg", id: "care_push2", when: "2 days after the visit", m: P("How are you feeling after {{treatment}}?", "Any questions, just reply in the app. We're here.", "/app/care") },
    ] },
  { key: "ms.review", grp: "care", name: "Google review for points", why: "Asks happy patients for a Google review and rewards them for it.",
    research: "Ask the same day, 2–4 hours after the visit, while the experience is fresh. One reminder 5–7 days later. Never more than 2 asks.",
    trigger_text: "When a visit is completed", timing_text: "3 h after, reminder on day 6", channels: ["push", "email"], reward_text: "Review points", engine: "workflow", stats: [118, 163, 29],
    steps: [
      { k: "trigger", type: "t.checkin", label: "Visit completed", config: { event: "visit.completed" } },
      { k: "wait", label: "Wait 3 hours", minutes: 3 * H },
      { k: "msg", id: "review_push", when: "3 hours after the visit", m: P("Loved your visit? Review us, get +{{points}} pts", "It takes a minute and helps others find {{business}}.", "/app/review", 100) },
      { k: "wait", label: "Wait 6 days", minutes: 6 * D },
      { k: "goal", label: "Reviewed?" },
      { k: "msg", id: "review_email", when: "6 days later, if no review", m: E("A quick favor, {{first_name}}?", "Your review earns you +{{points}} points.", "How was your {{treatment}}?", "If you enjoyed your visit, a short Google review means a lot to a small practice like ours.\n\nWe'll add +{{points}} points once it's verified.", "Leave a review", "/app/review", null, 100) },
    ] },
  { key: "ms.rebook", grp: "care", name: "Time for your next treatment", why: "Reminds patients before a treatment is due, based on what they had.",
    research: "Prompt 1–2 weeks before results fade: neurotoxin ~12 weeks, filler 6–12 months, HydraFacial and peels 4–6 weeks, laser and body 4–8 weeks. Stops the moment they book.",
    trigger_text: "When a treatment is due again", timing_text: "10 days before, on the date, 14 days after", channels: ["push", "email"], reward_text: "+150 pts late rebook", engine: "workflow", stats: [57, 102, 21],
    steps: [
      { k: "trigger", type: "t.booking", label: "Treatment due soon", config: { event: "recall.due" } },
      { k: "msg", id: "rebook_push1", when: "10 days before it's due", m: P("Your {{treatment}} is due soon", "Book now to keep your results going, {{first_name}}.", "/book") },
      { k: "wait", label: "Wait until due date", minutes: 10 * D },
      { k: "goal", label: "Booked?" },
      { k: "msg", id: "rebook_email", when: "On the due date", m: E("Time for your next {{treatment}}", "Keep your results looking their best.", "It's been about {{days_since_last_visit}} days", "Your last {{treatment}} was about {{days_since_last_visit}} days ago, which is right when most patients come back in.\n\nPick a time that works for you.", "Book my visit", "/book") },
      { k: "wait", label: "Wait 14 days", minutes: 14 * D },
      { k: "goal", label: "Booked?" },
      { k: "msg", id: "rebook_push2", when: "14 days after due, if not booked", m: P("Book this week, get +150 pts", "Book your {{treatment}} in the next 7 days and we'll add +150 points.", "/book", 150) },
    ] },
  { key: "ms.appointment_reminder", grp: "care", name: "Appointment reminders", why: "Cuts no-shows and helps rebook missed visits.",
    research: "A reminder 24 hours before and another 2 hours before is the standard for clinics. Missed or cancelled visits get one friendly rebooking nudge the next day.",
    trigger_text: "When a booking is confirmed", timing_text: "24 h and 2 h before", channels: ["push"], reward_text: null, engine: "workflow", stats: [142, 271, 0],
    steps: [
      { k: "trigger", type: "t.booking", label: "Booking confirmed", config: { status: "confirmed" } },
      { k: "msg", id: "appt_24h", when: "24 hours before", m: P("See you tomorrow, {{first_name}}", "Your {{treatment}} at {{business}} is tomorrow. Tap to see the details.", "/app/bookings") },
      { k: "msg", id: "appt_2h", when: "2 hours before", m: P("See you soon", "Your {{treatment}} starts in 2 hours.", "/app/bookings") },
      { k: "msg", id: "appt_missed", when: "1 day after a cancel or no-show", m: P("Let's find you a new time", "No worries, {{first_name}}. Pick a time that suits you better.", "/book") },
    ] },
  { key: "ms.winback", grp: "come_back", name: "We miss you", why: "Wins back patients who haven't visited in 90 days.",
    research: "Three touches around day 90, 105 and 120, with a gift in the middle. After 180 days the patient is tagged lapsed. Members get the same, softer, at 35 days.",
    trigger_text: "When a patient hasn't visited in 90 days", timing_text: "Day 90, 105, 120 · lapsed at 180", channels: ["push", "email"], reward_text: "+200 pt gift", engine: "workflow", stats: [74, 158, 12],
    steps: [
      { k: "trigger", type: "t.inactive", label: "No visit in 90 days", config: { days: 90 } },
      { k: "msg", id: "winback_push1", when: "Day 90", m: P("We miss you, {{first_name}}", "It's been {{days_since_last_visit}} days. Your skin will thank you for a little care.", "/book") },
      { k: "wait", label: "Wait 15 days", minutes: 15 * D },
      { k: "goal", label: "Visited?" },
      { k: "msg", id: "winback_email", when: "Day 105", m: E("A gift to welcome you back", "+200 points are waiting for you.", "Come back to {{business}}", "We've added a little something to your account: +200 points toward your next treatment.\n\nBook any time in the next 2 weeks to use it.", "Book a visit", "/book", "+200 points expire in 14 days.", 200) },
      { k: "wait", label: "Wait 15 days", minutes: 15 * D },
      { k: "goal", label: "Visited?" },
      { k: "msg", id: "winback_push2", when: "Day 120", m: P("Your gift expires Friday", "{{first_name}}, your +200 points are still waiting. Book before Friday.", "/book") },
      { k: "wait", label: "Wait 60 days", minutes: 60 * D },
      { k: "goal", label: "Visited?" },
      { k: "tag", label: "Tag: lapsed", tag: "lapsed" },
    ] },
  { key: "ms.reward_ready", grp: "come_back", name: "Reward unlocked", why: "Tells patients when they can redeem, then reminds them if they don't.",
    research: "The unlock moment is the best time to bring someone back. If it's still unused after 2 weeks, one reminder.",
    trigger_text: "When a balance reaches a reward", timing_text: "Right away, reminder after 14 days", channels: ["push"], reward_text: null, engine: "legacy", stats: [88, 112, 34],
    steps: [
      { k: "trigger", type: "t.points", label: "Balance reaches a reward" },
      { k: "msg", id: "reward_push1", when: "Right away (built-in)", m: P("You unlocked {{offer_name}}", "Nice, {{first_name}}! Show it at the desk on your next visit.", "/app/rewards") },
      { k: "wait", label: "Wait 14 days", minutes: 14 * D },
      { k: "goal", label: "Redeemed?" },
      { k: "msg", id: "reward_push2", when: "14 days later, if unused", m: P("Your {{offer_name}} is waiting", "Use it on your next visit to {{business}}.", "/app/rewards") },
    ] },
  { key: "ms.birthday", grp: "celebrate", name: "Birthday", why: "Birthday points plus a scratch-card gift in their birthday week.",
    research: "Birthday offers are the highest-opened message most clinics send. Delivered the morning of, with a gift they can use that month.",
    trigger_text: "On the patient's birthday", timing_text: "Morning of their birthday", channels: ["push"], reward_text: "Points + gift", engine: "legacy", stats: [9, 9, 3],
    steps: [
      { k: "trigger", type: "t.birthday", label: "Birthday" },
      { k: "points", label: "Birthday points", points: 100 },
      { k: "msg", id: "bday_push", when: "Morning of their birthday", m: P("Happy birthday, {{first_name}}!", "A birthday gift is waiting on your Home. Scratch to reveal it.", "/app") },
    ] },
  { key: "ms.referral", grp: "celebrate", name: "Bring a friend", why: "Asks your happiest patients to refer a friend.",
    research: "Referral asks work best right after a moment of delight, like a verified review or a third visit.",
    trigger_text: "After a verified review or the 3rd visit", timing_text: "Once, the next morning", channels: ["push"], reward_text: "Referral points", engine: "workflow", stats: [22, 22, 3], on: false,
    steps: [
      { k: "trigger", type: "t.checkin", label: "Review verified or 3rd visit" },
      { k: "msg", id: "ref_push", when: "The next morning", m: P("Give a friend $25, get +{{points}} pts", "Share your link. When they visit, you both win.", "/app/refer", 250) },
    ] },
  { key: "ms.points_expiring", grp: "celebrate", name: "Gifts about to expire", why: "A heads-up 48 hours before a gift or reward expires.",
    research: "A single reminder about 2 days before expiry recovers most gifts that would otherwise go unused.",
    trigger_text: "When a gift expires in under 48 hours", timing_text: "Once, 48 h before", channels: ["push"], reward_text: null, engine: "legacy", stats: [17, 17, 6],
    steps: [
      { k: "trigger", type: "t.redeem", label: "Gift expires in 48 hours" },
      { k: "msg", id: "exp_push", when: "48 hours before it expires", m: P("Your gift expires soon", "{{first_name}}, your {{offer_name}} expires in 2 days.", "/app/rewards") },
    ] },
];

type SuiteState = { enabled: boolean; overrides: Record<string, SuitePatch> };
const suiteState = new Map<string, SuiteState>();

function suiteRow(d: Def): SuiteJourney {
  const st = suiteState.get(d.key) ?? { enabled: d.on ?? true, overrides: {} };
  suiteState.set(d.key, st);
  const { graph, messages } = build(d.steps);
  const merged = messages.map((m) => {
    const o = st.overrides[m.node_id] ?? {};
    return { ...m, ...o };
  });
  graph.nodes.forEach((n) => {
    const o = st.overrides[n.id]; if (!o) return;
    if (n.type === "a.push") n.config = { ...n.config, ...(o.title != null ? { title: o.title } : {}), ...(o.body != null ? { body: o.body } : {}) };
    if (n.type === "a.email") n.config = { ...n.config, ...(o.subject != null ? { subject: o.subject } : {}), ...(o.body != null ? { body: o.body } : {}) };
  });
  const { steps: _s, stats, on: _o, ...rest } = d; void _s; void _o;
  return { ...rest, enabled: st.enabled, workflow_id: d.engine === "workflow" ? `wf_${d.key}` : null, entered_30d: st.enabled ? stats[0] : 0, sent_30d: st.enabled ? stats[1] : 0, converted_30d: st.enabled ? stats[2] : 0, graph, messages: merged };
}

const findDef = (key: string) => { const d = SUITE_DEFS.find((x) => x.key === key); if (!d) throw new Error("Unknown journey"); return d; };
export const SUITE_GROUP_ORDER: SuiteGroup[] = ["get_in", "convert", "care", "come_back", "celebrate"];

export const mockSuite = {
  async suite(): Promise<SuiteJourney[]> { return SUITE_DEFS.map(suiteRow); },
  async suiteToggle(key: string, enabled: boolean) { findDef(key); const st = suiteState.get(key) ?? { enabled, overrides: {} }; st.enabled = enabled; suiteState.set(key, st); },
  async suiteUpdate(key: string, nodeId: string, patch: SuitePatch): Promise<SuiteJourney> {
    const d = findDef(key); suiteRow(d); const st = suiteState.get(key)!;
    st.overrides[nodeId] = { ...(st.overrides[nodeId] ?? {}), ...patch };
    return suiteRow(d);
  },
  async suiteReset(key: string) { const d = findDef(key); suiteRow(d); suiteState.get(key)!.overrides = {}; },
  async suitePreview(): Promise<SuitePreviewData> {
    return {
      sample: { first_name: "Jane", points: 340, points_remaining: 160, days_since_last_visit: 84, treatment: "HydraFacial", item: "HydraFacial Signature", offer_name: "$25 off your next facial" },
      brand: { name: "Lotus Aesthetics", logo_url: null, primary: "#2d6a78", hero_url: null },
      sender: { from_name: "Lotus Aesthetics", from_address: "hello@atlas-engine.app", reply_to: "frontdesk@lotusaesthetics.com" },
    };
  },
};
