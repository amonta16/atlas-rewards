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
import { demoScansKey, type ConcernId, type SavedScan } from "./skin-scan";
import { createClient } from "@atlas/core/supabase/client";
import type { MonthlyReport } from "@atlas/core/reports/monthly";

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
export type PendingReview = { id: string; member_name: string | null; member_email: string | null; submitted_at: string; platform?: string | null; verification_data?: { review_link?: string } | null };
export type PendingMember = { membership_id: string; full_name: string | null; email: string | null; phone: string | null; requested_at: string; pending_plan?: { kind: string; label?: string; price_cents?: number } | null };
export type PayoutStatus = { connected: boolean; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean } | null;
export type Treatment = { id: string; name: string; recall_weeks: number | null };
export type Provider = { id: string; name: string; treatment_ids: string[] };

export type Overview = {
  patients: number; members_paid: number; visits_total: number; visits_30d: number;
  sales_cents_total: number; sales_cents_30d: number; auto_offers_active: number;
  monthly: { month: string; visits: number; sales_cents: number; joins: number }[];
  activity: { at: string; kind: "signup" | "treatment" | "order"; who: string; detail: string | null; amount_cents: number | null }[];
};
export type RewardRow = {
  id: string | null; name: string; description: string | null; point_cost: number; image_url: string | null;
  is_active: boolean; show_in_store: boolean; reward_type: string; sort_order: number; category: string | null; terms: string | null;
};
export type TeamRow = {
  kind: "member" | "invitation"; user_id: string | null; email: string; full_name: string | null;
  role: "agency_admin" | "agency_va" | "business_manager" | "business_staff"; status: "active" | "pending" | "revoked" | "expired"; token: string | null; created_at: string;
};
export type NewStaff = { email: string; full_name: string; role: "business_staff" | "business_manager"; password: string };
export type CreatedStaff = { email: string; password: string | null; created_new: boolean };

export type GiftOffer = {
  template_id: string; slug: string; name: string; emoji: string | null; description: string | null; default_image_url: string | null;
  trigger_type: "date" | "birthday" | "anniversary" | "signup" | "inactivity"; trigger_config: Record<string, unknown>;
  config_id: string | null; is_active: boolean; custom_title: string | null; custom_description: string | null; custom_image_url: string | null;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus" | "reward"; discount_value: number | null;
  voice_message_url: string | null; gift_reward_id: string | null; custom_trigger_config: Record<string, unknown> | null;
};
export type Journey = {
  key: string; grp: string; name: string; why: string; trigger_text: string; timing_text: string; channels: string[];
  reward_text: string | null; engine: "workflow" | "legacy"; enabled: boolean; entered_30d: number; sent_30d: number; converted_30d: number;
};

export type SocialPillar = { platform: "google" | "instagram" | "facebook"; verified_total: number; verified_30d: number; verified_prev_30d: number; pending: number; rejected: number };
export type InsightsV3 = {
  members_total: number; new_members_30d: number; new_members_prev_30d: number; active_30d: number; repeat_members: number;
  visited_ever: number; lapsed_60d: number; paid_members: number; birthdays_on_file: number; push_opted_in: number;
  visits_30d: number; visits_prev_30d: number; unique_visitors_30d: number;
  revenue_30d_cents: number; revenue_prev_30d_cents: number; purchases_30d: number; avg_ticket_cents: number;
  points_awarded_30d: number; points_redeemed_30d: number; redemptions_30d: number; redemptions_prev_30d: number; points_outstanding: number;
  spins_30d: number; spins_prev_30d: number; spin_points_30d: number;
  gifts_issued_30d: number; gifts_revealed_30d: number; gifts_redeemed_30d: number; gifts_waiting: number;
  bookings_30d: number; bookings_prev_30d: number; bookings_upcoming: number; bookings_pending: number; bookings_noshow_30d: number;
  waivers_total: number; waivers_30d: number;
  social: SocialPillar[]; social_pending_total: number; weekday_visits: number[];
  top_rewards: { name: string; image_url: string | null; n: number }[];
};
export type InsightsWeek = { week_start: string; visits: number; new_members: number; redemptions: number; bookings: number };
export type SpinStats = { spins: number; spinners: number; checkin_spins: number; prizes_won: number; points_won: number; visited_after: number; notified: number; members_reached: number; spun_after_push: number };
export type WeeklySpin = { enabled: boolean; members: number; week_start: string; this_week: SpinStats; d30: SpinStats; prev30: SpinStats; weeks: { week_start: string; spins: number }[] };
export type TopPatient = { membership_id: string; full_name: string | null; email: string | null; lifetime_points: number; points_balance: number; visit_count: number; last_visit_at: string | null; total_spent_cents?: number };
export type InactivePatient = { membership_id: string; full_name: string | null; email: string | null; phone: string | null; last_visit_at: string | null; days_since_last: number | null; visit_count: number; joined_at?: string | null };
export type WinbackReward = { id: string; name: string; point_cost: number; image_url: string | null };
export type Winback = { message: string; bonusPoints: number; rewardId: string | null; expiresDays: number };
export type ReportArchiveRow = { month: string; data: MonthlyReport; emailed_at: string | null; emailed_to: string[] | null };
export type ReportRecipients = { custom: string[] | null; effective: { email: string; name: string }[]; managers: string[]; me: string | null };
export type DeskOffer = { id: string | null; title: string; description: string | null; image_url: string | null; expires_at: string | null; is_active: boolean; is_featured: boolean };
/** The clinic's single membership (business_membership_billing). Every column is sent back on save, so nothing is wiped. */
export type MembershipSetup = {
  is_enabled: boolean; membership_name: string; image_url: string | null; perks: string[]; points_multiplier: number; has_priority_booking: boolean;
  monthly_cash_balance_cents: number; offer_monthly: boolean; price_cents: number; pass_options: { id: string; label: string; months: number; price_cents: number }[];
  payment_mode: "stripe" | "external_link" | "in_person"; external_payment_url: string | null; payment_instructions: string | null;
};
export type AtlasBilling = {
  plan_name: string; monthly_cents: number; status: string; current_period_end: string | null; started_at: string | null; setup_fees_outstanding_cents: number;
  recent_payments: { amount_cents: number; type: string; status: string; description: string | null; paid_at: string | null }[];
};

/** CP-241: a patient's saved AI skin scan (scores only, no photo). */
export type SkinScanRow = {
  id: string; membership_id: string | null; full_name: string | null; phone: string | null; email: string | null;
  overall: number; skin_age: number | null; metrics: { id: ConcernId; score: number }[]; goals: string[]; treatments: string[]; created_at: string;
};

export interface DeskApi {
  lookup(q: string): Promise<LookupResult>;
  /** CP-241: saved skin scans, newest first. */
  skinScans(): Promise<SkinScanRow[]>;
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
  members(): Promise<DeskMember[]>;
  pendingReviews(): Promise<PendingReview[]>;
  decideReview(id: string, approve: boolean): Promise<void>;
  // ── manager tools ──
  pendingMemberships(): Promise<PendingMember[]>;
  decideMembership(id: string, activate: boolean): Promise<void>;
  payoutStatus(): Promise<PayoutStatus>;
  overview(): Promise<Overview>;
  rewardsList(): Promise<RewardRow[]>;
  saveReward(r: RewardRow): Promise<void>;
  deleteReward(id: string): Promise<void>;
  uploadImage(file: File, bucket?: "reward-images" | "offer-images" | "membership-images"): Promise<string>;
  team(): Promise<TeamRow[]>;
  addStaff(n: NewStaff): Promise<CreatedStaff>;
  removeStaff(row: TeamRow): Promise<void>;
  revokeInvite(row: TeamRow): Promise<void>;
  // ── gifts + automations ──
  giftOffers(): Promise<GiftOffer[]>;
  saveGiftOffer(g: GiftOffer): Promise<void>;
  /** Atlas admins only (wf_assert_admin in the database). */
  journeys(): Promise<Journey[]>;
  toggleJourney(key: string, enabled: boolean): Promise<void>;
  // ── insights + monthly reports ──
  insights(): Promise<{ data: InsightsV3; weeks: InsightsWeek[] }>;
  weeklySpin(): Promise<WeeklySpin | null>;
  topPatients(): Promise<TopPatient[]>;
  inactivePatients(minDays: number): Promise<InactivePatient[]>;
  winbackRewards(): Promise<WinbackReward[]>;
  sendWinback(membershipIds: string[], w: Winback): Promise<void>;
  reportLive(): Promise<MonthlyReport>;
  reportArchive(): Promise<ReportArchiveRow[]>;
  /** null when this account can't see them (the database checks the role). */
  reportRecipients(): Promise<ReportRecipients | null>;
  setReportRecipients(emails: string[]): Promise<void>;
  sendReportTest(month: string | null, to: string | null): Promise<{ to: string }>;
  // ── one-time offers ──
  offers(): Promise<DeskOffer[]>;
  saveOffer(o: DeskOffer): Promise<string | null>;
  deleteOffer(id: string): Promise<void>;
  /** Tells patients about a newly featured offer (best effort; the offer is saved either way). */
  announceOffer(o: DeskOffer, id: string | null): void;
  // ── the single membership + what the clinic pays Atlas ──
  membershipSetup(): Promise<MembershipSetup | null>;
  saveMembershipSetup(m: MembershipSetup): Promise<void>;
  billing(): Promise<AtlasBilling | null>;
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

    async members() {
      const { data, error } = await sb().rpc("list_business_members", { p_business_id: businessId, p_limit: 500, p_offset: 0 });
      fail(error);
      return (data ?? []) as DeskMember[];
    },
    async pendingReviews() {
      const { data, error } = await sb().rpc("pending_reviews_for_business", { p_business_id: businessId });
      fail(error);
      return ((data ?? []) as PendingReview[]).filter((r) => !r.platform || r.platform === "google");
    },
    async decideReview(id, approve) {
      const { error } = approve ? await sb().rpc("approve_review", { p_review_id: id }) : await sb().rpc("reject_review", { p_review_id: id, p_reason: null });
      fail(error);
    },
    async pendingMemberships() {
      const { data, error } = await sb().rpc("list_pending_memberships", { p_business_id: businessId });
      fail(error);
      return (data ?? []) as PendingMember[];
    },
    async decideMembership(id, activate) {
      const { error } = activate ? await sb().rpc("activate_pending_membership", { p_membership_id: id, p_note: null }) : await sb().rpc("reject_pending_membership", { p_membership_id: id });
      fail(error);
    },
    async payoutStatus() {
      const { data, error } = await sb().rpc("payment_account_public", { p_business_id: businessId });
      fail(error);
      return ((data ?? []) as (NonNullable<PayoutStatus> & { provider: string })[]).find((r) => r.provider === "stripe") ?? null;
    },

    async overview() {
      const { data, error } = await sb().rpc("medspa_overview", { p_business_id: businessId });
      fail(error);
      return data as Overview;
    },
    async skinScans() {
      const { data, error } = await sb().rpc("medspa_skin_scans_desk", { p_business_id: businessId, p_limit: 200 });
      fail(error);
      return (data ?? []) as SkinScanRow[];
    },
    async rewardsList() {
      const { data, error } = await sb().from("rewards")
        .select("id,name,description,point_cost,image_url,is_active,show_in_store,reward_type,sort_order,category,terms")
        .eq("business_id", businessId).order("sort_order", { ascending: true }).order("point_cost", { ascending: true });
      fail(error);
      return (data ?? []) as RewardRow[];
    },
    async saveReward(r) {
      // Same RPC as the builder / portal rewards manager (12-arg signature); fine print is written separately.
      const s = sb();
      const { data, error } = await s.rpc("upsert_reward", {
        p_id: r.id, p_business_id: businessId, p_name: r.name.trim(), p_description: r.description?.trim() || null,
        p_reward_type: r.reward_type || "discount", p_point_cost: r.point_cost, p_image_url: r.image_url, p_is_active: r.is_active,
        p_sort_order: r.sort_order ?? 0, p_category: r.category?.trim() || null, p_show_in_store: r.show_in_store, p_images: null,
      });
      fail(error);
      const id = r.id ?? (typeof data === "string" ? data : first<{ id?: string }>(data)?.id ?? null);
      const terms = r.terms?.trim() || null;
      if (id) await s.from("rewards").update({ terms }).eq("id", id).eq("business_id", businessId);
      else {
        const { data: row } = await s.from("rewards").select("id").eq("business_id", businessId).eq("name", r.name.trim()).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if ((row as { id?: string } | null)?.id) await s.from("rewards").update({ terms }).eq("id", (row as { id: string }).id);
      }
    },
    async deleteReward(id) {
      const { error } = await sb().rpc("delete_reward", { p_id: id, p_business_id: businessId });
      fail(error);
    },
    async uploadImage(file, bucket = "reward-images") {
      const s = sb();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${businessId}/${Date.now()}.${ext}`;
      const { error } = await s.storage.from(bucket).upload(path, file, { upsert: true, cacheControl: "31536000", contentType: file.type || undefined });
      fail(error);
      return s.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
    async team() {
      const { data, error } = await sb().rpc("list_team_members", { p_business_id: businessId });
      fail(error);
      return ((data ?? []) as TeamRow[]).filter((r) => r.role === "business_manager" || r.role === "business_staff");
    },
    async addStaff(n) {
      const res = await fetch(`/api/${slug}/desk/team`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-account", email: n.email.trim(), role: n.role, business_id: businessId, full_name: n.full_name.trim() || undefined, password: n.password.trim() || undefined }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Couldn't add that person.");
      return { email: json.email ?? n.email, password: json.password ?? null, created_new: !!json.created_new };
    },
    async removeStaff(row) {
      const { error } = await sb().rpc("remove_team_member", { p_user_id: row.user_id, p_business_id: businessId, p_role: row.role });
      fail(error);
    },
    async revokeInvite(row) {
      const res = await fetch(`/api/${slug}/desk/team`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke", token: row.token }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't revoke.");
    },
    async giftOffers() {
      const { data, error } = await sb().rpc("list_automated_offers_for_business", { p_business_id: businessId });
      fail(error);
      return (data ?? []) as GiftOffer[];
    },
    async saveGiftOffer(g) {
      // Same RPC and arguments as the portal's automated offers manager.
      const { error } = await sb().rpc("upsert_business_automated_offer", {
        p_id: g.config_id, p_business_id: businessId, p_template_id: g.template_id, p_is_active: g.is_active,
        p_custom_title: g.custom_title, p_custom_description: g.custom_description, p_custom_image_url: g.custom_image_url,
        p_discount_type: g.discount_type ?? "none", p_discount_value: g.discount_value, p_expires_after_days: 7,
        p_voice_message_url: g.voice_message_url, p_gift_reward_id: g.gift_reward_id, p_custom_trigger_config: g.custom_trigger_config,
      });
      fail(error);
    },
    async journeys() {
      const { data, error } = await sb().rpc("wf_suite", { p_business_id: businessId });
      fail(error);
      return (data ?? []) as Journey[];
    },
    async toggleJourney(key, enabled) {
      const { error } = await sb().rpc("wf_suite_toggle", { p_business_id: businessId, p_key: key, p_enabled: enabled });
      fail(error);
    },

    async insights() {
      const s = sb();
      const [a, b] = await Promise.all([
        s.rpc("atlas_insights_v3", { p_business_id: businessId }),
        s.rpc("atlas_weekly_trend", { p_business_id: businessId }),
      ]);
      fail(a.error);
      return { data: a.data as InsightsV3, weeks: b.error ? [] : ((b.data ?? []) as InsightsWeek[]) };
    },
    async weeklySpin() {
      const { data, error } = await sb().rpc("weekly_spin_insights", { p_business_id: businessId });
      return error ? null : ((data as WeeklySpin | null) ?? null);
    },
    async topPatients() {
      const { data, error } = await sb().rpc("top_loyal_members", { p_business_id: businessId, p_limit: 5 });
      fail(error);
      return (data ?? []) as TopPatient[];
    },
    async inactivePatients(minDays) {
      const { data, error } = await sb().rpc("inactive_members", { p_business_id: businessId, p_min_days: minDays, p_limit: 50 });
      fail(error);
      return (data ?? []) as InactivePatient[];
    },
    async winbackRewards() {
      const { data, error } = await sb().from("rewards").select("id,name,point_cost,image_url")
        .eq("business_id", businessId).eq("is_active", true).is("archived_at", null).order("point_cost").limit(30);
      fail(error);
      return (data ?? []) as WinbackReward[];
    },
    async sendWinback(membershipIds, w) {
      // send_winback_v2 writes the notification itself; the push fan-out trigger delivers it.
      const s = sb();
      const results = await Promise.all(membershipIds.map((id) => s.rpc("send_winback_v2", {
        p_business_id: businessId, p_membership_id: id, p_title: "We miss you ✨", p_body: w.message,
        p_bonus_points: w.bonusPoints > 0 ? w.bonusPoints : null, p_reward_id: w.rewardId, p_expires_days: w.expiresDays,
      })));
      fail(results.find((r) => r.error)?.error ?? null);
    },
    async reportLive() {
      const { data, error } = await sb().rpc("business_monthly_report", { p_business_id: businessId });
      fail(error);
      return data as MonthlyReport;
    },
    async reportArchive() {
      const { data, error } = await sb().from("business_monthly_reports").select("month, data, emailed_at, emailed_to")
        .eq("business_id", businessId).order("month", { ascending: false }).limit(24);
      fail(error);
      return ((data ?? []) as ReportArchiveRow[]).map((r) => ({ ...r, month: String(r.month).slice(0, 7) }));
    },
    async reportRecipients() {
      const { data, error } = await sb().rpc("get_report_recipients", { p_business_id: businessId });
      return error ? null : ((data as ReportRecipients | null) ?? null);
    },
    async setReportRecipients(emails) {
      const { error } = await sb().rpc("set_report_recipients", { p_business_id: businessId, p_emails: emails });
      fail(error);
    },
    async sendReportTest(month, to) {
      // The venue app holds the email keys; its route checks the signed-in manager.
      const res = await fetch(`/api/${slug}/desk/report-test`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month, to }) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; to?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Couldn't send the test.");
      return { to: json.to ?? to ?? "you" };
    },
    async offers() {
      const { data, error } = await sb().from("offers").select("id,title,description,image_url,expires_at,is_active,is_featured,is_automated,welcome_config_id")
        .eq("business_id", businessId).order("is_featured", { ascending: false }).order("created_at", { ascending: false });
      fail(error);
      // Automated and welcome gifts have their own home: App Builder → Automated Offers.
      return ((data ?? []) as (DeskOffer & { is_automated: boolean | null; welcome_config_id: string | null })[])
        .filter((o) => !o.is_automated && !o.welcome_config_id)
        .map((o) => ({ id: o.id, title: o.title, description: o.description, image_url: o.image_url, expires_at: o.expires_at, is_active: o.is_active, is_featured: o.is_featured }));
    },
    async saveOffer(o) {
      const { data, error } = await sb().rpc("upsert_offer", {
        p_id: o.id, p_business_id: businessId, p_title: o.title.trim(), p_description: o.description?.trim() || null,
        p_image_url: o.image_url, p_expires_at: o.expires_at, p_is_active: o.is_active, p_is_featured: o.is_featured,
      });
      fail(error);
      return typeof data === "string" ? data : o.id;
    },
    async deleteOffer(id) {
      const { error } = await sb().rpc("delete_offer", { p_id: id, p_business_id: businessId });
      fail(error);
    },
    announceOffer(o, id) {
      fetch(`/api/${slug}/desk/announce-offer`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ offer_id: id, title: o.title, description: o.description }) }).catch(() => {});
    },
    async membershipSetup() {
      const { data, error } = await sb().rpc("membership_billing_public", { p_business_id: businessId });
      fail(error);
      const r = first<Partial<MembershipSetup>>(data);
      if (!r) return null;
      return {
        is_enabled: !!r.is_enabled, membership_name: r.membership_name ?? "", image_url: r.image_url ?? null, perks: (r.perks ?? []).filter(Boolean),
        points_multiplier: Number(r.points_multiplier ?? 1) || 1, has_priority_booking: !!r.has_priority_booking,
        monthly_cash_balance_cents: r.monthly_cash_balance_cents ?? 0, offer_monthly: r.offer_monthly ?? true, price_cents: r.price_cents ?? 0,
        pass_options: r.pass_options ?? [], payment_mode: r.payment_mode ?? "in_person",
        external_payment_url: r.external_payment_url ?? null, payment_instructions: r.payment_instructions ?? null,
      };
    },
    async saveMembershipSetup(m) {
      const { error } = await sb().rpc("upsert_membership_billing_v3", {
        p_business_id: businessId, p_is_enabled: m.is_enabled, p_membership_name: m.membership_name.trim() || "Membership", p_price_cents: m.price_cents,
        p_perks: m.perks.map((p) => p.trim()).filter(Boolean), p_monthly_cash_balance_cents: m.monthly_cash_balance_cents, p_points_multiplier: m.points_multiplier,
        p_has_priority_booking: m.has_priority_booking, p_image_url: m.image_url, p_payment_mode: m.payment_mode, p_external_payment_url: m.external_payment_url,
        p_payment_instructions: m.payment_instructions, p_pass_options: m.pass_options, p_offer_monthly: m.offer_monthly,
      });
      fail(error);
    },
    async billing() {
      const { data, error } = await sb().rpc("my_business_billing", { p_business_id: businessId });
      fail(error);
      return first<AtlasBilling>(data);
    },
  };
}

/* ───────────── demo: sample clinic, in memory ───────────── */

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

/**
 * `imported` (lead-magnet audit, step 4): a preview desk with the owner's own patient list (from a
 * CSV, kept in their browser) shows those patients and who's due instead of the sample people.
 */
export function demoDeskApi(rewards: { id: string; name: string; point_cost: number; image_url: string | null; description: string | null }[], treatments: Treatment[], slug = "demo",
  imported: { members: DeskMember[]; due: DueRow[] } | null = null): DeskApi {
  const sample: DeskMember[] = [
    ["Sofia Martinez", "8055550123", 420, 9], ["Emma Chen", "8055550188", 180, 3], ["Olivia Brooks", "8055550142", 960, 14],
    ["Ava Patel", "8055550177", 60, 1], ["Mia Johnson", "8055550111", 240, 5], ["Isabella Nguyen", "8055550166", 1210, 21],
  ].map(([n, p, pts, v], i) => ({ membership_id: `m${i}`, user_id: `u${i}`, full_name: n as string, email: null, phone: p as string,
    points_balance: pts as number, tier: null, joined_at: ago(200 - i * 25), visit_count: v as number }));
  const people: DeskMember[] = imported?.members.length ? imported.members.map((m) => ({ ...m })) : sample;
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
  let rewardRows: RewardRow[] = rewards.map((r, i) => ({ id: r.id, name: r.name, description: r.description, point_cost: r.point_cost, image_url: r.image_url, is_active: true, show_in_store: true, reward_type: "discount", sort_order: i, category: null, terms: null }));
  let teamRows: TeamRow[] = [
    { kind: "member", user_id: "s1", email: "jane@glowaesthetics.com", full_name: "Dr. Jane Preview", role: "business_manager", status: "active", token: null, created_at: ago(300) },
    { kind: "member", user_id: "s2", email: "frontdesk@glowaesthetics.com", full_name: "Kayla Ruiz", role: "business_staff", status: "active", token: null, created_at: ago(120) },
  ];
  const tpl = (id: string, slug: string, name: string, trigger_type: GiftOffer["trigger_type"], description: string, on: boolean, rewardIdx: number | null, image: string, percent?: number): GiftOffer => ({
    template_id: id, slug, name, emoji: null, description, default_image_url: `/medspa-example/${image}.jpg`, trigger_type, trigger_config: {}, config_id: on ? `c_${id}` : null, is_active: on,
    custom_title: null, custom_description: null, custom_image_url: null, discount_type: percent ? "percent" : rewardIdx == null ? "none" : "reward", discount_value: percent ?? null,
    voice_message_url: null, gift_reward_id: rewardIdx == null ? null : rewards[rewardIdx]?.id ?? null, custom_trigger_config: null,
  });
  let gifts2: GiftOffer[] = [
    tpl("t1", "welcome", "Welcome gift", "signup", "Sent when a patient joins the app.", true, 0, "t-ce-ferulic"),
    tpl("t2", "birthday", "Birthday", "birthday", "Sent in their birthday week.", true, 3, "t-hydrafacial"),
    tpl("t3", "winback", "We miss you", "inactivity", "Sent after 90 days without a visit.", true, null, "t-botox", 20),
    tpl("t4", "anniversary", "Patient anniversary", "anniversary", "A year since they joined.", true, null, "t-morpheus8", 15),
    tpl("t5", "valentines", "Valentine's Day", "date", "Sent on February 14.", true, null, "t-juvederm", 15),
    tpl("t6", "mothers-day", "Mother's Day", "date", "Sent on Mother's Day.", true, null, "t-alma-harmony", 20),
    tpl("t7", "black-friday", "Black Friday", "date", "Sent on Black Friday.", true, null, "t-sofwave", 25),
    tpl("t8", "christmas", "Christmas", "date", "Sent on December 24.", false, null, "t-emface", 10),
  ];
  let journeys: Journey[] = [
    ["ms.welcome", "get_in", "New patient welcome", "A patient joins the app", "Now · day 1 · day 3 · day 7", ["push", "email"], true, 34, 96, 11],
    ["ms.cart_recovery", "convert", "Finish your order", "Checkout started, not paid", "2 hours · 24 hours · 72 hours", ["push", "email"], true, 9, 21, 4],
    ["ms.book_after_purchase", "care", "Book after purchase", "Joined a membership or bought a package", "Day 1 · day 4", ["push"], false, 0, 0, 0],
    ["ms.rebook", "care", "Time for your next treatment", "A treatment's recall comes due", "Before the due date · after", ["push"], true, 41, 63, 17],
    ["ms.winback", "come_back", "We miss you", "No visit in 90 days", "Day 90 · day 120", ["push", "email"], false, 0, 0, 0],
    ["ms.birthday", "celebrate", "Birthday", "Their birthday week", "On the day", ["push"], true, 6, 6, 2],
  ].map(([key, grp, name, trigger_text, timing_text, channels, enabled, e, s2, c]) => ({ key, grp, name, why: "", trigger_text, timing_text, channels, reward_text: null, engine: "workflow", enabled, entered_30d: e, sent_30d: s2, converted_30d: c } as Journey));
  let demoReviews: PendingReview[] = [{ id: "rv1", member_name: "Emma Chen", member_email: null, submitted_at: ago(0.1), platform: "google" }];
  let demoPending: PendingMember[] = [{ membership_id: "m3", full_name: "Ava Patel", email: null, phone: "8055550177", requested_at: ago(0.5), pending_plan: { kind: "monthly", label: "Glow Club", price_cents: 9900 } }];
  let demoOffers: DeskOffer[] = [{ id: "of1", title: "20% off your next HydraFacial", description: "Show this at the desk. This month only.", image_url: "/medspa-example/t-hydrafacial.jpg", expires_at: ahead(14), is_active: true, is_featured: true }];
  let demoMembership: MembershipSetup = {
    is_enabled: true, membership_name: "Glow Club", image_url: null, perks: ["A facial every month", "10% off skincare", "Member-only pricing on injectables"], points_multiplier: 2, has_priority_booking: false,
    monthly_cash_balance_cents: 0, offer_monthly: true, price_cents: 9900, pass_options: [], payment_mode: "in_person", external_payment_url: null, payment_instructions: null,
  };
  let demoRecipients: string[] = [];
  const monthAgo = (n: number) => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const demoReport = (n: number): MonthlyReport => {
    const k = 1 - n * 0.09;
    const core = (f: number): MonthlyReport["current"] => ({
      new_members: Math.round(38 * f), total_members: Math.round(412 * f), visits: Math.round(168 * f), active_members: Math.round(131 * f), returning_members: Math.round(74 * f),
      points_earned: Math.round(21400 * f), points_redeemed: Math.round(8600 * f), rewards_redeemed: Math.round(47 * f), reviews: Math.round(12 * f), referrals: Math.round(9 * f),
      membership_revenue_cents: Math.round(1841400 * f), paid_members: Math.round(186 * f), treatments: Math.round(152 * f), shop_sales_cents: Math.round(612000 * f), shop_orders: Math.round(41 * f), inactive_60d: Math.round(58 * f),
    });
    return {
      business: { id: "example", name: "Glow Aesthetics", slug: "demo", layout: "medspa" }, month: monthAgo(n), partial: n === 0, through: new Date().toISOString(),
      current: core(k), previous: core(k * 0.91),
      top_members: [{ name: "Isabella Nguyen", points: 1210, visits: 21 }, { name: "Olivia Brooks", points: 960, visits: 14 }, { name: "Sofia Martinez", points: 420, visits: 9 }],
      top_treatments: [{ name: "BOTOX® Cosmetic", n: 64 }, { name: "HydraFacial", n: 41 }, { name: "Morpheus8", n: 23 }, { name: "Juvéderm®", n: 17 }],
      weekly_spin: null,
    };
  };
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
      if (imported?.members.length) return imported.due.map((d) => ({ ...d }));
      return [
        { ...people[0], treatment_name: treatments[0]?.name ?? "Neurotoxin", performed_at: ago(84), due_at: ago(0), has_upcoming_booking: false },
        { ...people[3], treatment_name: "HydraFacial", performed_at: ago(30), due_at: ahead(2), has_upcoming_booking: false },
        { ...people[5], treatment_name: "Lip filler", performed_at: ago(180), due_at: ago(10), has_upcoming_booking: true },
      ] as DueRow[];
    },
    async orders() { await wait(); return orders.map((o) => ({ ...o })); },
    async updateOrder(id, status) {
      await wait();
      const before = orders.find((o) => o.id === id);
      if (before && status === "paid" && before.status !== "paid" && before.kind !== "gift_card") {
        const m = people.find((p) => p.user_id === before.user_id);
        if (m) log(m, Math.floor(before.amount_cents / 100), "purchase", before.item_name);
      }
      orders = orders.map((o) => (o.id === id ? { ...o, status } : o));
    },
    async activity() { await wait(); return act.map((a) => ({ ...a })); },
    async members() { await wait(); return people.map((m) => ({ ...m })); },
    async pendingReviews() { await wait(); return demoReviews.map((r) => ({ ...r })); },
    async decideReview(id, approve) { await wait(); const r = demoReviews.find((x) => x.id === id); demoReviews = demoReviews.filter((x) => x.id !== id); if (approve && r) { const m = people.find((p) => p.full_name === r.member_name); if (m) log(m, 20, "review", "Google review"); } },
    async pendingMemberships() { await wait(); return demoPending.map((r) => ({ ...r })); },
    async decideMembership(id) { await wait(); demoPending = demoPending.filter((x) => x.membership_id !== id); },
    async payoutStatus() { await wait(); return { connected: true, charges_enabled: true, payouts_enabled: true, details_submitted: true }; },

    async overview() {
      await wait();
      const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (11 - i)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
      const visits = [58, 74, 69, 88, 92, 86, 104, 118, 109, 133, 151, 168];
      const sales = [152, 188, 176, 241, 263, 248, 310, 355, 332, 428, 512, 612];
      const joins = [9, 14, 11, 18, 22, 19, 25, 27, 24, 31, 34, 38];
      return {
        patients: imported?.members.length ?? 412, members_paid: 186, visits_total: 1536, visits_30d: 168, sales_cents_total: 4_830_000, sales_cents_30d: 612_000, auto_offers_active: 7,
        monthly: months.map((m, i) => ({ month: m, visits: visits[i], sales_cents: sales[i] * 1000, joins: joins[i] })),
        activity: [
          { at: ago(0.002), kind: "order", who: "Sofia", detail: "Morpheus8, 3 sessions", amount_cents: 300000 },
          { at: ago(0.004), kind: "signup", who: "Harper", detail: null, amount_cents: null },
          { at: ago(0.006), kind: "treatment", who: "Mia", detail: "HydraFacial", amount_cents: null },
          { at: ago(0.008), kind: "order", who: "Olivia", detail: "SkinCeuticals C E Ferulic®", amount_cents: 18200 },
          { at: ago(0.011), kind: "signup", who: "Ava", detail: null, amount_cents: null },
          { at: ago(0.014), kind: "order", who: "Isabella", detail: "Glow Club membership", amount_cents: 9900 },
        ],
      };
    },
    async skinScans() {
      await wait();
      // Scans saved on the demo's patient view (this browser), then two examples.
      let mine: SkinScanRow[] = [];
      try {
        mine = (JSON.parse(localStorage.getItem(demoScansKey(slug)) || "[]") as SavedScan[])
          .map((r, i) => ({ ...r, id: `local${i}`, membership_id: null, email: null }));
      } catch { /* storage unavailable */ }
      const sample = (name: string, phone: string, overall: number, days: number, metrics: [ConcernId, number][], tx: string[]): SkinScanRow => ({
        id: `ss-${phone}`, membership_id: null, full_name: name, phone, email: null, overall, skin_age: null,
        metrics: metrics.map(([id, score]) => ({ id, score })), goals: [], treatments: tx, created_at: ago(days),
      });
      return [...mine,
        sample("Emma Chen", "8055550188", 71, 0.4, [["lines", 58], ["texture", 64], ["pores", 69], ["redness", 81]], [treatments.find((t) => /tox|botox/i.test(t.name))?.name ?? "Neurotoxin", "Microneedling"]),
        sample("Ava Patel", "8055550177", 78, 2, [["spots", 61], ["radiance", 66], ["hydration", 72], ["acne", 90]], ["IPL photofacial", "HydraFacial"]),
      ];
    },
    async rewardsList() { await wait(); return rewardRows.map((r) => ({ ...r })); },
    async saveReward(r) { await wait(); if (r.id) rewardRows = rewardRows.map((x) => (x.id === r.id ? { ...r } : x)); else rewardRows = [...rewardRows, { ...r, id: `rw${Date.now()}` }]; },
    async deleteReward(id) { await wait(); rewardRows = rewardRows.filter((x) => x.id !== id); },
    async uploadImage(file) { await wait(); return URL.createObjectURL(file); },
    async team() { await wait(); return teamRows.map((t) => ({ ...t })); },
    async addStaff(n) {
      await wait();
      teamRows = [...teamRows, { kind: "member", user_id: `s${Date.now()}`, email: n.email, full_name: n.full_name || null, role: n.role, status: "active", token: null, created_at: new Date().toISOString() }];
      return { email: n.email, password: n.password || "Glow-" + Math.random().toString(36).slice(2, 8), created_new: true };
    },
    async removeStaff(row) { await wait(); teamRows = teamRows.filter((t) => t.user_id !== row.user_id); },
    async revokeInvite(row) { await wait(); teamRows = teamRows.filter((t) => t.token !== row.token); },
    async giftOffers() { await wait(); return gifts2.map((g) => ({ ...g })); },
    async saveGiftOffer(g) { await wait(); gifts2 = gifts2.map((x) => (x.template_id === g.template_id ? { ...g, config_id: x.config_id ?? `c${Date.now()}` } : x)); },
    async journeys() { await wait(); return journeys.map((j) => ({ ...j })); },
    async toggleJourney(key, enabled) { await wait(); journeys = journeys.map((j) => (j.key === key ? { ...j, enabled } : j)); },

    async insights() {
      await wait();
      const data: InsightsV3 = {
        members_total: 412, new_members_30d: 38, new_members_prev_30d: 31, active_30d: 131, repeat_members: 212, visited_ever: 340, lapsed_60d: 58, paid_members: 186, birthdays_on_file: 267, push_opted_in: 298,
        visits_30d: 168, visits_prev_30d: 151, unique_visitors_30d: 131, revenue_30d_cents: 612000, revenue_prev_30d_cents: 512000, purchases_30d: 41, avg_ticket_cents: 14900,
        points_awarded_30d: 21400, points_redeemed_30d: 8600, redemptions_30d: 47, redemptions_prev_30d: 52, points_outstanding: 96400,
        spins_30d: 0, spins_prev_30d: 0, spin_points_30d: 0, gifts_issued_30d: 64, gifts_revealed_30d: 51, gifts_redeemed_30d: 29, gifts_waiting: 12,
        bookings_30d: 0, bookings_prev_30d: 0, bookings_upcoming: 0, bookings_pending: 0, bookings_noshow_30d: 0, waivers_total: 0, waivers_30d: 0,
        social: [{ platform: "google", verified_total: 86, verified_30d: 12, verified_prev_30d: 9, pending: 1, rejected: 2 }], social_pending_total: 1,
        weekday_visits: [31, 44, 52, 58, 67, 49, 12],
        top_rewards: rewards.slice(0, 4).map((r, i) => ({ name: r.name, image_url: r.image_url, n: 22 - i * 5 })),
      };
      const weeks = Array.from({ length: 12 }, (_, i) => ({ week_start: ago((11 - i) * 7), visits: 24 + i * 2 + (i % 3), new_members: 4 + (i % 5), redemptions: 7 + (i % 4), bookings: 0 }));
      return { data, weeks };
    },
    async weeklySpin() { await wait(); return null; },
    async topPatients() {
      await wait();
      return [...people].sort((a, b) => b.points_balance - a.points_balance).slice(0, 5).map((m) => ({ membership_id: m.membership_id, full_name: m.full_name, email: null, lifetime_points: m.points_balance + 300, points_balance: m.points_balance, visit_count: m.visit_count ?? 0, last_visit_at: ago(12), total_spent_cents: (m.visit_count ?? 0) * 18000 }));
    },
    async inactivePatients(minDays) {
      await wait();
      return [
        { membership_id: "m3", full_name: "Ava Patel", email: null, phone: "8055550177", last_visit_at: ago(96), days_since_last: 96, visit_count: 1 },
        { membership_id: "m1", full_name: "Emma Chen", email: null, phone: "8055550188", last_visit_at: ago(64), days_since_last: 64, visit_count: 3 },
        { membership_id: "m4", full_name: "Mia Johnson", email: null, phone: "8055550111", last_visit_at: ago(35), days_since_last: 35, visit_count: 5 },
      ].filter((m) => m.days_since_last >= minDays);
    },
    async winbackRewards() { await wait(); return rewards.map((r) => ({ id: r.id, name: r.name, point_cost: r.point_cost, image_url: r.image_url })); },
    async sendWinback() { await wait(); },
    async reportLive() { await wait(); return demoReport(0); },
    async reportArchive() {
      await wait();
      return [1, 2, 3].map((n) => ({ month: monthAgo(n), data: { ...demoReport(n), partial: false }, emailed_at: ago(n * 30), emailed_to: ["jane@glowaesthetics.com"] }));
    },
    async reportRecipients() {
      await wait();
      const managers = ["jane@glowaesthetics.com"];
      return { custom: demoRecipients.length ? demoRecipients : null, effective: (demoRecipients.length ? demoRecipients : managers).map((email) => ({ email, name: "" })), managers, me: managers[0] };
    },
    async setReportRecipients(emails) { await wait(); demoRecipients = emails; },
    async sendReportTest(_month, to) { await wait(); return { to: to ?? "jane@glowaesthetics.com" }; },
    async offers() { await wait(); return demoOffers.map((o) => ({ ...o })); },
    async saveOffer(o) {
      await wait();
      const id = o.id ?? `of${Date.now()}`;
      const others = o.is_featured ? demoOffers.map((x) => ({ ...x, is_featured: false })) : demoOffers;
      demoOffers = o.id ? others.map((x) => (x.id === o.id ? { ...o } : x)) : [{ ...o, id }, ...others];
      return id;
    },
    async deleteOffer(id) { await wait(); demoOffers = demoOffers.filter((o) => o.id !== id); },
    announceOffer() {},
    async membershipSetup() { await wait(); return { ...demoMembership, perks: [...demoMembership.perks] }; },
    async saveMembershipSetup(m) { await wait(); demoMembership = { ...m, perks: m.perks.map((p) => p.trim()).filter(Boolean) }; },
    async billing() {
      await wait();
      return {
        plan_name: "Sample plan", monthly_cents: 19900, status: "active", current_period_end: ahead(18), started_at: ago(210), setup_fees_outstanding_cents: 0,
        recent_payments: [1, 2, 3].map((n) => ({ amount_cents: 19900, type: "subscription", status: "paid", description: "Monthly plan", paid_at: ago(n * 30 - 18) })),
      };
    },
  };
}
