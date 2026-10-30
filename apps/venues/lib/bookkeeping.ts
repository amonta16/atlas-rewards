"use client";
/**
 * lib/bookkeeping.ts — CP-112
 *
 * Shared helpers for the Bookkeeping tab and the Operating-Costs section
 * of Revenue Analytics. Everything money is integer CENTS; nothing here
 * ever fabricates a figure — missing data comes back null/absent with a
 * label, and tax treatment is always the accountant's call.
 */
import type {
  RecurringBill, ExpenseTransaction, ExpenseCategory, MileageEntry, MileageRate,
} from "@/lib/types/database";
import { dollars } from "@/lib/founder-hq";

/* ─────────────────────────── Frequencies ────────────────────────── */

export const FREQUENCIES = [
  { key: "weekly",    label: "Weekly" },
  { key: "monthly",   label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "annually",  label: "Annually" },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["key"];

/** Monthly-equivalent of a bill amount (for commitment totals — labeled). */
export function monthlyEquivalentCents(amountCents: number, frequency: string): number {
  switch (frequency) {
    case "weekly":    return Math.round(amountCents * 52 / 12);
    case "quarterly": return Math.round(amountCents / 3);
    case "annually":  return Math.round(amountCents / 12);
    default:          return amountCents;
  }
}

export function frequencyLabel(f: string): string {
  return FREQUENCIES.find(x => x.key === f)?.label ?? f;
}

/* ─────────────────────────── Statuses ───────────────────────────── */

export const TAX_REVIEW_STATUSES = [
  { key: "unreviewed",           label: "Unreviewed",                 tone: "slate" },
  { key: "purpose_documented",   label: "Business purpose documented", tone: "sky" },
  { key: "needs_accountant",     label: "Needs accountant review",    tone: "amber" },
  { key: "accountant_confirmed", label: "Accountant confirmed",       tone: "emerald" },
  { key: "not_deductible",       label: "Not deductible",             tone: "slate" },
] as const;

export function taxReviewMeta(key: string) {
  return TAX_REVIEW_STATUSES.find(s => s.key === key) ?? TAX_REVIEW_STATUSES[0];
}

export const REIMBURSEMENT_STATUSES = [
  { key: "none",       label: "No reimbursement" },
  { key: "pending",    label: "Reimbursement pending" },
  { key: "reimbursed", label: "Reimbursed" },
] as const;

/* ───────────────────── Bill due-state helpers ───────────────────── */

export type BillDueState = "overdue" | "due_soon" | "scheduled" | "cancelled";

export function billDueState(bill: RecurringBill, todayIso: string): BillDueState {
  if (bill.status === "cancelled") return "cancelled";
  if (bill.next_due_date < todayIso) return "overdue";
  const soon = new Date(`${todayIso}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 14);
  if (bill.next_due_date <= soon.toISOString().slice(0, 10)) return "due_soon";
  return "scheduled";
}

/* ───────────────────────── Snapshot math ────────────────────────── */

export type BookkeepingSnapshot = {
  monthPrefix: string;                  // YYYY-MM being summarized
  hostingPaidCents: number;             // paid this month, hosting categories
  otherRecurringPaidCents: number;      // paid this month, bill-linked non-hosting
  onetimePaidCents: number;             // paid this month, one-time non-hosting
  totalPaidCents: number;
  monthlyCommitmentCents: number;       // Σ active bills, monthly-equivalent (NOT paid)
  hostingCommitmentCents: number;
  upcomingBills: RecurringBill[];       // due within 14 days
  overdueBills: RecurringBill[];
  /** Live MRR − total PAID this month. Estimate — not accounting profit. */
  operatingRemainderCents: number | null;
  /** Hosting paid this month ÷ live MRR (percent, 0–999). */
  hostingPctOfMrr: number | null;
  /** (MRR − hosting paid) ÷ MRR — estimated gross margin, labeled. */
  grossMarginPct: number | null;
};

const isHostingCat = (categories: ExpenseCategory[], id: string | null) =>
  !!id && (categories.find(c => c.id === id)?.is_hosting ?? false);

export function computeSnapshot(
  bills: RecurringBill[],
  txns: ExpenseTransaction[],
  categories: ExpenseCategory[],
  liveMrrCents: number,
  todayIso: string,
): BookkeepingSnapshot {
  const monthPrefix = todayIso.slice(0, 7);
  const paidThisMonth = txns.filter(t =>
    t.status === "paid" && !t.archived
    && (t.paid_date ?? t.txn_date).slice(0, 7) === monthPrefix);

  let hosting = 0, otherRecurring = 0, onetime = 0;
  for (const t of paidThisMonth) {
    if (isHostingCat(categories, t.category_id)) hosting += t.amount_cents;
    else if (t.bill_id) otherRecurring += t.amount_cents;
    else onetime += t.amount_cents;
  }
  const totalPaid = hosting + otherRecurring + onetime;

  const active = bills.filter(b => b.status === "active");
  const monthlyCommitment = active.reduce((s, b) => s + monthlyEquivalentCents(b.amount_cents, b.frequency), 0);
  const hostingCommitment = active
    .filter(b => isHostingCat(categories, b.category_id))
    .reduce((s, b) => s + monthlyEquivalentCents(b.amount_cents, b.frequency), 0);

  const soonIso = (() => {
    const d = new Date(`${todayIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 14);
    return d.toISOString().slice(0, 10);
  })();

  return {
    monthPrefix,
    hostingPaidCents: hosting,
    otherRecurringPaidCents: otherRecurring,
    onetimePaidCents: onetime,
    totalPaidCents: totalPaid,
    monthlyCommitmentCents: monthlyCommitment,
    hostingCommitmentCents: hostingCommitment,
    upcomingBills: active
      .filter(b => b.next_due_date >= todayIso && b.next_due_date <= soonIso)
      .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)),
    overdueBills: active
      .filter(b => b.next_due_date < todayIso)
      .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date)),
    operatingRemainderCents: liveMrrCents > 0 || totalPaid > 0 ? liveMrrCents - totalPaid : null,
    hostingPctOfMrr: liveMrrCents > 0 ? Math.round((hosting / liveMrrCents) * 100) : null,
    grossMarginPct: liveMrrCents > 0 ? Math.round(((liveMrrCents - hosting) / liveMrrCents) * 100) : null,
  };
}

/* ─────────────── Per-client hosting economics (honest) ──────────── */

export type ClientHostingRow = {
  businessId: string;
  businessName: string;
  mrrCents: number;                 // what they pay us (live subscription)
  hostingMonthlyCents: number;      // client-specific bills, monthly-equivalent
  marginPct: number | null;         // null when either side is unknown
  flag: boolean;                    // hosting unusually high vs MRR
};

/**
 * Builds per-client hosting economics from CLIENT-SPECIFIC bills only.
 * Shared/agency-wide bills stay agency-wide — we never spread them across
 * clients and call it "profitability". `sharedMonthlyCents` reports what
 * remains unallocated so the UI can say so.
 */
export function clientHostingEconomics(
  bills: RecurringBill[],
  categories: ExpenseCategory[],
  mrrByBusiness: { business_id: string; business_name: string; monthly_cents: number; status: string }[],
): { rows: ClientHostingRow[]; sharedMonthlyCents: number } {
  const active = bills.filter(b => b.status === "active" && isHostingCat(categories, b.category_id));
  let shared = 0;
  const perBiz = new Map<string, number>();
  for (const b of active) {
    const me = monthlyEquivalentCents(b.amount_cents, b.frequency);
    if (b.business_id) {
      const portion = b.allocation_pct != null ? Math.round(me * b.allocation_pct / 100) : me;
      perBiz.set(b.business_id, (perBiz.get(b.business_id) ?? 0) + portion);
      if (b.allocation_pct != null && b.allocation_pct < 100) {
        shared += me - portion;    // the rest of a partially-allocated bill
      }
    } else {
      shared += me;
    }
  }
  const rows: ClientHostingRow[] = [];
  const seen = new Set<string>();
  for (const m of mrrByBusiness) {
    const hosting = perBiz.get(m.business_id) ?? 0;
    seen.add(m.business_id);
    rows.push({
      businessId: m.business_id,
      businessName: m.business_name,
      mrrCents: m.monthly_cents,
      hostingMonthlyCents: hosting,
      marginPct: m.monthly_cents > 0 && hosting > 0
        ? Math.round(((m.monthly_cents - hosting) / m.monthly_cents) * 100)
        : null,
      flag: m.monthly_cents > 0 && hosting > m.monthly_cents * 0.5,
    });
  }
  // Clients with tracked hosting but no live subscription (still honest).
  for (const [bizId, hosting] of Array.from(perBiz.entries())) {
    if (!seen.has(bizId)) {
      rows.push({
        businessId: bizId, businessName: "(no live subscription)",
        mrrCents: 0, hostingMonthlyCents: hosting, marginPct: null, flag: true,
      });
    }
  }
  return { rows: rows.sort((a, b) => b.hostingMonthlyCents - a.hostingMonthlyCents), sharedMonthlyCents: shared };
}

/* ───────────────────────── Mileage helpers ──────────────────────── */

export function mileageExtrasCents(m: MileageEntry): number {
  return (m.parking_cents ?? 0) + (m.tolls_cents ?? 0) + (m.other_cents ?? 0);
}

/** Rate for a trip's tax year, if the founders configured one. */
export function rateForYear(rates: MileageRate[], iso: string): MileageRate | null {
  const year = Number(iso.slice(0, 4));
  return rates.find(r => r.tax_year === year) ?? null;
}

export function mileageEstimateCents(m: MileageEntry, rates: MileageRate[]): number | null {
  const rate = rateForYear(rates, m.trip_date);
  if (!rate) return null;
  return Math.round(Number(m.miles) * rate.cents_per_mile);
}

/* ─────────────────────────── CSV export ─────────────────────────── */

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Cents → "123.45" (exact, decimal-safe — never floating dollars). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─────────────────────────── Misc ───────────────────────────────── */

export { dollars };

export function monthLabel(prefix: string): string {
  return new Date(`${prefix}-15T12:00:00Z`).toLocaleDateString(undefined, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** sha256 hex of a File — used to reuse an already-uploaded receipt. */
export async function fileSha256(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null; // non-secure context etc. — dedupe just won't apply
  }
}
