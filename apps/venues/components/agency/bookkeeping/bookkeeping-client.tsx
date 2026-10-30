"use client";
/**
 * bookkeeping-client.tsx — CP-112
 *
 * The Bookkeeping tab: operating costs, bills, one-time expenses,
 * mileage, receipts, and the accountant export — in the same
 * command-center skin as Headquarters. Every number on this page comes
 * from records the founders entered; estimates are labeled as such and
 * nothing here is tax advice.
 */
import { useMemo, useState } from "react";
import {
  Wallet, TrendingUp, Server, Repeat, ReceiptText, CalendarClock, AlertTriangle,
  Scale, PercentCircle, Landmark, Car, FileSpreadsheet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  ExpenseCategory, ExpenseDocument, RecurringBill, ExpenseTransaction, ExpenseSplit,
  MileageEntry, MileageRate, FieldSalesEvent, AgencyAdminLite,
} from "@/lib/types/database";
import { dollars, dateLabel } from "@/lib/founder-hq";
import { computeSnapshot, monthLabel } from "@/lib/bookkeeping";
import { HQ, Chip } from "@/components/agency/hq/hq-ui";
import { BillsSection } from "./bills-section";
import { ExpensesSection } from "./expenses-section";
import { MileageSection } from "./mileage-section";
import { TaxSection } from "./tax-section";

type MrrBiz = { business_id: string; business_name: string; monthly_cents: number; status: string };

const TABS = [
  { key: "hosting",  label: "Hosting & Infra",  icon: Server },
  { key: "bills",    label: "Recurring Bills",  icon: Repeat },
  { key: "expenses", label: "Expenses",         icon: ReceiptText },
  { key: "mileage",  label: "Mileage",          icon: Car },
  { key: "tax",      label: "Tax Prep",         icon: FileSpreadsheet },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function BookkeepingClient({
  friendlyName, todayIso, liveMrrCents, activeClients,
  initialCategories, initialBills, initialTxns, initialSplits,
  initialMileage, initialRates, initialDocs, events, admins, businesses, mrrByBusiness,
}: {
  friendlyName: string;
  todayIso: string;
  liveMrrCents: number;
  activeClients: number;
  initialCategories: ExpenseCategory[];
  initialBills: RecurringBill[];
  initialTxns: ExpenseTransaction[];
  initialSplits: ExpenseSplit[];
  initialMileage: MileageEntry[];
  initialRates: MileageRate[];
  initialDocs: ExpenseDocument[];
  events: FieldSalesEvent[];
  admins: AgencyAdminLite[];
  businesses: { id: string; name: string }[];
  mrrByBusiness: MrrBiz[];
}) {
  const [tab, setTab] = useState<TabKey>("hosting");
  const [bills, setBills] = useState(initialBills);
  const [txns, setTxns] = useState(initialTxns);
  const [splits, setSplits] = useState(initialSplits);
  const [mileage, setMileage] = useState(initialMileage);
  const [rates, setRates] = useState(initialRates);
  const [docList, setDocList] = useState(initialDocs);
  const categories = initialCategories;

  const documents = useMemo(() => new Map(docList.map(d => [d.id, d])), [docList]);
  const addDocument = (doc: ExpenseDocument) =>
    setDocList(prev => (prev.some(d => d.id === doc.id) ? prev : [...prev, doc]));

  async function reloadAll() {
    const supabase = createClient();
    const [b, t, s, m, r, d] = await Promise.all([
      supabase.from("recurring_bills").select("*").order("next_due_date", { ascending: true }),
      supabase.from("expense_transactions").select("*").order("txn_date", { ascending: false }).limit(2000),
      supabase.from("expense_splits").select("*"),
      supabase.from("mileage_entries").select("*").order("trip_date", { ascending: false }).limit(1000),
      supabase.from("mileage_rates").select("*"),
      supabase.from("expense_documents").select("*"),
    ]);
    if (b.data) setBills(b.data as RecurringBill[]);
    if (t.data) setTxns(t.data as ExpenseTransaction[]);
    if (s.data) setSplits(s.data as ExpenseSplit[]);
    if (m.data) setMileage(m.data as MileageEntry[]);
    if (r.data) setRates(r.data as MileageRate[]);
    if (d.data) setDocList(d.data as ExpenseDocument[]);
  }

  const snap = useMemo(
    () => computeSnapshot(bills, txns, categories, liveMrrCents, todayIso),
    [bills, txns, categories, liveMrrCents, todayIso]);

  return (
    <div className="min-h-screen" style={{ background: HQ.canvas }}>
      {/* Header */}
      <header className="relative px-4 sm:px-8 pt-10 pb-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-10 h-64 w-64 rounded-full blur-3xl opacity-25" style={{ background: "#22d3ee" }} />
        <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full blur-3xl opacity-20" style={{ background: "#1d6fa5" }} />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · Bookkeeping</div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mt-1 drop-shadow">
            The books, {friendlyName}
          </h1>
          <p className="text-sm text-sky-200/60 mt-1">
            {monthLabel(snap.monthPrefix)} — operational figures from your tracked records.
            Estimates are labeled; official profit and taxes are your accountant's numbers.
          </p>
        </div>

        {/* Monthly snapshot */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
          <SnapCard icon={<TrendingUp className="h-4 w-4" />} accent="#34d399"
            label="Actual Live MRR" value={dollars(liveMrrCents)}
            sub={`${activeClients} paying client${activeClients === 1 ? "" : "s"}`} />
          <SnapCard icon={<Server className="h-4 w-4" />}
            label="Hosting paid (mo)" value={dollars(snap.hostingPaidCents)}
            sub={`${dollars(snap.hostingCommitmentCents)}/mo committed`}
            onClick={() => setTab("hosting")} />
          <SnapCard icon={<Repeat className="h-4 w-4" />}
            label="Other recurring (mo)" value={dollars(snap.otherRecurringPaidCents)}
            sub={`${dollars(snap.monthlyCommitmentCents)}/mo all commitments`}
            onClick={() => setTab("bills")} />
          <SnapCard icon={<ReceiptText className="h-4 w-4" />}
            label="One-time (mo)" value={dollars(snap.onetimePaidCents)}
            sub="Non-recurring purchases" onClick={() => setTab("expenses")} />
          <SnapCard icon={<Landmark className="h-4 w-4" />}
            label="Total paid (mo)" value={dollars(snap.totalPaidCents)}
            sub="All paid expenses this month" onClick={() => setTab("expenses")} />
          <SnapCard icon={<CalendarClock className="h-4 w-4" />}
            label="Upcoming bills" value={String(snap.upcomingBills.length)}
            sub={snap.upcomingBills.length > 0
              ? `${dollars(snap.upcomingBills.reduce((s, b) => s + b.amount_cents, 0))} due in 14 days`
              : "Nothing due in 14 days"}
            warn={snap.upcomingBills.length > 0}
            onClick={() => setTab("bills")} />
          <SnapCard icon={<AlertTriangle className="h-4 w-4" />}
            label="Overdue bills" value={String(snap.overdueBills.length)}
            sub={snap.overdueBills.length > 0
              ? `${dollars(snap.overdueBills.reduce((s, b) => s + b.amount_cents, 0))} past due`
              : "All caught up"}
            danger={snap.overdueBills.length > 0}
            onClick={() => setTab("bills")} />
          <SnapCard icon={<Scale className="h-4 w-4" />} accent="#a78bfa"
            label="Est. remainder (mo)"
            value={snap.operatingRemainderCents != null ? dollars(snap.operatingRemainderCents) : "—"}
            sub="MRR − paid expenses · estimate" />
          <SnapCard icon={<PercentCircle className="h-4 w-4" />}
            label="Hosting % of MRR"
            value={snap.hostingPctOfMrr != null ? `${snap.hostingPctOfMrr}%` : "—"}
            sub={snap.hostingPctOfMrr == null ? "Needs live MRR" : "Paid hosting ÷ live MRR"}
            warn={snap.hostingPctOfMrr != null && snap.hostingPctOfMrr > 50} />
          <SnapCard icon={<Wallet className="h-4 w-4" />} accent="#34d399"
            label="Est. gross margin"
            value={snap.grossMarginPct != null ? `${snap.grossMarginPct}%` : "—"}
            sub="(MRR − hosting) ÷ MRR · estimate" />
        </div>
        <p className="relative text-[11px] text-sky-200/35 mt-2.5">
          Operational estimates from tracked records — not official accounting profit or taxable income.
          Pipeline MRR is never counted as revenue here.
        </p>
      </header>

      {/* Tabs */}
      <div className="px-4 sm:px-8 pb-12">
        <div className="flex flex-wrap items-center gap-1.5 mb-4" role="tablist" aria-label="Bookkeeping sections">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={"inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-bold transition-colors " +
                  (active
                    ? "bg-sky-400 text-slate-900 shadow-[0_0_18px_-6px_rgba(56,189,248,0.8)]"
                    : "text-sky-200/60 hover:text-white hover:bg-white/8 border border-white/10")}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
          {snap.overdueBills.length > 0 && tab !== "bills" && (
            <button onClick={() => setTab("bills")} className="ml-auto">
              <Chip tone="rose">{snap.overdueBills.length} overdue — {dateLabel(snap.overdueBills[0].next_due_date)}</Chip>
            </button>
          )}
        </div>

        {(tab === "hosting" || tab === "bills") && (
          <BillsSection
            hosting={tab === "hosting"}
            bills={bills}
            categories={categories}
            businesses={businesses}
            documents={documents}
            mrrByBusiness={mrrByBusiness}
            todayIso={todayIso}
            onBills={setBills}
            onTxnAdded={txn => setTxns(prev => (prev.some(t => t.id === txn.id) ? prev : [txn, ...prev]))}
            onDocument={addDocument}
            onReload={reloadAll}
          />
        )}
        {tab === "expenses" && (
          <ExpensesSection
            txns={txns}
            splits={splits}
            categories={categories}
            businesses={businesses}
            admins={admins}
            documents={documents}
            todayIso={todayIso}
            onTxns={setTxns}
            onSplits={setSplits}
            onDocument={addDocument}
            onReload={reloadAll}
          />
        )}
        {tab === "mileage" && (
          <MileageSection
            entries={mileage}
            rates={rates}
            events={events}
            admins={admins}
            documents={documents}
            todayIso={todayIso}
            onEntries={setMileage}
            onRates={setRates}
            onDocument={addDocument}
            onReload={reloadAll}
          />
        )}
        {tab === "tax" && (
          <TaxSection
            txns={txns}
            categories={categories}
            businesses={businesses}
            admins={admins}
            documents={documents}
            todayIso={todayIso}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Snapshot card ──────────────────────── */

function SnapCard({ icon, label, value, sub, accent = "#38bdf8", warn, danger, onClick }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  accent?: string; warn?: boolean; danger?: boolean; onClick?: () => void;
}) {
  const border = danger
    ? "1px solid rgba(251,113,133,0.40)"
    : warn
      ? "1px solid rgba(251,191,36,0.30)"
      : "1px solid rgba(56,189,248,0.16)";
  const iconColor = danger ? "#fb7185" : warn ? "#fbbf24" : accent;
  const inner = (
    <div className="relative rounded-xl px-3.5 py-3 h-full overflow-hidden transition-transform hover:-translate-y-0.5"
      style={{
        background: danger
          ? "linear-gradient(180deg, rgba(251,113,133,0.09), rgba(255,255,255,0.02))"
          : warn
            ? "linear-gradient(180deg, rgba(251,191,36,0.09), rgba(255,255,255,0.02))"
            : "linear-gradient(180deg, rgba(56,189,248,0.08), rgba(255,255,255,0.02))",
        border,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: iconColor }}>{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-sky-200/60">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-extrabold text-white tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-sky-200/50 mt-0.5 truncate">{sub}</div>}
    </div>
  );
  return onClick ? (
    <button onClick={onClick} className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 rounded-xl" aria-label={label}>
      {inner}
    </button>
  ) : inner;
}
