"use client";
/**
 * expenses-section.tsx — CP-112
 *
 * The transaction ledger. One-time purchases live here, and every
 * payment generated from a recurring bill lands here too (that's the
 * immutable history the charts are built from). A transaction can be
 * split across categories — the splits must add up to the total before
 * the editor lets you save.
 */
import { useMemo, useState } from "react";
import { ReceiptText, Plus, Pencil, Trash2, Loader2, Archive, ArchiveRestore, SplitSquareHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type {
  ExpenseTransaction, ExpenseSplit, ExpenseCategory, ExpenseDocument, AgencyAdminLite,
} from "@/lib/types/database";
import { dollars, dateLabel, parseMoneyToCents, isValidIsoDate } from "@/lib/founder-hq";
import { TAX_REVIEW_STATUSES, REIMBURSEMENT_STATUSES, centsToDecimal } from "@/lib/bookkeeping";
import { GlassPanel, Chip, HqButton, HqModal, Field, EmptyState, fieldCls, areaCls, selectCls } from "@/components/agency/hq/hq-ui";
import { insertRow, guardedUpdate, deleteRow } from "@/components/agency/hq/hq-data";
import { ReceiptAttach, ReceiptChip } from "./receipt-attach";

export function ExpensesSection({
  txns, splits, categories, businesses, admins, documents, todayIso,
  onTxns, onSplits, onDocument, onReload,
}: {
  txns: ExpenseTransaction[];
  splits: ExpenseSplit[];
  categories: ExpenseCategory[];
  businesses: { id: string; name: string }[];
  admins: AgencyAdminLite[];
  documents: Map<string, ExpenseDocument>;
  todayIso: string;
  onTxns: (rows: ExpenseTransaction[]) => void;
  onSplits: (rows: ExpenseSplit[]) => void;
  onDocument: (doc: ExpenseDocument) => void;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [editor, setEditor] = useState<{ txn: ExpenseTransaction | null } | null>(null);
  const [deleting, setDeleting] = useState<ExpenseTransaction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fType, setFType] = useState("one_time");   // one_time | recurring | all
  const [fCat, setFCat] = useState("");
  const [fReview, setFReview] = useState("");
  const [fReceipt, setFReceipt] = useState("");
  const [fArchived, setFArchived] = useState("live");
  const [q, setQ] = useState("");

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const splitTxnIds = useMemo(() => new Set(splits.map(s => s.transaction_id)), [splits]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txns
      .filter(t => (fArchived === "live" ? !t.archived : fArchived === "archived" ? t.archived : true))
      .filter(t => fType === "all" ? true : fType === "one_time" ? !t.bill_id : !!t.bill_id)
      .filter(t => !fCat || t.category_id === fCat)
      .filter(t => !fReview || t.tax_review_status === fReview)
      .filter(t => fReceipt === "" ? true : fReceipt === "missing" ? !t.document_id : !!t.document_id)
      .filter(t => !needle
        || t.vendor.toLowerCase().includes(needle)
        || (t.description ?? "").toLowerCase().includes(needle)
        || (t.purpose ?? "").toLowerCase().includes(needle))
      .sort((a, b) => (b.paid_date ?? b.txn_date).localeCompare(a.paid_date ?? a.txn_date))
      .slice(0, 300);
  }, [txns, fType, fCat, fReview, fReceipt, fArchived, q]);

  const missingReceipts = useMemo(
    () => txns.filter(t => !t.archived && t.status === "paid" && !t.document_id).length,
    [txns]);

  function replaceTxn(row: ExpenseTransaction) {
    const exists = txns.some(t => t.id === row.id);
    onTxns(exists ? txns.map(t => (t.id === row.id ? row : t)) : [row, ...txns]);
  }

  async function quickReview(t: ExpenseTransaction, status: ExpenseTransaction["tax_review_status"]) {
    setBusyId(t.id);
    const res = await guardedUpdate<ExpenseTransaction>("expense_transactions", t.id, t.updated_at, { tax_review_status: status });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't update — " + res.error); return; }
    if (res.conflict) { toast.info("This expense changed under you — refreshed."); onReload(); return; }
    replaceTxn(res.row);
  }

  async function toggleArchive(t: ExpenseTransaction) {
    setBusyId(t.id);
    const res = await guardedUpdate<ExpenseTransaction>("expense_transactions", t.id, t.updated_at, { archived: !t.archived });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't update — " + res.error); return; }
    if (res.conflict) { toast.info("This expense changed under you — refreshed."); onReload(); return; }
    replaceTxn(res.row);
    toast.success(res.row.archived ? "Archived (kept for the records)" : "Restored");
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("expense_transactions", deleting.id);
    if (res.error) { toast.error("Delete failed — " + res.error); return; }
    onTxns(txns.filter(t => t.id !== deleting.id));
    onSplits(splits.filter(s => s.transaction_id !== deleting.id));
    setDeleting(null);
    toast.success("Expense deleted");
  }

  return (
    <GlassPanel
      id="bk-expenses"
      title="Expenses & Payments"
      subtitle="One-time purchases plus every recorded recurring payment. History is never rewritten."
      icon={<ReceiptText className="h-4 w-4" />}
      right={
        <HqButton onClick={() => setEditor({ txn: null })}>
          <Plus className="h-4 w-4" /> Add expense
        </HqButton>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <input className={fieldCls + " !h-8 !w-44 text-[12px]"} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search vendor / purpose…" aria-label="Search expenses" />
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fType} onChange={e => setFType(e.target.value)} aria-label="Type">
          <option value="one_time">One-time</option>
          <option value="recurring">From recurring bills</option>
          <option value="all">All transactions</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fCat} onChange={e => setFCat(e.target.value)} aria-label="Category">
          <option value="">Any category</option>
          {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fReview} onChange={e => setFReview(e.target.value)} aria-label="Tax review">
          <option value="">Any review status</option>
          {TAX_REVIEW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fReceipt} onChange={e => setFReceipt(e.target.value)} aria-label="Receipts">
          <option value="">Receipts: any</option>
          <option value="missing">Missing receipt</option>
          <option value="has">Has receipt</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fArchived} onChange={e => setFArchived(e.target.value)} aria-label="Archived">
          <option value="live">Active records</option>
          <option value="archived">Archived</option>
          <option value="all">Both</option>
        </select>
        {missingReceipts > 0 && (
          <button onClick={() => { setFReceipt("missing"); setFType("all"); }}
            className="ml-auto">
            <Chip tone="amber">{missingReceipts} paid without a receipt</Chip>
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-4 w-4" />}
          title="Nothing here yet"
          hint="Log a purchase — date, vendor, amount, what it was for, and snap the receipt."
        />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[920px] text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-sky-200/40">
                <th className="pb-2 pr-3">Date</th>
                <th className="pb-2 pr-3">Vendor</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3 text-right">Amount</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Tax review</th>
                <th className="pb-2 pr-3">Receipt</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => {
                const cat = t.category_id ? catById.get(t.category_id) : null;
                const doc = t.document_id ? documents.get(t.document_id) : null;
                const isSplit = splitTxnIds.has(t.id);
                return (
                  <tr key={t.id} className="align-middle">
                    <td className="py-2.5 pr-3 border-t border-white/6 text-[12px] text-sky-100/70 tabular-nums whitespace-nowrap">
                      {dateLabel(t.paid_date ?? t.txn_date)}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      <button onClick={() => setEditor({ txn: t })} className="text-left">
                        <span className={"font-semibold " + (t.archived ? "text-sky-200/40" : "text-white hover:text-sky-300")}>{t.vendor}</span>
                        <span className="block text-[11px] text-sky-200/45 truncate max-w-[220px]">
                          {t.bill_id ? "recurring · " : ""}{t.description ?? t.purpose ?? "—"}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      <span className="inline-flex items-center gap-1.5">
                        {cat ? <Chip tone={cat.is_hosting ? "sky" : "slate"}>{cat.name}</Chip> : <span className="text-sky-200/25 text-[12px]">—</span>}
                        {isSplit && <span title="Split across categories"><SplitSquareHorizontal className="h-3.5 w-3.5 text-violet-300" /></span>}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6 text-right font-bold text-white tabular-nums whitespace-nowrap">
                      {dollars(t.amount_cents)}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      {t.status === "paid" && <Chip tone="emerald">Paid</Chip>}
                      {t.status === "scheduled" && <Chip tone="amber">Scheduled</Chip>}
                      {t.status === "cancelled" && <Chip tone="slate">Cancelled</Chip>}
                      {t.archived && <Chip tone="slate" className="ml-1">Archived</Chip>}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      <select
                        className={selectCls + " !h-7 !w-auto text-[11px]"}
                        value={t.tax_review_status}
                        disabled={busyId === t.id}
                        aria-label={`Tax review status for ${t.vendor}`}
                        onChange={e => quickReview(t, e.target.value as ExpenseTransaction["tax_review_status"])}
                      >
                        {TAX_REVIEW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6"><ReceiptChip doc={doc} /></td>
                    <td className="py-2.5 border-t border-white/6">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditor({ txn: t })} aria-label={`Edit ${t.vendor}`}
                          className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => toggleArchive(t)} aria-label={t.archived ? "Restore" : "Archive"}
                          title={t.archived ? "Restore" : "Archive (keep for records)"}
                          className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                          {t.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => setDeleting(t)} aria-label={`Delete ${t.vendor}`} title="Delete permanently"
                          className="h-7 w-7 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <ExpenseEditor
          txn={editor.txn}
          existingSplits={editor.txn ? splits.filter(s => s.transaction_id === editor.txn!.id) : []}
          categories={categories}
          businesses={businesses}
          admins={admins}
          documents={documents}
          todayIso={todayIso}
          onDocument={onDocument}
          onClose={() => setEditor(null)}
          onSaved={(row, newSplits) => {
            setEditor(null);
            replaceTxn(row);
            onSplits([...splits.filter(s => s.transaction_id !== row.id), ...newSplits]);
          }}
          onConflict={() => { setEditor(null); onReload(); }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this expense?"
          description={`${deleting.vendor} — ${dollars(deleting.amount_cents)} will be permanently removed from the books. For paid expenses, Archive is usually the right call so the year still adds up.`}
          destructiveLabel="Delete expense"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </GlassPanel>
  );
}

/* ────────────────────────── Expense editor ──────────────────────── */

type SplitDraft = { category_id: string; amount: string; note: string };

function ExpenseEditor({
  txn, existingSplits, categories, businesses, admins, documents, todayIso,
  onDocument, onClose, onSaved, onConflict,
}: {
  txn: ExpenseTransaction | null;
  existingSplits: ExpenseSplit[];
  categories: ExpenseCategory[];
  businesses: { id: string; name: string }[];
  admins: AgencyAdminLite[];
  documents: Map<string, ExpenseDocument>;
  todayIso: string;
  onDocument: (doc: ExpenseDocument) => void;
  onClose: () => void;
  onSaved: (row: ExpenseTransaction, splits: ExpenseSplit[]) => void;
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const [txnDate, setTxnDate] = useState(txn?.txn_date ?? todayIso);
  const [paidDate, setPaidDate] = useState(txn?.paid_date ?? todayIso);
  const [vendor, setVendor] = useState(txn?.vendor ?? "");
  const [amount, setAmount] = useState(txn && txn.amount_cents > 0 ? (txn.amount_cents / 100).toString() : "");
  const [categoryId, setCategoryId] = useState(txn?.category_id ?? "");
  const [description, setDescription] = useState(txn?.description ?? "");
  const [purpose, setPurpose] = useState(txn?.purpose ?? "");
  const [payLabel, setPayLabel] = useState(txn?.payment_method_label ?? "");
  const [bizId, setBizId] = useState(txn?.business_id ?? "");
  const [project, setProject] = useState(txn?.project_label ?? "");
  const [founderId, setFounderId] = useState(txn?.founder_user_id ?? "");
  const [reimb, setReimb] = useState(txn?.reimbursement_status ?? "none");
  const [review, setReview] = useState(txn?.tax_review_status ?? "unreviewed");
  const [status, setStatus] = useState<ExpenseTransaction["status"]>(txn?.status ?? "paid");
  const [doc, setDoc] = useState<ExpenseDocument | null>(txn?.document_id ? (documents.get(txn.document_id) ?? null) : null);
  const [notes, setNotes] = useState(txn?.notes ?? "");
  const [splitOn, setSplitOn] = useState(existingSplits.length > 0);
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>(
    existingSplits.length > 0
      ? existingSplits.map(s => ({ category_id: s.category_id ?? "", amount: (s.amount_cents / 100).toString(), note: s.note ?? "" }))
      : [{ category_id: "", amount: "", note: "" }, { category_id: "", amount: "", note: "" }]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalCents = parseMoneyToCents(amount || "") ?? 0;
  const splitCents = splitDrafts.map(d => parseMoneyToCents(d.amount || "") ?? 0);
  const splitSum = splitCents.reduce((a, b) => a + b, 0);
  const splitOk = !splitOn || (splitSum === totalCents && splitDrafts.every(d => d.category_id && (parseMoneyToCents(d.amount || "") ?? 0) > 0));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!vendor.trim()) e.vendor = "Who was paid?";
    if (parseMoneyToCents(amount || "") == null || totalCents <= 0) e.amount = "Enter the amount.";
    if (!isValidIsoDate(txnDate)) e.txnDate = "Pick the transaction date.";
    if (paidDate && !isValidIsoDate(paidDate)) e.paidDate = "Date looks wrong.";
    if (status === "paid" && !paidDate) e.paidDate = "When was it paid?";
    if (/\b\d{13,19}\b/.test(payLabel.replace(/[\s-]/g, ""))) {
      e.payLabel = "Never store a full card number — use a label like “Business Visa •1234”.";
    }
    if (splitOn && splitSum !== totalCents) {
      e.splits = `Splits add to $${centsToDecimal(splitSum)} but the expense is $${centsToDecimal(totalCents)} — they must match exactly.`;
    }
    if (splitOn && !splitDrafts.every(d => d.category_id)) e.splits = "Every split needs a category.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const values = {
      txn_date: txnDate,
      paid_date: status === "paid" ? (paidDate || todayIso) : (paidDate || null),
      vendor: vendor.trim(),
      description: description.trim() || null,
      category_id: categoryId || null,
      amount_cents: totalCents,
      payment_method_label: payLabel.trim() || null,
      business_id: bizId || null,
      project_label: project.trim() || null,
      founder_user_id: founderId || null,
      purpose: purpose.trim() || null,
      reimbursement_status: reimb,
      tax_review_status: review,
      status,
      document_id: doc?.id ?? null,
      notes: notes.trim() || null,
    };
    const res = txn
      ? await guardedUpdate<ExpenseTransaction>("expense_transactions", txn.id, txn.updated_at, values)
      : await insertRow<ExpenseTransaction>("expense_transactions", values);
    if (res.error !== undefined) { setBusy(false); toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { setBusy(false); toast.info("Someone else edited this expense — refreshed."); onConflict(); return; }

    // Replace splits for this transaction (delete + insert = the whole set).
    const supabase = createClient();
    let savedSplits: ExpenseSplit[] = [];
    await supabase.from("expense_splits").delete().eq("transaction_id", res.row.id);
    if (splitOn) {
      const payload = splitDrafts.map(d => ({
        transaction_id: res.row.id,
        category_id: d.category_id,
        amount_cents: parseMoneyToCents(d.amount) ?? 0,
        note: d.note.trim() || null,
      }));
      const { data: ins, error: splitErr } = await supabase.from("expense_splits").insert(payload).select();
      if (splitErr) { setBusy(false); toast.error("Expense saved but splits failed — " + splitErr.message); onSaved(res.row, []); return; }
      savedSplits = (ins ?? []) as ExpenseSplit[];
    }
    setBusy(false);
    if (doc) onDocument(doc);
    toast.success(txn ? "Expense updated" : "Expense recorded");
    onSaved(res.row, savedSplits);
  }

  return (
    <HqModal wide title={txn ? "Edit expense" : "Add a one-time expense"}
      subtitle="Evidence for the accountant — amounts, purpose, receipt. Tax treatment stays their call."
      onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Transaction date" required error={errors.txnDate}>
            <input type="date" className={fieldCls} value={txnDate} onChange={e => setTxnDate(e.target.value)} />
          </Field>
          <Field label="Paid date" error={errors.paidDate}>
            <input type="date" className={fieldCls} value={paidDate ?? ""} onChange={e => setPaidDate(e.target.value)} />
          </Field>
          <Field label="Vendor / payee" required error={errors.vendor}>
            <input className={fieldCls} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Office Depot" />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
              <input className={fieldCls + " pl-6"} value={amount} inputMode="decimal"
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="84.12" />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Category">
            <select className={selectCls} value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={splitOn}>
              <option value="">{splitOn ? "Split below" : "Uncategorized"}</option>
              {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as ExpenseTransaction["status"])}>
              <option value="paid">Paid</option>
              <option value="scheduled">Scheduled (not paid yet)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Paid with" hint="Label only — never a full card number." error={errors.payLabel}>
            <input className={fieldCls} value={payLabel} onChange={e => setPayLabel(e.target.value)} placeholder="Business Visa •1234" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Description">
            <input className={fieldCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="What was bought" />
          </Field>
          <Field label="Business purpose" hint="Why this was a business expense — the accountant reads this.">
            <input className={fieldCls} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Demo phones for door-to-door pitches" />
          </Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Client / app (optional)">
            <select className={selectCls} value={bizId} onChange={e => setBizId(e.target.value)}>
              <option value="">None</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Project label">
            <input className={fieldCls} value={project} onChange={e => setProject(e.target.value)} placeholder="Media day" />
          </Field>
          <Field label="Founder / buyer">
            <select className={selectCls} value={founderId} onChange={e => setFounderId(e.target.value)}>
              <option value="">—</option>
              {admins.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>)}
            </select>
          </Field>
          <Field label="Reimbursement">
            <select className={selectCls} value={reimb} onChange={e => setReimb(e.target.value as ExpenseTransaction["reimbursement_status"])}>
              {REIMBURSEMENT_STATUSES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Tax review" hint="Workflow status only — the app never decides deductibility.">
          <select className={selectCls} value={review} onChange={e => setReview(e.target.value as ExpenseTransaction["tax_review_status"])}>
            {TAX_REVIEW_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>

        {/* Splits */}
        <div className="rounded-xl p-3" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.22)" }}>
          <label className="flex items-center gap-2 text-[12px] font-bold text-violet-200 cursor-pointer">
            <input type="checkbox" checked={splitOn} onChange={e => setSplitOn(e.target.checked)} className="accent-violet-400" />
            <SplitSquareHorizontal className="h-3.5 w-3.5" /> Split across categories
          </label>
          {splitOn && (
            <div className="mt-2.5 space-y-2">
              {splitDrafts.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className={selectCls + " !h-8 !w-auto text-[12px] flex-1 min-w-[140px]"} value={d.category_id}
                    aria-label={`Split ${i + 1} category`}
                    onChange={e => setSplitDrafts(ds => ds.map((x, xi) => xi === i ? { ...x, category_id: e.target.value } : x))}>
                    <option value="">Category…</option>
                    {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-200/40 text-xs">$</span>
                    <input className={fieldCls + " !h-8 pl-5 text-[12px] text-right"} value={d.amount} inputMode="decimal"
                      aria-label={`Split ${i + 1} amount`}
                      onChange={e => setSplitDrafts(ds => ds.map((x, xi) => xi === i ? { ...x, amount: e.target.value.replace(/[^0-9.]/g, "") } : x))} />
                  </div>
                  <input className={fieldCls + " !h-8 text-[12px] flex-1 min-w-[100px]"} value={d.note} placeholder="Note"
                    aria-label={`Split ${i + 1} note`}
                    onChange={e => setSplitDrafts(ds => ds.map((x, xi) => xi === i ? { ...x, note: e.target.value } : x))} />
                  {splitDrafts.length > 2 && (
                    <button onClick={() => setSplitDrafts(ds => ds.filter((_, xi) => xi !== i))} aria-label="Remove split"
                      className="h-8 w-8 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <HqButton kind="ghost" className="h-8 text-[12px]"
                  onClick={() => setSplitDrafts(ds => [...ds, { category_id: "", amount: "", note: "" }])}>
                  <Plus className="h-3.5 w-3.5" /> Add split
                </HqButton>
                <span className={"text-[12px] font-bold tabular-nums " + (splitOk ? "text-emerald-300" : "text-amber-300")}>
                  ${centsToDecimal(splitSum)} of ${centsToDecimal(totalCents)}
                </span>
              </div>
              {errors.splits && <p className="text-[11px] text-amber-300">{errors.splits}</p>}
            </div>
          )}
        </div>

        <ReceiptAttach value={doc} onChange={setDoc} />
        <Field label="Notes">
          <textarea className={areaCls} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : txn ? "Save changes" : "Record expense"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}
