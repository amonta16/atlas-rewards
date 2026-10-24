/**
 * lib/automations/catalog.ts — CP-216 · node types, variables, template catalog.
 * Pure data, no React. Config keys follow automation-hub-contract.md.
 */
import type { Graph, GraphEdge, GraphNode, NodeConfig, NodeKind, NodeTypeId } from "./types";

export type Availability = "ready" | "needs_setup" | "coming_soon" | "needs_tracking";

export type NodeTypeMeta = {
  id: NodeTypeId;
  kind: NodeKind;
  label: string;
  hint: string;
  availability: Availability;
  /** Where the event / capability comes from. */
  source?: string;
};

export const KIND_META: Record<NodeKind, { label: string; singular: string; color: string; soft: string }> = {
  trigger:   { label: "Triggers",   singular: "Trigger",   color: "#0B5FD6", soft: "#eaf1fc" },
  condition: { label: "Conditions", singular: "Condition", color: "#b45309", soft: "#fbf3e6" },
  action:    { label: "Actions",    singular: "Action",    color: "#047857", soft: "#e8f4ef" },
  timing:    { label: "Timing",     singular: "Timing",    color: "#6d28d9", soft: "#f0ecfa" },
};

export const AVAILABILITY_LABEL: Record<Availability, string | null> = {
  ready: null, needs_setup: "Needs setup", coming_soon: "Coming soon", needs_tracking: "Needs tracking",
};

export const NODE_TYPES: NodeTypeMeta[] = [
  { id: "t.signup", kind: "trigger", label: "Customer signs up", hint: "New membership created", availability: "ready", source: "business_memberships" },
  { id: "t.checkin", kind: "trigger", label: "Customer checks in", hint: "Desk check-in or QR scan", availability: "ready", source: "check_in_events" },
  { id: "t.points", kind: "trigger", label: "Customer earns points", hint: "Any points credit", availability: "ready", source: "points_ledger" },
  { id: "t.redeem", kind: "trigger", label: "Redeems a reward", hint: "Redemption fulfilled", availability: "ready", source: "redemptions" },
  { id: "t.streak_hit", kind: "trigger", label: "Reaches streak milestone", hint: "Streak gift earned", availability: "ready", source: "member_streak_gifts" },
  { id: "t.streak_break", kind: "trigger", label: "Breaks a streak", hint: "Period missed", availability: "ready", source: "nightly evaluator" },
  { id: "t.inactive", kind: "trigger", label: "No visit in X days", hint: "Daily inactivity scan", availability: "ready", source: "nightly evaluator" },
  { id: "t.booking", kind: "trigger", label: "Books an appointment", hint: "Atlas booking created", availability: "ready", source: "bookings" },
  { id: "t.booking_cancel", kind: "trigger", label: "Cancels an appointment", hint: "Atlas booking cancelled", availability: "ready", source: "bookings" },
  { id: "t.purchase", kind: "trigger", label: "Completes a purchase", hint: "Desk purchase or shop order", availability: "ready", source: "events · medspa_shop_orders" },
  { id: "t.spend", kind: "trigger", label: "Reaches spending threshold", hint: "Lifetime spend ≥ $X", availability: "ready", source: "events.amount_cents" },
  { id: "t.birthday", kind: "trigger", label: "Customer's birthday", hint: "Birthday week", availability: "ready", source: "profiles.birthday" },
  { id: "t.tier", kind: "trigger", label: "Enters a new tier", hint: "Tier recalculated", availability: "ready", source: "business_memberships.tier" },

  { id: "c.visited", kind: "condition", label: "Visited within N days?", hint: "Yes / No", availability: "ready" },
  { id: "c.points", kind: "condition", label: "Points balance is…", hint: "at least / under", availability: "ready" },
  { id: "c.new_vs_returning", kind: "condition", label: "New or returning?", hint: "≤ 1 visit = new", availability: "ready" },
  { id: "c.redeemed", kind: "condition", label: "Redeemed within N days?", hint: "Any or a specific reward", availability: "ready" },
  { id: "c.tier", kind: "condition", label: "In loyalty tier?", hint: "Bronze / Silver / Gold", availability: "ready" },
  { id: "c.tagged", kind: "condition", label: "Has tag?", hint: "e.g. VIP, At Risk", availability: "ready" },
  { id: "c.eligible", kind: "condition", label: "Eligible for offer?", hint: "Hasn't received it yet", availability: "ready" },
  { id: "c.opened", kind: "condition", label: "Opened previous email?", hint: "Needs open tracking", availability: "needs_tracking", source: "email provider webhooks" },

  { id: "a.push", kind: "action", label: "Send push notification", hint: "In-app bell + phone push", availability: "ready", source: "notifications" },
  { id: "a.points", kind: "action", label: "Award points", hint: "Credits the balance", availability: "ready", source: "award_points" },
  { id: "a.unlock", kind: "action", label: "Unlock a reward", hint: "Saved gift with a desk code", availability: "ready", source: "customer_saved_offers" },
  { id: "a.offer", kind: "action", label: "Personal offer", hint: "Home banner + optional bonus", availability: "ready", source: "send_winback_v2" },
  { id: "a.tag", kind: "action", label: "Apply customer tag", hint: "Add or remove", availability: "ready", source: "customer_tags" },
  { id: "a.notify_admin", kind: "action", label: "Notify the business", hint: "Manager alert", availability: "ready", source: "notifications · staff" },
  { id: "a.enroll", kind: "action", label: "Add to another workflow", hint: "Or remove from one", availability: "ready", source: "engine" },
  { id: "a.email", kind: "action", label: "Send email", hint: "Branded, with unsubscribe", availability: "ready", source: "email_outbox · Resend" },
  { id: "a.sms", kind: "action", label: "Send SMS", hint: "Not planned yet", availability: "coming_soon" },

  { id: "w.wait", kind: "timing", label: "Wait", hint: "1h · 1d · 7d · custom", availability: "ready" },
  { id: "w.until_date", kind: "timing", label: "Wait until date", hint: "Fixed date", availability: "ready" },
  { id: "w.until", kind: "timing", label: "Wait until condition", hint: "With timeout", availability: "ready" },
  { id: "w.stop_on_convert", kind: "timing", label: "Stop on conversion", hint: "Leaves when goal met", availability: "ready" },
  { id: "w.no_reentry", kind: "timing", label: "Prevent re-entry", hint: "For N days", availability: "ready" },
  { id: "w.cap", kind: "timing", label: "Frequency cap", hint: "Max N messages / week", availability: "ready" },
  { id: "w.exit", kind: "timing", label: "End workflow", hint: "", availability: "ready" },
];

/** Unknown ids (e.g. a newer server-side step) fall back by prefix so they still render sensibly. */
export const typeMeta = (id: NodeTypeId): NodeTypeMeta => NODE_TYPES.find((t) => t.id === id) ?? {
  id, kind: id.startsWith("t.") ? "trigger" : id.startsWith("c.") ? "condition" : id.startsWith("w.") ? "timing" : "action", label: id, hint: "", availability: "needs_setup",
};

export const VARIABLES = ["{{first_name}}", "{{points}}", "{{points_remaining}}", "{{days_since_last_visit}}", "{{offer_name}}", "{{business}}", "{{treatment}}", "{{item}}"];

export type VarSample = Partial<Record<"first_name" | "points" | "points_remaining" | "days_since_last_visit" | "offer_name" | "business" | "treatment" | "item"
  | "price" | "installment" | "member_value" | "bonus" | "friend_bonus" | "due_date" | "appt_time" | "link" | "member", string | number>>;

/** CP-217: sample values for the suite's extra variables, so previews never show "…". */
export const EXTRA_SAMPLE: VarSample = {
  price: "$3,000", installment: "$750", member_value: "$1,800", bonus: "200", friend_bonus: "$25",
  due_date: (() => { const d = new Date(Date.now() + 10 * 864e5); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); })(),
  appt_time: "Thu 2:30 PM", link: "your app", member: "member",
};

/** Render {{vars}} with sample values; `{{x|fallback}}` uses the fallback when x is missing. */
export function renderVars(s: string | null | undefined, vals: VarSample): string {
  return String(s ?? "").replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_, k: string, fb?: string) => {
    const v = vals[k as keyof VarSample] ?? EXTRA_SAMPLE[k as keyof VarSample];
    return v != null && v !== "" ? String(v) : fb?.trim() ?? "…";
  });
}

/** Short human names for variables, used where raw {{tokens}} would overflow (node cards). */
export const VAR_LABEL: Record<string, string> = {
  first_name: "first name", points: "points", points_remaining: "points to go", days_since_last_visit: "days since visit", offer_name: "offer", business: "business", treatment: "treatment", item: "item",
};

/** Sample values for the live preview in the message editor. */
export function previewText(s: string, business: string, isMedspa: boolean) {
  const vals: Record<string, string> = {
    first_name: "Jane", points: "340", points_remaining: "160", days_since_last_visit: "21", offer_name: isMedspa ? "$25 off your next treatment" : "a free upgrade", business, treatment: "HydraFacial", item: "HydraFacial Signature",
  };
  return s.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_, k: string, fb?: string) => vals[k] ?? fb?.trim() ?? "…");
}

/* ───────────── templates (catalog; the definitions live server-side in wf_load_template) ───────────── */

export type TemplateMeta = { key: string; name: string; summary: string; locked?: string };
export type TemplateGroup = { id: "medspa" | "classic" | "ecommerce"; label: string; note: string; templates: TemplateMeta[] };

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    id: "medspa", label: "Med spa", note: "Appointments, treatment cycles, higher-value clients.",
    templates: [
      { key: "ms.welcome", name: "New Client Welcome", summary: "Signup → welcome → first-visit incentive → follow-up" },
      { key: "ms.appointment_reminder", name: "Appointment Reminder", summary: "Booked → reminder → completed → aftercare" },
      { key: "ms.winback", name: "Client Win-Back", summary: "No visit 45 days → reminder → promotion → follow-up" },
      { key: "ms.treatment_followup", name: "Treatment Follow-Up", summary: "Treatment done → follow-up → recall window → rebook" },
      { key: "ms.vip", name: "VIP Client Journey", summary: "Spend threshold → VIP recognition → exclusive reward → retention" },
    ],
  },
  {
    id: "classic", label: "Classic local business", note: "Coffee shops, arcades, restaurants, salons.",
    templates: [
      { key: "cl.welcome", name: "New customer welcome", summary: "Signup → welcome gift → nudge" },
      { key: "cl.first_to_second", name: "First-to-second visit", summary: "First check-in → bring them back within 10 days" },
      { key: "cl.points_milestone", name: "Points milestone", summary: "Close to a reward → tell them" },
      { key: "cl.weekly_visit", name: "Weekly visit encouragement", summary: "Checked in → remind before the week ends" },
      { key: "cl.streak_recovery", name: "Streak recovery", summary: "Streak broken → gentle restart" },
      { key: "cl.birthday", name: "Birthday rewards", summary: "Birthday week → gift → reminder" },
      { key: "cl.winback", name: "Inactive customer win-back", summary: "The 14-day sequence" },
      { key: "cl.referral", name: "Referral incentive", summary: "After a great visit → ask for a referral" },
      { key: "cl.limited_promo", name: "Limited-time promotion", summary: "Eligible → offer → reminder before it ends" },
      { key: "cl.vip", name: "VIP appreciation", summary: "Top tier → thank-you reward" },
    ],
  },
  {
    id: "ecommerce", label: "E-commerce", note: "Needs a connected store with cart and browse events.",
    templates: [
      { key: "ec.cart", name: "Abandoned cart recovery", summary: "Cart left → reminder → offer", locked: "Needs a connected store" },
      { key: "ec.browse", name: "Browsed but didn't purchase", summary: "Viewed product → nudge", locked: "Needs browse events" },
      { key: "ec.post_purchase", name: "Post-purchase follow-up", summary: "Order → thanks → review ask", locked: "Needs a connected store" },
      { key: "ec.repeat", name: "Repeat-purchase reminder", summary: "Replenishment cycle", locked: "Needs a connected store" },
      { key: "ec.upsell", name: "Cross-sell & upsell", summary: "Bought X → suggest Y", locked: "Needs a connected store" },
    ],
  },
];

/* ───────────── graph builders (used by the mock engine and for "new blank") ───────────── */

let seq = 0;
export const newNodeId = () => `n_${Date.now().toString(36)}${(++seq).toString(36)}`;

export function makeGraphNode(type: NodeTypeId, x: number, y: number, label?: string, config: NodeConfig = {}): GraphNode {
  return { id: newNodeId(), type, label: label ?? typeMeta(type).label, position: { x, y }, config };
}
export function makeGraphEdge(from: string, to: string, branch: "yes" | "no" | null = null): GraphEdge {
  return { id: `e_${from}_${to}_${branch ?? "x"}`, from, to, branch };
}

/** The spec's Customer Win-Back example, exactly (§3). */
export function winBackGraph(days = 14): Graph {
  const n1 = makeGraphNode("t.inactive", 0, 0, `No visit in ${days} days`, { days });
  const n2 = makeGraphNode("c.visited", 0, 150, "Already returned?", { within_days: days });
  const e1 = makeGraphNode("w.exit", 320, 300, "End workflow");
  const n3 = makeGraphNode("a.push", 0, 300, "Push: We miss you", { title: "We miss you", body: "We miss you, {{first_name}}! Come back this week for bonus points." });
  const n4 = makeGraphNode("w.wait", 0, 450, "Wait 3 days", { minutes: 3 * 1440 });
  const n5 = makeGraphNode("c.redeemed", 0, 600, "Visited or redeemed?", { within_days: 3 });
  const n6 = makeGraphNode("a.points", -320, 750, "Award bonus points", { points: 100, note: "Win-back bonus" });
  const e2 = makeGraphNode("w.exit", -320, 900, "End workflow");
  const n7 = makeGraphNode("a.email", 0, 750, "Email: personal offer", { subject: "A little something to come back to", body: "We haven't seen you in {{days_since_last_visit}} days. Come back and enjoy {{offer_name}}!" });
  const n8 = makeGraphNode("w.wait", 0, 900, "Wait 5 days", { minutes: 5 * 1440 });
  const n9 = makeGraphNode("c.visited", 0, 1050, "Still inactive?", { within_days: 5 });
  const n10 = makeGraphNode("a.tag", 320, 1200, "Tag: At Risk", { tag: "At Risk" });
  const e3 = makeGraphNode("w.exit", 0, 1350, "End workflow");
  return {
    nodes: [n1, n2, e1, n3, n4, n5, n6, e2, n7, n8, n9, n10, e3],
    edges: [
      makeGraphEdge(n1.id, n2.id), makeGraphEdge(n2.id, e1.id, "yes"), makeGraphEdge(n2.id, n3.id, "no"), makeGraphEdge(n3.id, n4.id), makeGraphEdge(n4.id, n5.id),
      makeGraphEdge(n5.id, n6.id, "yes"), makeGraphEdge(n6.id, e2.id), makeGraphEdge(n5.id, n7.id, "no"), makeGraphEdge(n7.id, n8.id), makeGraphEdge(n8.id, n9.id),
      makeGraphEdge(n9.id, e3.id, "yes"), makeGraphEdge(n9.id, n10.id, "no"), makeGraphEdge(n10.id, e3.id),
    ],
  };
}

/** A straight chain, for the mock templates. */
export function chainGraph(steps: [NodeTypeId, string, NodeConfig?][]): Graph {
  const nodes = steps.map(([t, label, config], i) => makeGraphNode(t, 0, i * 150, label, config ?? {}));
  const edges: GraphEdge[] = [];
  nodes.forEach((n, i) => {
    if (i === 0) return;
    const prev = nodes[i - 1];
    edges.push(makeGraphEdge(prev.id, n.id, typeMeta(prev.type).kind === "condition" ? "no" : null));
  });
  return { nodes, edges };
}
