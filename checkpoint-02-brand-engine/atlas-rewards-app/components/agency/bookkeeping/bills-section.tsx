"use client";
/**
 * bills-section.tsx — CP-112
 *
 * Recurring bills: the templates for repeating business expenses. The
 * same component renders two sections of the Bookkeeping page:
 *   • hosting mode — only hosting/infrastructure categories, plus the
 *     per-client hosting economics table (honest: shared bills stay
 *     agency-wide, unallocated costs are labeled, nothing is invented)
 *   • all mode — every recurring bill with the full filter set
 *
 * Recurrence model (deliberately boring and safe):
 *   The bill row is only the TEMPLATE. "Mark paid" calls the
 *   pay_recurring_bill RPC, which writes ONE payment transaction for the
 *   current occurrence (a DB unique index makes double-clicks and
 *   concurrent admins a no-op) and advances next_due_date. Editing the
 *   template's amount affects FUTURE occurrences only — every past
 *   payment keeps the amount that was actually paid.
 */
import { useMemo, useState } from "react";
import {
  Server, Plus, Pencil, Trash2, Loader2, CheckCircle2, ExternalLink,
  RotateCcw, Ban, AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { RecurringBill, ExpenseCategory, ExpenseTransaction, ExpenseDocument } from "@/lib/types/database";
import { dollars, dateLabel, parseMoneyToCents, isValidIsoDate, isValidHttpUrl } from "@/lib/founder-hq";
import {
  FREQUENCIES, frequencyLabel, monthlyEquivalentCents, billDueState, clientHostingEconomics,
} from "@/lib/bookkeeping";
import { GlassPanel, Chip, HqButton, HqModal, Field, EmptyState, fieldCls, areaCls, selectCls } from "@/components/agency/hq/hq-ui";
import { insertRow, guardedUpdate, deleteRow } from "@/components/agency/hq/hq-data";
import { ReceiptAttach, ReceiptChip } from "./receipt-attach";

export function BillsSection({
  hosting, bills, categories, businesses, documents, mrrByBusiness, todayIso,
  onBills, onTxnAdded, onDocument, onReload,
}: {
  hosting: boolean;
  bills: RecurringBill[];
  categories: ExpenseCategory[];
  businesses: { id: string; name: string }[];
  documents: Map<string, ExpenseDocument>;
  mrrByBusiness: { business_id: string; business_name: string; monthly_cents: number; status: string }[];
  todayIso: string;
  onBills: (rows: RecurringBill[]) => void;
  onTxnAdded: (txn: ExpenseTransaction) => void;
  onDocument: (doc: ExpenseDocument) => void;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [editor, setEditor] = useState<{ bill: RecurringBill | null } | null>(null);
  const [deleting, setDeleting] = useState<RecurringBill | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState("active");   // active | due_soon | overdue | auto | cancelled | all
  const [fFreq, setFFreq] = useState("");
  const [fCat, setFCat] = useState("");
  const [q, setQ] = useState("");

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const bizName = useMemo(() => new Map(businesses.map(b => [b.id, b.name])), [businesses]);

  const scoped = useMemo(
    () => bills.filter(b => {
      const isH = !!b.category_id && (catById.get(b.category_id)?.is_hosting ?? false);
      return hosting ? isH : true;
    }),
    [bills, hosting, catById]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped
      .filter(b => {
        const st = billDueState(b, todayIso);
        if (view === "active") return b.status === "active";
        if (view === "due_soon") return st === "due_soon";
        if (view === "overdue") return st === "overdue";
        if (view === "auto") return b.status === "active" && b.auto_renew;
        if (view === "cancelled") return b.status === "cancelled";
        return true;
      })
      .filter(b => !fFreq || b.frequency === fFreq)
      .filter(b => !fCat || b.category_id === fCat)
      .filter(b => !needle
        || b.vendor.toLowerCase().includes(needle)
        || (b.service_name ?? "").toLowerCase().includes(needle))
      .sort((a, b) => (a.status === b.status)
        ? a.next_due_date.localeCompare(b.next_due_date)
        : a.status === "active" ? -1 : 1);
  }, [scoped, view, fFreq, fCat, q, todayIso]);

  const monthlyTotal = useMemo(
    () => scoped.filter(b => b.status === "active")
      .reduce((s, b) => s + monthlyEquivalentCents(b.amount_cents, b.frequency), 0),
    [scoped]);

  // Renewal heads-up: upcoming (14d) renewals worth ≥ $50/occurrence.
  const bigRenewals = useMemo(
    () => scoped.filter(b => b.status === "active" && billDueState(b, todayIso) === "due_soon" && b.amount_cents >= 5000),
    [scoped, todayIso]);

  const economics = useMemo(
    () => (hosting ? clientHostingEconomics(bills, categories, mrrByBusiness) : null),
    [hosting, bills, categories, mrrByBusiness]);

  function replaceBill(row: RecurringBill) {
    const exists = bills.some(b => b.id === row.id);
    onBills(exists ? bills.map(b => (b.id === row.id ? row : b)) : [row, ...bills]);
  }

  async function markPaid(bill: RecurringBill) {
    setBusyId(bill.id);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("pay_recurring_bill", { p_bill_id: bill.id });
    setBusyId(null);
    if (error) { toast.error("Couldn't mark paid — " + error.message); return; }
    const txn = (Array.isArray(data) ? data[0] : data) as ExpenseTransaction | null;
    if (txn) onTxnAdded(txn);
    onReload(); // pull the advanced next_due_date
    toast.success(`Paid ${dollars(txn?.amount_cents ?? bill.amount_cents)} — next due date advanced`);
  }

  async function setStatus(bill: RecurringBill, status: RecurringBill["status"]) {
    setBusyId(bill.id);
    const res = await guardedUpdate<RecurringBill>("recurring_bills", bill.id, bill.updated_at, {
      status, cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
    });
    setBusyId(null);
    if (res.error !== undefined) { toast.error("Couldn't update — " + res.error); return; }
    if (res.conflict) { toast.info("This bill changed under you — refreshed."); onReload(); return; }
    replaceBill(res.row);
    toast.success(status === "cancelled"
      ? "Subscription cancelled — past payments are kept, no future charges expected"
      : "Reactivated");
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRow("recurring_bills", deleting.id);
    if (res.error) { toast.error("Delete failed — " + res.error); return; }
    onBills(bills.filter(b => b.id !== deleting.id));
    setDeleting(null);
    toast.success("Bill template deleted (its past payments are preserved)");
  }

  const title = hosting ? "Hosting & Infrastructure" : "Recurring Bills";

  return (
    <GlassPanel
      id={hosting ? "bk-hosting" : "bk-bills"}
      title={title}
      subtitle={hosting
        ? `What it costs to run the client apps. ${dollars(monthlyTotal)}/mo in active commitments (monthly-equivalent).`
        : `Repeating business expenses. ${dollars(monthlyTotal)}/mo in active commitments (monthly-equivalent).`}
      icon={<Server className="h-4 w-4" />}
      right={
        <HqButton onClick={() => setEditor({ bill: null })}>
          <Plus className="h-4 w-4" /> {hosting ? "Add hosting cost" : "Add recurring bill"}
        </HqButton>
      }
    >
      {bigRenewals.length > 0 && (
        <div className="rounded-xl px-3.5 py-2.5 mb-3 flex flex-wrap items-center gap-2"
          style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.28)" }}>
          <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />
          <span className="text-[12.5px] text-amber-100/90">
            Renewing within 14 days:{" "}
            {bigRenewals.slice(0, 3).map((b, i) => (
              <b key={b.id}>{i > 0 ? " · " : ""}{b.vendor} {dollars(b.amount_cents)} ({dateLabel(b.next_due_date)})</b>
            ))}
            {bigRenewals.length > 3 && ` +${bigRenewals.length - 3} more`}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <input className={fieldCls + " !h-8 !w-44 text-[12px]"} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search vendor / service…" aria-label="Search bills" />
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={view} onChange={e => setView(e.target.value)} aria-label="View">
          <option value="active">Active</option>
          <option value="due_soon">Due soon (14d)</option>
          <option value="overdue">Overdue</option>
          <option value="auto">Auto-renewing</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fFreq} onChange={e => setFFreq(e.target.value)} aria-label="Frequency">
          <option value="">Any frequency</option>
          {FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select className={selectCls + " !h-8 !w-auto text-[12px]"} value={fCat} onChange={e => setFCat(e.target.value)} aria-label="Category">
          <option value="">Any category</option>
          {categories.filter(c => c.is_active && (!hosting || c.is_hosting)).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Server className="h-4 w-4" />}
          title={hosting ? "No hosting costs tracked yet" : "No recurring bills here"}
          hint={hosting
            ? "Add what you pay for hosting, databases, domains, email/SMS, APIs — the margin math starts here."
            : "Track every subscription the business pays so nothing renews by surprise."}
        />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[900px] text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-sky-200/40">
                <th className="pb-2 pr-3">Vendor / service</th>
                <th className="pb-2 pr-3">Category</th>
                <th className="pb-2 pr-3 text-right">Amount</th>
                <th className="pb-2 pr-3 text-right">≈ / mo</th>
                <th className="pb-2 pr-3">Next due</th>
                <th className="pb-2 pr-3">{hosting ? "Client" : "Paid with"}</th>
                <th className="pb-2 pr-3">Receipt</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(b => {
                const st = billDueState(b, todayIso);
                const cat = b.category_id ? catById.get(b.category_id) : null;
                const doc = b.document_id ? documents.get(b.document_id) : null;
                return (
                  <tr key={b.id} className="align-middle">
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      <button onClick={() => setEditor({ bill: b })} className="text-left">
                        <span className={"font-semibold " + (b.status === "cancelled" ? "text-sky-200/40 line-through" : "text-white hover:text-sky-300")}>
                          {b.vendor}
                        </span>
                        <span className="block text-[11px] text-sky-200/45 truncate max-w-[220px]">
                          {b.service_name ?? b.description ?? "—"}
                          {b.auto_renew && b.status === "active" ? " · auto-renews" : ""}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      {cat ? <Chip tone={cat.is_hosting ? "sky" : "slate"}>{cat.name}</Chip> : <span className="text-sky-200/25 text-[12px]">—</span>}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6 text-right whitespace-nowrap">
                      <span className="font-bold text-white tabular-nums">{dollars(b.amount_cents)}</span>
                      <span className="text-[11px] text-sky-200/45"> {frequencyLabel(b.frequency).toLowerCase()}</span>
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6 text-right tabular-nums text-sky-300 font-semibold whitespace-nowrap">
                      {dollars(monthlyEquivalentCents(b.amount_cents, b.frequency))}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6 whitespace-nowrap">
                      {b.status === "cancelled" ? (
                        <Chip tone="slate">Cancelled</Chip>
                      ) : st === "overdue" ? (
                        <Chip tone="rose">Overdue · {dateLabel(b.next_due_date)}</Chip>
                      ) : st === "due_soon" ? (
                        <Chip tone="amber">{dateLabel(b.next_due_date)}</Chip>
                      ) : (
                        <span className="text-[12px] text-sky-100/70 tabular-nums">{dateLabel(b.next_due_date)}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6 text-[12px] text-sky-100/70 whitespace-nowrap">
                      {hosting
                        ? (b.business_id
                            ? <>{bizName.get(b.business_id) ?? "Client"}{b.allocation_pct != null ? ` · ${b.allocation_pct}%` : ""}</>
                            : <Chip tone="slate">Shared</Chip>)
                        : (b.payment_method_label ?? "—")}
                    </td>
                    <td className="py-2.5 pr-3 border-t border-white/6">
                      <span className="inline-flex items-center gap-2">
                        <ReceiptChip doc={doc} />
                        {b.billing_url && isValidHttpUrl(b.billing_url) && (
                          <a href={b.billing_url} target="_blank" rel="noopener noreferrer" title="Open billing dashboard"
                            className="text-sky-300/70 hover:text-sky-200"><ExternalLink className="h-3.5 w-3.5" /></a>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 border-t border-white/6">
                      <div className="flex items-center justify-end gap-1">
                        {b.status === "active" && (
                          <button onClick={() => markPaid(b)} disabled={busyId === b.id} title={`Mark ${dateLabel(b.next_due_date)} paid`}
                            aria-label={`Mark ${b.vendor} paid`}
                            className="h-7 px-2 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 flex items-center gap-1 text-emerald-300 text-[11px] font-bold">
                            {busyId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Paid
                          </button>
                        )}
                        <button onClick={() => setEditor({ bill: b })} aria-label={`Edit ${b.vendor}`}
                          className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {b.status === "active" ? (
                          <button onClick={() => setStatus(b, "cancelled")} title="Cancel subscription (keeps history)" aria-label={`Cancel ${b.vendor}`}
                            className="h-7 w-7 rounded-md bg-white/5 hover:bg-amber-500/15 flex items-center justify-center text-sky-200/60 hover:text-amber-300">
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => setStatus(b, "active")} title="Reactivate" aria-label={`Reactivate ${b.vendor}`}
                            className="h-7 w-7 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/60">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => setDeleting(b)} aria-label={`Delete ${b.vendor}`} title="Delete template (past payments kept)"
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

      {/* Hosting economics — only where allocation data honestly exists */}
      {hosting && economics && (economics.rows.length > 0 || economics.sharedMonthlyCents > 0) && (
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-widest text-sky-200/50 mb-2">
            Per-client hosting economics
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            <Chip tone="slate">Shared / unallocated: {dollars(economics.sharedMonthlyCents)}/mo</Chip>
            {economics.sharedMonthlyCents > 0 && (
              <span className="text-[11px] text-sky-200/40 self-center">
                Shared costs stay agency-wide — per-client margins below EXCLUDE them, so they're estimates.
              </span>
            )}
          </div>
          {economics.rows.length === 0 ? (
            <p className="text-[12px] text-sky-200/40">No client-specific hosting costs tracked yet — assign a bill to a client to see its economics.</p>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {economics.rows.map(r => (
                <div key={r.businessId} className={"rounded-xl px-3.5 py-2.5 " + (r.flag ? "border border-amber-400/30 bg-amber-400/[0.04]" : "border border-white/8 bg-white/[0.03]")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{r.businessName}</span>
                    {r.flag && <Chip tone="amber">High cost</Chip>}
                  </div>
                  <div className="text-[12px] text-sky-200/60 mt-1 tabular-nums">
                    MRR {dollars(r.mrrCents)} · hosting {dollars(r.hostingMonthlyCents)}/mo
                    {r.marginPct != null && <> · est. margin {r.marginPct}%</>}
                    {r.marginPct == null && <> · margin n/a</>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editor && (
        <BillEditor
          hosting={hosting}
          bill={editor.bill}
          categories={categories}
          businesses={businesses}
          documents={documents}
          onDocument={onDocument}
          onClose={() => setEditor(null)}
          onSaved={row => { setEditor(null); replaceBill(row); }}
          onConflict={() => { setEditor(null); onReload(); }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this bill template?"
          description={`“${deleting.vendor}” will be removed as a recurring bill. Payments already recorded are PRESERVED in the expense history. If the subscription just ended, Cancel keeps a cleaner record.`}
          destructiveLabel="Delete template"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </GlassPanel>
  );
}

/* ─────────────────────────── Bill editor ────────────────────────── */

function BillEditor({ hosting, bill, categories, businesses, documents, onDocument, onClose, onSaved, onConflict }: {
  hosting: boolean;
  bill: RecurringBill | null;
  categories: ExpenseCategory[];
  businesses: { id: string; name: string }[];
  documents: Map<string, ExpenseDocument>;
  onDocument: (doc: ExpenseDocument) => void;
  onClose: () => void;
  onSaved: (row: RecurringBill) => void;
  onConflict: () => void;
}) {
  const { toast } = useToast();
  const cats = categories.filter(c => c.is_active && (!hosting || c.is_hosting || c.id === bill?.category_id));
  const [vendor, setVendor] = useState(bill?.vendor ?? "");
  const [service, setService] = useState(bill?.service_name ?? "");
  const [description, setDescription] = useState(bill?.description ?? "");
  const [categoryId, setCategoryId] = useState(bill?.category_id ?? (hosting ? (cats[0]?.id ?? "") : ""));
  const [amount, setAmount] = useState(bill && bill.amount_cents > 0 ? (bill.amount_cents / 100).toString() : "");
  const [frequency, setFrequency] = useState(bill?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(bill?.start_date ?? "");
  const [nextDue, setNextDue] = useState(bill?.next_due_date ?? "");
  const [endDate, setEndDate] = useState(bill?.end_date ?? "");
  const [autoRenew, setAutoRenew] = useState(bill?.auto_renew ?? true);
  const [payLabel, setPayLabel] = useState(bill?.payment_method_label ?? "");
  const [bizId, setBizId] = useState(bill?.business_id ?? "");
  const [allocation, setAllocation] = useState(bill?.allocation_pct != null ? String(bill.allocation_pct) : "");
  const [billingUrl, setBillingUrl] = useState(bill?.billing_url ?? "");
  const [doc, setDoc] = useState<ExpenseDocument | null>(bill?.document_id ? (documents.get(bill.document_id) ?? null) : null);
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!vendor.trim()) e.vendor = "Who do we pay?";
    if (parseMoneyToCents(amount || "") == null) e.amount = "Enter the amount per billing period.";
    if (!isValidIsoDate(nextDue)) e.nextDue = "When is the next charge?";
    if (startDate && !isValidIsoDate(startDate)) e.startDate = "Date looks wrong.";
    if (endDate && !isValidIsoDate(endDate)) e.endDate = "Date looks wrong.";
    if (billingUrl.trim() && !isValidHttpUrl(billingUrl)) e.billingUrl = "Must be a valid https:// link.";
    if (allocation.trim()) {
      const a = parseInt(allocation, 10);
      if (!Number.isFinite(a) || a < 0 || a > 100) e.allocation = "0–100.";
    }
    if (/\b\d{13,19}\b/.test(payLabel.replace(/[\s-]/g, ""))) {
      e.payLabel = "Never store a full card number — use a label like “Business Visa •1234”.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);
    const values = {
      vendor: vendor.trim(),
      service_name: service.trim() || null,
      description: description.trim() || null,
      category_id: categoryId || null,
      amount_cents: parseMoneyToCents(amount) ?? 0,
      frequency,
      start_date: startDate || null,
      next_due_date: nextDue,
      end_date: endDate || null,
      auto_renew: autoRenew,
      payment_method_label: payLabel.trim() || null,
      business_id: bizId || null,
      allocation_pct: bizId && allocation.trim() ? parseInt(allocation, 10) : null,
      billing_url: billingUrl.trim() || null,
      document_id: doc?.id ?? null,
      notes: notes.trim() || null,
    };
    const res = bill
      ? await guardedUpdate<RecurringBill>("recurring_bills", bill.id, bill.updated_at, values)
      : await insertRow<RecurringBill>("recurring_bills", values);
    setBusy(false);
    if (res.error !== undefined) { toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { toast.info("Someone else edited this bill — refreshed with their version."); onConflict(); return; }
    if (doc) onDocument(doc);
    toast.success(bill
      ? "Bill updated — future occurrences use the new terms; past payments are unchanged"
      : "Recurring bill added");
    onSaved(res.row);
  }

  return (
    <HqModal wide title={bill ? "Edit recurring bill" : hosting ? "Add a hosting / infrastructure cost" : "Add a recurring bill"}
      subtitle="Edits apply to future occurrences — payments already recorded keep their original amounts."
      onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Vendor / provider" required error={errors.vendor}>
            <input className={fieldCls} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Vercel" autoFocus={!bill} />
          </Field>
          <Field label="Service name">
            <input className={fieldCls} value={service} onChange={e => setService(e.target.value)} placeholder="Pro plan — app hosting" />
          </Field>
        </div>
        <Field label="Description">
          <input className={fieldCls} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this pays for" />
        </Field>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Category">
            <select className={selectCls} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
              <input className={fieldCls + " pl-6"} value={amount} inputMode="decimal"
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="20" />
            </div>
          </Field>
          <Field label="Billed">
            <select className={selectCls} value={frequency} onChange={e => setFrequency(e.target.value)}>
              {FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Next due" required error={errors.nextDue}>
            <input type="date" className={fieldCls} value={nextDue} onChange={e => setNextDue(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Start date" error={errors.startDate}>
            <input type="date" className={fieldCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date" error={errors.endDate}>
            <input type="date" className={fieldCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </Field>
          <Field label="Auto-renews?">
            <select className={selectCls} value={autoRenew ? "yes" : "no"} onChange={e => setAutoRenew(e.target.value === "yes")}>
              <option value="yes">Yes — renews automatically</option>
              <option value="no">No — manual renewal</option>
            </select>
          </Field>
          <Field label="Paid with" hint="Label only — never a full card number." error={errors.payLabel}>
            <input className={fieldCls} value={payLabel} onChange={e => setPayLabel(e.target.value)} placeholder="Business Visa •1234" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Cost ownership" hint="Shared = agency-wide. Assign a client only when the cost truly belongs to them.">
            <select className={selectCls} value={bizId} onChange={e => setBizId(e.target.value)}>
              <option value="">Shared / agency-wide</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Allocation %" hint="Optional — how much of this bill is that client's." error={errors.allocation}>
            <input className={fieldCls} value={allocation} inputMode="numeric" disabled={!bizId}
              onChange={e => setAllocation(e.target.value.replace(/[^0-9]/g, ""))} placeholder={bizId ? "100" : "—"} />
          </Field>
          <Field label="Billing dashboard link" error={errors.billingUrl}>
            <input className={fieldCls} value={billingUrl} onChange={e => setBillingUrl(e.target.value)}
              placeholder="https://vercel.com/…/billing" inputMode="url" />
          </Field>
        </div>
        <ReceiptAttach value={doc} onChange={setDoc} label="Invoice / receipt" />
        <Field label="Notes">
          <textarea className={areaCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything the accountant or future-you should know." />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
          <HqButton onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : bill ? "Save changes" : "Add bill"}
          </HqButton>
        </div>
      </div>
    </HqModal>
  );
}
