/**
 * Front desk data layer (browser side).
 *
 * Every action calls the SAME database functions the venue manager portal
 * and the patient app use (award_points, quick_award, desk_redeem_reward,
 * fulfill_redemption, fulfill_saved_offer, medspa_treatment_log, …), so the
 * desk, the patient app and the old portal always agree. Nothing here keeps
 * its own copy of patient data.
 *
 * The /demo clinic gets an in-memory version with sample patients, so the
 * desk can be demoed (and screenshotted) without a database.
 */
import { createClient } from "@atlas/core/supabase/client";

export type DeskMember = {
  membership_id: string; user_id: string; full_name: string | null; email: string | null; phone: string | null;
  points_balance: number; tier: string | null; joined_at: string | null; visit_count: number | null;
};
export type DeskVoucher = {
  redemption_id: string; membership_id: string; reward_name: string; point_cost: number; status: string; code: string;
  member_name: string | null; expires_at: string | null; fulfilled_at: string | null;
};
export type DeskGift = {
  saved_id: string; membership_id: string; full_name: string | null; title: string; description: string | null;
  gift_reward_name: string | null; redeem_code: string | null; expires_at: string | null; fulfilled_at: string | null;
};
export type LookupResult =
  | { kind: "members"; members: DeskMember[] }
  | { kind: "voucher"; voucher: DeskVoucher }
  | { kind: "gift"; gift: DeskGift }
  | { kind: "none"; message: string };

export type StoreRow = { kind: "reward" | "pending" | "gift"; id: string; name: string; description: string | null; image_url: string | null; point_cost: number; affordable: boolean; code: string | null; expires_at: string | null };
export type LedgerRow = { delta: number; rule_type: string; notes: string | null; created_at: string };
export type VipStatus = { is_member: boolean; plan_label: string | null; member_since: string | null; payment_status: string | null } | null;
export type PackageRow = { id: string; item_name: string; treatment_id: string | null; sessions_total: number; sessions_used: number };
export type TreatmentRow = { id: string; treatment_name: string; provider_name: string | null; performed_at: string; notes: string | null };
export type PatientDetail = {
  points: number; visits: number; lastVisit: string | null; joined: string | null; lifetime: number;
  vip: VipStatus; store: StoreRow[]; ledger: LedgerRow[]; packages: PackageRow[]; treatments: TreatmentRow[];
};
export type DueRow = { membership_id: string; full_name: string | null; phone: string | null; points_balance: number; treatment_name: string; performed_at: string; due_at: string; has_upcoming_booking: boolean; visit_count: number | null; user_id: string; email: string | null; tier: string | null; joined_at: string | null };
export type OrderRow = { id: string; user_id: string; full_name: string | null; phone: string | null; item_name: string; kind: string; quantity: number; amount_cents: number; status: string; pay_method: string; sessions_total: number | null; sessions_used: number; gift_code: string | null; recipient_name: string | null; created_at: string };
export type ActivityRow = { id: string; delta: number; rule_type: string; notes: string | null; created_at: string; customer_name: string | null };
export type Treatment = { id: string; name: string; recall_weeks: number | null };
export type Provider = { id: string; name: string; treatment_ids: string[] };

export interface DeskApi {
  lookup(q: string): Promise<LookupResult>;
  patient(m: DeskMember): Promise<PatientDetail>;
  checkIn(m: DeskMember): Promise<{ awarded: number; balance: number }>;
  purchase(m: DeskMember, dollars: number): Promise<{ awarded: number; balance: number }>;
  removePoints(m: DeskMember, amount: number, note: string): Promise<{ balance: number }>;
  undoLast(m: DeskMember): Promise<{ undone: number }>;
  redeem(m: DeskMember, rewardId: string): Promise<{ balance: number }>;
  handOver(row: { kind: "pending" | "gift" | "voucher"; id: string }): Promise<void>;
  logTreatment(m: DeskMember, t: Treatment, provider: Provider | null, notes: string, packageId: string | null): Promise<void>;
  due(): Promise<DueRow[]>;
  orders(): Promise<OrderRow[]>;
  updateOrder(id: string, status: "paid" | "fulfilled" | "cancelled"): Promise<void>;
  activity(): Promise<ActivityRow[]>;
}

const first = <T,>(d: unknown): T | null => ((Array.isArray(d) ? d[0] : d) ?? null) as T | null;
const fail = (e: { message?: string } | null) => { if (e) throw new Error(e.message ?? "Something went wrong"); };

/* ───────────── live: the real database ───────────── */

export function liveDeskApi(businessId: string, slug: string, purchasePerDollar: number): DeskApi {
  const sb = () => createClient();
  const awardEvent = (m: DeskMember, oldBalance: number, newBalance: number) => {
    if (newBalance <= oldBalance) return;
    // "Reward unlocked" push: sent by the venue app's engine (it holds the push keys).
    fetch(`/api/${slug}/desk/award-event`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ business_id: businessId, membership_id: m.membership_id, old_balance: oldBalance, new_balance: newBalance }) }).catch(() => {});
  };

  return {
    async lookup(raw) {
      const q = raw.trim();
      if (!q) return { kind: "none", message: "Type a phone number, name or code." };
      const s = sb();
      const digits = q.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length === q.replace(/[\s()+\-.]/g, "").length) {
        const { data, error } = await s.rpc("resolve_member_by_phone", { p_phone: digits.slice(-10), p_business_id: businessId });
        fail(error);
        const members = (data ?? []) as DeskMember[];
        return members.length ? { kind: "members", members } : { kind: "none", message: `No patient with ${q} at this clinic.` };
      }
      // One word, 4-10 letters/digits: try it as a patient code, reward voucher or gift code before a name search.
      if (/^[A-Za-z0-9-]{4,10}$/.test(q)) {
        const code = q.replace(/-/g, "");
        const [{ data: m }, { data: r }, { data: g }] = await Promise.all([
          s.rpc("resolve_member_by_code", { p_code: code, p_business_id: businessId }),
          s.rpc("resolve_redemption_by_code", { p_code: code.toUpperCase(), p_business_id: businessId }),
          s.rpc("resolve_saved_offer_by_code", { p_code: code.toUpperCase(), p_business_id: businessId }),
        ]);
        if (Array.isArray(m) && m.length) return { kind: "members", members: m as DeskMember[] };
        const v = first<DeskVoucher>(r); if (v) return { kind: "voucher", voucher: v };
        const gf = first<DeskGift>(g); if (gf) return { kind: "gift", gift: gf };
      }
      const { data, error } = await s.rpc("search_members", { p_business_id: businessId, p_q: q });
      fail(error);
      const members = ((data ?? []) as DeskMember[]).slice(0, 25);
      return members.length ? { kind: "members", members } : { kind: "none", message: `Nothing found for "${q}".` };
    },

    async patient(m) {
      const s = sb();
      const [h, vip, store, pk, tr] = await Promise.all([
        s.rpc("member_history_for_staff", { p_business_id: businessId, p_membership_id: m.membership_id }),
        s.rpc("member_vip_status", { p_membership_id: m.membership_id }),
        s.rpc("desk_member_store", { p_membership_id: m.membership_id }),
        s.from("medspa_shop_orders").select("id,item_name,treatment_id,sessions_total,sessions_used")
          .eq("business_id", businessId).eq("user_id", m.user_id).eq("kind", "package").eq("status", "paid"),
        s.from("medspa_treatment_log").select("id,treatment_name,provider_name,performed_at,notes")
          .eq("business_id", businessId).eq("user_id", m.user_id).order("performed_at", { ascending: false }).limit(8),
      ]);
      const hist = first<{ points_balance: number; visit_count: number; last_visit_at: string | null; joined_at: string | null; lifetime_points_earned: number; ledger: LedgerRow[] | null }>(h.data);
      return {
        points: hist?.points_balance ?? m.points_balance, visits: hist?.visit_count ?? m.visit_count ?? 0,
        lastVisit: hist?.last_visit_at ?? null, joined: hist?.joined_at ?? m.joined_at, lifetime: hist?.lifetime_points_earned ?? 0,
        vip: first<NonNullable<VipStatus>>(vip.data),
        store: (store.data ?? []) as StoreRow[],
        ledger: (hist?.ledger ?? []).slice(0, 15),
        packages: ((pk.data ?? []) as PackageRow[]).filter((o) => (o.sessions_total ?? 0) > o.sessions_used),
        treatments: (tr.data ?? []) as TreatmentRow[],
      };
    },

    async checkIn(m) {
      const { data, error } = await sb().rpc("quick_award", { p_membership_id: m.membership_id, p_rule_key: "visit", p_notes: null });
      fail(error);
      const r = first<{ points_awarded: number; new_balance: number }>(data);
      const out = { awarded: r?.points_awarded ?? 0, balance: r?.new_balance ?? m.points_balance };
      awardEvent(m, m.points_balance, out.balance);
      return out;
    },

    async purchase(m, dollars) {
      const pts = Math.floor(dollars * purchasePerDollar);
      const s = sb();
      const { data, error } = await s.rpc("award_points", {
        p_membership_id: m.membership_id, p_delta: pts, p_rule_type: "purchase", p_reference_id: null,
        p_idempotency_key: `purchase_${m.membership_id}_${Date.now()}`, p_notes: `$${dollars.toFixed(2)} purchase`,
      });
      fail(error);
      await s.from("events").insert({ business_id: businessId, membership_id: m.membership_id, event_type: "purchase",
        payload: { amount_cents: Math.round(dollars * 100), source: "desk" }, source: "manual", amount_cents: Math.round(dollars * 100) });
      const balance = first<{ new_balance: number }>(data)?.new_balance ?? m.points_balance + pts;
      awardEvent(m, m.points_balance, balance);
      return { awarded: pts, balance };
    },

    async removePoints(m, amount, note) {
      const spend = purchasePerDollar > 0 ? Math.round((amount / purchasePerDollar) * 100) : null;
      const { data, error } = await sb().rpc("manager_remove_points", { p_membership_id: m.membership_id, p_amount: amount, p_notes: note || null, p_spend_correction_cents: spend });
      fail(error);
      return { balance: first<{ new_balance: number }>(data)?.new_balance ?? Math.max(0, m.points_balance - amount) };
    },

    async undoLast(m) {
      const { data, error } = await sb().rpc("reverse_last_award", { p_business_id: businessId, p_membership_id: m.membership_id, p_within_seconds: 120 });
      fail(error);
      return { undone: Math.abs(first<{ delta: number }>(data)?.delta ?? 0) };
    },

    async redeem(m, rewardId) {
      const { data, error } = await sb().rpc("desk_redeem_reward", { p_membership_id: m.membership_id, p_reward_id: rewardId });
      fail(error);
      return { balance: first<{ new_balance: number }>(data)?.new_balance ?? m.points_balance };
    },

    async handOver(row) {
      const { error } = row.kind === "gift"
        ? await sb().rpc("fulfill_saved_offer", { p_saved_id: row.id })
        : await sb().rpc("fulfill_redemption", { p_redemption_id: row.id });
      fail(error);
    },

    async logTreatment(m, t, provider, notes, packageId) {
      const s = sb();
      const { error } = await s.from("medspa_treatment_log").insert({
        business_id: businessId, user_id: m.user_id, treatment_id: t.id, treatment_name: t.name,
        provider_id: provider?.id ?? null, provider_name: provider?.name ?? null, recall_weeks: t.recall_weeks,
        notes: notes.trim() || null, credit_used_cents: 0,
      });
      fail(error);
      if (packageId) {
        const { data: o } = await s.from("medspa_shop_orders").select("sessions_total,sessions_used").eq("id", packageId).maybeSingle();
        const row = o as { sessions_total: number; sessions_used: number } | null;
        if (row) {
          const used = row.sessions_used + 1;
          await s.from("medspa_shop_orders").update({ sessions_used: used, ...(used >= row.sessions_total ? { status: "fulfilled", fulfilled_at: new Date().toISOString() } : {}) }).eq("id", packageId);
        }
      }
    },

    async due() {
      const { data, error } = await sb().rpc("medspa_due_patients", { p_business_id: businessId });
      fail(error);
      return (data ?? []) as DueRow[];
    },
    async orders() {
      const { data, error } = await sb().rpc("medspa_shop_orders_desk", { p_business_id: businessId });
      fail(error);
      return ((data ?? []) as OrderRow[]).filter((o) => o.status !== "pending");
    },
    async updateOrder(id, status) {
      const patch = status === "paid" ? { status, paid_at: new Date().toISOString() } : status === "fulfilled" ? { status, fulfilled_at: new Date().toISOString() } : { status };
      const { error } = await sb().from("medspa_shop_orders").update(patch).eq("id", id);
      fail(error);
    },
    async activity() {
      const { data, error } = await sb().rpc("business_recent_activity", { p_business_id: businessId, p_limit: 30 });
      fail(error);
      return (data ?? []) as ActivityRow[];
    },
  };
}

/* ───────────── demo: sample clinic, in memory ───────────── */

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

export function demoDeskApi(rewards: { id: string; name: string; point_cost: number; image_url: string | null; description: string | null }[], treatments: Treatment[]): DeskApi {
  const people: DeskMember[] = [
    ["Sofia Martinez", "8055550123", 420, 9], ["Emma Chen", "8055550188", 180, 3], ["Olivia Brooks", "8055550142", 960, 14],
    ["Ava Patel", "8055550177", 60, 1], ["Mia Johnson", "8055550111", 240, 5], ["Isabella Nguyen", "8055550166", 1210, 21],
  ].map(([n, p, pts, v], i) => ({ membership_id: `m${i}`, user_id: `u${i}`, full_name: n as string, email: null, phone: p as string,
    points_balance: pts as number, tier: null, joined_at: ago(200 - i * 25), visit_count: v as number }));
  const ledgers = new Map<string, LedgerRow[]>(people.map((m) => [m.membership_id, [
    { delta: 50, rule_type: "visit", notes: null, created_at: ago(12) }, { delta: 180, rule_type: "purchase", notes: "$180.00 purchase", created_at: ago(12) },
  ]]));
  const tlog = new Map<string, TreatmentRow[]>([["m0", [{ id: "t0", treatment_name: treatments[0]?.name ?? "Neurotoxin", provider_name: "Dr. Jane Preview", performed_at: ago(84), notes: null }]]]);
  const packages = new Map<string, PackageRow[]>([["m0", [{ id: "o1", item_name: "HydraFacial, 3 sessions", treatment_id: null, sessions_total: 3, sessions_used: 1 }]]]);
  const vouchers: DeskVoucher[] = [{ redemption_id: "r1", membership_id: "m2", reward_name: rewards[1]?.name ?? "15-min trial session", point_cost: rewards[1]?.point_cost ?? 180, status: "pending", code: "QGSB6K", member_name: "Olivia Brooks", expires_at: ahead(20), fulfilled_at: null }];
  const gifts: DeskGift[] = [{ saved_id: "g1", membership_id: "m1", full_name: "Emma Chen", title: "Welcome gift", description: "Our thank-you for joining.", gift_reward_name: "$25 off your first purchase", redeem_code: "WELC25X", expires_at: ahead(6), fulfilled_at: null }];
  let orders: OrderRow[] = [
    { id: "o2", user_id: "u4", full_name: "Mia Johnson", phone: "8055550111", item_name: "SkinCeuticals C E Ferulic®", kind: "product", quantity: 1, amount_cents: 18200, status: "reserved", pay_method: "in_person", sessions_total: null, sessions_used: 0, gift_code: null, recipient_name: null, created_at: ago(1) },
    { id: "o3", user_id: "u5", full_name: "Isabella Nguyen", phone: "8055550166", item_name: "Gift card · $100", kind: "gift_card", quantity: 1, amount_cents: 10000, status: "paid", pay_method: "stripe", sessions_total: null, sessions_used: 0, gift_code: "PFP3-RBKU", recipient_name: "Mom", created_at: ago(2) },
    { id: "o1", user_id: "u0", full_name: "Sofia Martinez", phone: "8055550123", item_name: "HydraFacial, 3 sessions", kind: "package", quantity: 1, amount_cents: 75000, status: "paid", pay_method: "stripe", sessions_total: 3, sessions_used: 1, gift_code: null, recipient_name: null, created_at: ago(30) },
  ];
  const act: ActivityRow[] = [
    { id: "a1", delta: 50, rule_type: "visit", notes: null, created_at: ago(0.05), customer_name: "Sofia Martinez" },
    { id: "a2", delta: 182, rule_type: "purchase", notes: "$182.00 purchase", created_at: ago(0.2), customer_name: "Mia Johnson" },
    { id: "a3", delta: -180, rule_type: "redemption", notes: rewards[1]?.name ?? null, created_at: ago(1), customer_name: "Olivia Brooks" },
  ];
  const wait = () => new Promise((r) => setTimeout(r, 180));
  const byId = (id: string) => people.find((p) => p.membership_id === id)!;
  const log = (m: DeskMember, delta: number, rule_type: string, notes: string | null) => {
    m.points_balance = Math.max(0, m.points_balance + delta);
    ledgers.get(m.membership_id)!.unshift({ delta, rule_type, notes, created_at: new Date().toISOString() });
    act.unshift({ id: `a${Date.now()}`, delta, rule_type, notes, created_at: new Date().toISOString(), customer_name: m.full_name });
  };

  return {
    async lookup(raw) {
      await wait();
      const q = raw.trim().toLowerCase(); const digits = q.replace(/\D/g, "");
      if (!q) return { kind: "none", message: "Type a phone number, name or code." };
      const v = vouchers.find((x) => x.code.toLowerCase() === q); if (v) return { kind: "voucher", voucher: { ...v } };
      const g = gifts.find((x) => (x.redeem_code ?? "").toLowerCase() === q); if (g) return { kind: "gift", gift: { ...g } };
      const members = people.filter((p) => (digits.length >= 4 && (p.phone ?? "").endsWith(digits)) || (p.full_name ?? "").toLowerCase().includes(q));
      return members.length ? { kind: "members", members: members.map((m) => ({ ...m })) } : { kind: "none", message: `Nothing found for "${raw.trim()}". Try Sofia, Emma or 0142.` };
    },
    async patient(m) {
      await wait();
      const p = byId(m.membership_id);
      const pend: StoreRow[] = [
        ...vouchers.filter((v) => v.membership_id === p.membership_id && !v.fulfilled_at).map((v) => ({ kind: "pending" as const, id: v.redemption_id, name: v.reward_name, description: null, image_url: null, point_cost: 0, affordable: true, code: v.code, expires_at: v.expires_at })),
        ...gifts.filter((g) => g.membership_id === p.membership_id && !g.fulfilled_at).map((g) => ({ kind: "gift" as const, id: g.saved_id, name: g.gift_reward_name ?? g.title, description: g.title, image_url: null, point_cost: 0, affordable: true, code: g.redeem_code, expires_at: g.expires_at })),
      ];
      return {
        points: p.points_balance, visits: p.visit_count ?? 0, lastVisit: ago(12), joined: p.joined_at, lifetime: p.points_balance + 300,
        vip: p.membership_id === "m2" ? { is_member: true, plan_label: "Glow Club", member_since: ago(90), payment_status: "paid" } : null,
        store: [...pend, ...rewards.map((r) => ({ kind: "reward" as const, id: r.id, name: r.name, description: r.description, image_url: r.image_url, point_cost: r.point_cost, affordable: p.points_balance >= r.point_cost, code: null, expires_at: null }))],
        ledger: [...(ledgers.get(p.membership_id) ?? [])], packages: [...(packages.get(p.membership_id) ?? [])], treatments: [...(tlog.get(p.membership_id) ?? [])],
      };
    },
    async checkIn(m) { await wait(); const p = byId(m.membership_id); log(p, 50, "visit", null); p.visit_count = (p.visit_count ?? 0) + 1; return { awarded: 50, balance: p.points_balance }; },
    async purchase(m, dollars) { await wait(); const p = byId(m.membership_id); const pts = Math.floor(dollars); log(p, pts, "purchase", `$${dollars.toFixed(2)} purchase`); return { awarded: pts, balance: p.points_balance }; },
    async removePoints(m, amount, note) { await wait(); const p = byId(m.membership_id); log(p, -Math.min(amount, p.points_balance), "manual_adjust", note || null); return { balance: p.points_balance }; },
    async undoLast(m) { await wait(); const p = byId(m.membership_id); const l = ledgers.get(p.membership_id)![0]; if (!l || l.delta <= 0) return { undone: 0 }; log(p, -l.delta, "reversal", "Undo"); return { undone: l.delta }; },
    async redeem(m, rewardId) { await wait(); const p = byId(m.membership_id); const r = rewards.find((x) => x.id === rewardId)!; if (p.points_balance < r.point_cost) throw new Error("Not enough points."); log(p, -r.point_cost, "redemption", r.name); return { balance: p.points_balance }; },
    async handOver(row) { await wait(); const v = vouchers.find((x) => x.redemption_id === row.id); if (v) v.fulfilled_at = new Date().toISOString(); const g = gifts.find((x) => x.saved_id === row.id); if (g) g.fulfilled_at = new Date().toISOString(); },
    async logTreatment(m, t, provider, notes, packageId) {
      await wait();
      const list = tlog.get(m.membership_id) ?? []; list.unshift({ id: `t${Date.now()}`, treatment_name: t.name, provider_name: provider?.name ?? null, performed_at: new Date().toISOString(), notes: notes || null }); tlog.set(m.membership_id, list);
      if (packageId) { const pk = packages.get(m.membership_id)?.find((o) => o.id === packageId); if (pk) pk.sessions_used += 1; const o = orders.find((x) => x.id === packageId); if (o) o.sessions_used += 1; }
    },
    async due() {
      await wait();
      return [
        { ...people[0], treatment_name: treatments[0]?.name ?? "Neurotoxin", performed_at: ago(84), due_at: ago(0), has_upcoming_booking: false },
        { ...people[3], treatment_name: "HydraFacial", performed_at: ago(30), due_at: ahead(2), has_upcoming_booking: false },
        { ...people[5], treatment_name: "Lip filler", performed_at: ago(180), due_at: ago(10), has_upcoming_booking: true },
      ] as DueRow[];
    },
    async orders() { await wait(); return orders.map((o) => ({ ...o })); },
    async updateOrder(id, status) { await wait(); orders = orders.map((o) => (o.id === id ? { ...o, status } : o)); },
    async activity() { await wait(); return act.map((a) => ({ ...a })); },
  };
}
