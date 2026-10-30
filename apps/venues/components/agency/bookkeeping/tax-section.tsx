"use client";
/**
 * tax-section.tsx — CP-112
 *
 * Tax-prep workbench: slice the year's records every way the accountant
 * will ask for, check what's missing (receipts, business purposes),
 * export a clean CSV, and read the yearly per-category summary.
 *
 * This organizes evidence — it never decides what is deductible.
 */
import { useMemo, useState } from "react";
import { FileSpreadsheet, Download } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type {
  ExpenseTransaction, ExpenseCategory, ExpenseDocument, AgencyAdminLite,
} from "@/lib/types/database";
import { dollars } from "@/lib/founder-hq";
import { TAX_REVIEW_STATUSES, buildCsv, centsToDecimal, downloadCsv } from "@/lib/bookkeeping";
import { GlassPanel, Chip, HqButton, EmptyState, fieldCls, selectCls } from "@/components/agency/hq/hq-ui";

export function TaxSection({
  txns, categories, businesses, admins, documents, todayIso,
}: {
  txns: ExpenseTransaction[];
  categories: ExpenseCategory[];
  businesses: { id: string; name: string }[];
  admins: AgencyAdminLite[];
  documents: Map<string, ExpenseDocument>;
  todayIso: string;
}) {
  const { toast } = useToast();
  const thisYear = todayIso.slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fCat, setFCat] = useState("");
  const [fVendor, setFVendor] = useState("");
  const [fPayStatus, setFPayStatus] = useState("paid");
  const [fReview, setFReview] = useState("");
  const [fFounder, setFFounder] = useState("");
  const [fClient, setFClient] = useState("");
  const [fReceipt, setFReceipt] = useState("");
  const [fKind, setFKind] = useState("");

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const bizById = useMemo(() => new Map(businesses.map(b => [b.id, b.name])), [businesses]);

  const years = useMemo(() => {
    const set = new Set(txns.map(t => (t.paid_date ?? t.txn_date).slice(0, 4)));
    set.add(thisYear);
    return Array.from(set).sort().reverse();
  }, [txns, thisYear]);

  const filtered = useMemo(() => {
    const needle = fVendor.trim().toLowerCase();
    return txns
      .filter(t => !t.archived)
      .filter(t => {
        const d = t.paid_date ?? t.txn_date;
        if (from || to) {
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        }
        return !year || d.slice(0, 4) === year;
      })
      .filter(t => !fCat || t.category_id === fCat)
      .filter(t => !needle || t.vendor.toLowerCase().includes(needle))
      .filter(t => !fPayStatus || t.status === fPayStatus)
      .filter(t => !fReview || t.tax_review_status === fReview)
      .filter(t => !fFounder || t.founder_user_id === fFounder)
      .filter(t => !fClient || t.business_id === fClient)
      .filter(t => fReceipt === "" ? true : fReceipt === "missing" ? !t.document_id : !!t.document_id)
      .filter(t => fKind === "" ? true : fKind === "recurring" ? !!t.bill_id : !t.bill_id)
      .sort((a, b) => (a.paid_date ?? a.txn_date).localeCompare(b.paid_date ?? b.txn_date));
  }, [txns, year, from, to, fCat, fVendor, fPayStatus, fReview, fFounder, fClient, fReceipt, fKind]);

  const totalCents = filtered.reduce((s, t) => s + t.amount_cents, 0);
  const missingReceipt = filtered.filter(t => !t.document_id).length;
  const missingPurpose = filtered.filter(t => !t.purpose?.trim()).length;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      const name = t.category_id ? (catById.get(t.category_id)?.name ?? "Uncategorized") : "Uncategorized";
      map.set(name, (map.get(name) ?? 0) + t.amount_cents);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered, catById]);

  function receiptRef(t: ExpenseTransaction): string {
    if (!t.document_id) return "";
    const d = documents.get(t.document_id);
    if (!d) return t.document_id;
    return d.kind === "link" ? (d.external_url ?? "") : (d.file_name ?? d.storage_path ?? "");
  }

  function exportCsv() {
    if (filtered.length === 0) { toast.error("Nothing matches these filters — nothing to export."); return; }
    const rows = filtered.map(t => [
      t.txn_date,
      t.paid_date ?? "",
      t.vendor,
      t.description ?? "",
      t.category_id ? (catById.get(t.category_id)?.name ?? "") : "",
      centsToDecimal(t.amount_cents),
      t.currency,
      t.purpose ?? "",
      t.status,
      TAX_REVIEW_STATUSES.find(s => s.key === t.tax_review_status)?.label ?? t.tax_review_status,
      t.business_id ? (bizById.get(t.business_id) ?? "") : (t.project_label ?? ""),
      t.bill_id ? "recurring" : "one-time",
      receiptRef(t),
      t.notes ?? "",
    ]);
    const csv = buildCsv(
      ["Transaction date", "Paid date", "Vendor", "Description", "Category", "Amount", "Currency",
       "Business purpose", "Payment status", "Tax-review status", "Client/Project", "Type",
       "Receipt reference", "Notes"],
      rows,
    );
    const label = from || to ? `${from || "start"}_${to || "end"}` : year;
    downloadCsv(`atlas-expenses-${label}.csv`, csv);
    toast.success(`Exported ${filtered.length} records (${dollars(totalCents)})`);
  }

  function exportSummary() {
    if (byCategory.length === 0) { toast.error("Nothing to summarize."); return; }
    const csv = buildCsv(
      ["Category", "Total amount", "Currency"],
      byCategory.map(([name, cents]) => [name, centsToDecimal(cents), "USD"]),
    );
    downloadCsv(`atlas-expense-summary-${from || to ? "range" : year}.csv`, csv);
    toast.success("Category summary exported");
  }

  return (
    <GlassPanel
      id="bk-tax"
      title="Tax Prep & Accountant Export"
      subtitle="Filter the records, check what's missing, hand the accountant a clean CSV. No tax determinations happen here."
      icon={<FileSpreadsheet className="h-4 w-4" />}
      right={
        <>
          <HqButton kind="outline" onClick={exportSummary}>
            <Download className="h-4 w-4" /> Category summary
          </HqButton>
          <HqButton onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV ({filtered.length})
          </HqButton>
        </>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={year} disabled={!!(from || to)}
          onChange={e => setYear(e.target.value)} aria-label="Tax year">
          {years.map(y => <option key={y} value={y}>Tax year {y}</option>)}
        </select>
        <input type="date" className={fieldCls + " !h-8 !w-auto text-[12px]"} value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" />
        <span className="text-sky-200/40 text-[11px]">to</span>
        <input type="date" className={fieldCls + " !h-8 !w-auto text-[12px]"} value={to} onChange={e => setTo(e.target.value)} aria-label="To date" />
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fCat} onChange={e => setFCat(e.target.value)} aria-label="Category">
          <option value="">Any category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={fieldCls + " !h-8 !w-36 text-[12px]"} value={fVendor} onChange={e => setFVendor(e.target.value)} placeholder="Vendor…" aria-label="Vendor" />
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fPayStatus} onChange={e => setFPayStatus(e.target.value)} aria-label="Payment status">
          <option value="paid">Paid only</option>
          <option value="scheduled">Scheduled</option>
          <option value="cancelled">Cancelled</option>
          <option value="">Any status</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fReview} onChange={e => setFReview(e.target.value)} aria-label="Tax review">
          <option value="">Any review status</option>
          {TAX_REVIEW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fFounder} onChange={e => setFFounder(e.target.value)} aria-label="Founder">
          <option value="">Any founder</option>
          {admins.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fClient} onChange={e => setFClient(e.target.value)} aria-label="Client">
          <option value="">Any client</option>
          {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fReceipt} onChange={e => setFReceipt(e.target.value)} aria-label="Receipt status">
          <option value="">Receipts: any</option>
          <option value="missing">Missing receipt</option>
          <option value="has">Has receipt</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fKind} onChange={e => setFKind(e.target.value)} aria-label="Recurring or one-time">
          <option value="">Recurring + one-time</option>
          <option value="recurring">Recurring only</option>
          <option value="one_time">One-time only</option>
        </select>
      </div>

      {/* Result summary */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Chip tone="sky">{filtered.length} records · {dollars(totalCents)}</Chip>
        {missingReceipt > 0 && <Chip tone="amber">{missingReceipt} missing receipts</Chip>}
        {missingPurpose > 0 && <Chip tone="amber">{missingPurpose} missing business purpose</Chip>}
        {missingReceipt === 0 && missingPurpose === 0 && filtered.length > 0 && (
          <Chip tone="emerald">Documentation complete for this selection</Chip>
        )}
      </div>

      {/* Yearly summary by category */}
      {byCategory.length === 0 ? (
        <EmptyState title="No records in this selection" hint="Widen the filters, or log expenses first." />
      ) : (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-sky-200/50 mb-2">
            Summary by category {from || to ? "(custom range)" : `— ${year}`}
          </div>
          <div className="space-y-1.5 max-w-xl">
            {byCategory.map(([name, cents]) => {
              const pct = totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0;
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 text-[12.5px] text-sky-100/80 truncate">{name}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/6 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: "linear-gradient(90deg,#38bdf8,#a78bfa)" }} />
                  </div>
                  <span className="w-24 text-right text-[12.5px] font-bold text-white tabular-nums">{dollars(cents)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
