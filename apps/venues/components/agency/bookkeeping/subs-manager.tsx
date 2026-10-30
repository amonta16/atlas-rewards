"use client";
/**
 * subs-manager.tsx — CP-112
 *
 * The Live MRR manager. CP-111 could only ADD a plan through the
 * "Log MRR / setup fee" form — there was no way to see, edit, cancel, or
 * remove what had been logged, which made Live MRR feel stuck. This
 * modal lists every subscription record and lets an admin fix it:
 *   • edit plan name / amount / status inline
 *   • cancel (keeps the history — the honest default)
 *   • delete outright (type-DELETE confirm; for true mistakes only)
 *   • add a new client plan
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Trash2, Check, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import type { BillingSubscription } from "@/lib/types/database";
import { dollars, parseMoneyToCents } from "@/lib/founder-hq";
import { HqModal, HqButton, Chip, Field, fieldCls, selectCls, EmptyState } from "@/components/agency/hq/hq-ui";

const STATUSES: { key: BillingSubscription["status"]; label: string; tone: "emerald" | "sky" | "amber" | "slate" }[] = [
  { key: "active",   label: "Active (paying)", tone: "emerald" },
  { key: "trialing", label: "Trial",           tone: "sky" },
  { key: "past_due", label: "Past due",        tone: "amber" },
  { key: "paused",   label: "Paused",          tone: "slate" },
  { key: "canceled", label: "Canceled",        tone: "slate" },
];

export function SubsManagerButton({
  businesses, onChanged,
}: {
  businesses: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HqButton kind="outline" onClick={() => setOpen(true)}>
        <TrendingUp className="h-4 w-4" /> Manage live clients
      </HqButton>
      {open && (
        <SubsManager businesses={businesses} onClose={() => setOpen(false)} onChanged={onChanged} />
      )}
    </>
  );
}

function SubsManager({ businesses, onClose, onChanged }: {
  businesses: { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [subs, setSubs] = useState<BillingSubscription[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BillingSubscription | null>(null);
  const [adding, setAdding] = useState(false);
  const [newBiz, setNewBiz] = useState("");
  const [newPlan, setNewPlan] = useState("Atlas Standard");
  const [newAmount, setNewAmount] = useState("");
  const [newStatus, setNewStatus] = useState<BillingSubscription["status"]>("active");
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});

  const bizName = useMemo(() => new Map(businesses.map(b => [b.id, b.name])), [businesses]);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("agency_billing_subscriptions").select("*")
      .order("status", { ascending: true }).order("monthly_cents", { ascending: false });
    if (error) { toast.error("Couldn't load subscriptions — " + error.message); return; }
    setSubs((data ?? []) as BillingSubscription[]);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function patch(sub: BillingSubscription, values: Partial<BillingSubscription>) {
    setBusyId(sub.id);
    const supabase = createClient();
    const patchVals: Record<string, unknown> = { ...values };
    if (values.status === "canceled" && sub.status !== "canceled") patchVals.canceled_at = new Date().toISOString();
    if (values.status && values.status !== "canceled") patchVals.canceled_at = null;
    const { data, error } = await supabase
      .from("agency_billing_subscriptions").update(patchVals).eq("id", sub.id).select();
    setBusyId(null);
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message)
        ? "That business already has another live plan — cancel one of the two first."
        : "Couldn't update — " + error.message);
      return;
    }
    if (!data || data.length === 0) { toast.info("Row changed elsewhere — refreshed."); load(); return; }
    setSubs(prev => prev?.map(s => (s.id === sub.id ? (data[0] as BillingSubscription) : s)) ?? prev);
    onChanged();
    toast.success("Updated — Live MRR recalculated");
  }

  async function saveAmount(sub: BillingSubscription) {
    const raw = draftAmounts[sub.id];
    if (raw == null) return;
    const cents = parseMoneyToCents(raw);
    if (cents == null) { toast.error("Enter a valid monthly amount"); return; }
    await patch(sub, { monthly_cents: cents });
    setDraftAmounts(d => { const { [sub.id]: _drop, ...rest } = d; return rest; });
  }

  async function addSub() {
    if (!newBiz) { toast.error("Pick the business first"); return; }
    const cents = parseMoneyToCents(newAmount || "0");
    if (cents == null) { toast.error("Enter a valid monthly amount"); return; }
    setAdding(true);
    const supabase = createClient();
    const { error } = await supabase.from("agency_billing_subscriptions").insert({
      business_id: newBiz, plan_name: newPlan.trim() || "Atlas Standard",
      monthly_cents: cents, status: newStatus,
    });
    setAdding(false);
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message)
        ? "This business already has a live plan — edit that row instead of adding a second one."
        : "Couldn't add — " + error.message);
      return;
    }
    setNewBiz(""); setNewAmount("");
    load(); onChanged();
    toast.success("Plan added — Live MRR recalculated");
  }

  async function confirmDelete() {
    if (!deleting) return;
    const supabase = createClient();
    const { error } = await supabase.from("agency_billing_subscriptions").delete().eq("id", deleting.id);
    if (error) { toast.error("Delete failed — " + error.message); return; }
    setSubs(prev => prev?.filter(s => s.id !== deleting.id) ?? prev);
    setDeleting(null);
    onChanged();
    toast.success("Subscription record deleted");
  }

  const liveTotal = (subs ?? []).filter(s => s.status === "active").reduce((t, s) => t + s.monthly_cents, 0);

  return (
    <HqModal wide title="Live clients & MRR"
      subtitle={`Every logged subscription. Active plans are what Live MRR counts — currently ${dollars(liveTotal)}/mo.`}
      onClose={onClose}>
      <div className="space-y-4">
        {subs === null ? (
          <div className="flex items-center gap-2 text-sky-200/60 py-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : subs.length === 0 ? (
          <EmptyState title="No subscriptions logged yet"
            hint="Add the first paying client below — Live MRR builds from these records." />
        ) : (
          <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
            {subs.map(s => {
              const meta = STATUSES.find(x => x.key === s.status) ?? STATUSES[0];
              const draft = draftAmounts[s.id];
              return (
                <div key={s.id} className="rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2 bg-white/[0.03] border border-white/8">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">
                      {bizName.get(s.business_id) ?? "Unknown business"}
                    </div>
                    <div className="text-[11px] text-sky-200/45">{s.plan_name} · since {s.started_at.slice(0, 10)}</div>
                  </div>
                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sky-200/40 text-xs">$</span>
                    <input
                      className={fieldCls + " !h-8 pl-5 text-[12px] text-right tabular-nums"}
                      value={draft ?? (s.monthly_cents / 100).toString()}
                      inputMode="decimal"
                      aria-label={`Monthly amount for ${bizName.get(s.business_id) ?? "business"}`}
                      onChange={e => setDraftAmounts(d => ({ ...d, [s.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      onKeyDown={e => { if (e.key === "Enter") saveAmount(s); }}
                    />
                  </div>
                  {draft != null && draft !== (s.monthly_cents / 100).toString() && (
                    <button onClick={() => saveAmount(s)} aria-label="Save amount"
                      className="h-8 w-8 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 flex items-center justify-center text-emerald-300">
                      {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                  )}
                  <select
                    className={selectCls + " !h-8 !w-auto text-[12px]"}
                    value={s.status}
                    aria-label="Subscription status"
                    onChange={e => patch(s, { status: e.target.value as BillingSubscription["status"] })}
                  >
                    {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                  </select>
                  <Chip tone={meta.tone}>{meta.label}</Chip>
                  <button onClick={() => setDeleting(s)} aria-label="Delete subscription record" title="Delete record (prefer Canceled to keep history)"
                    className="h-8 w-8 rounded-md bg-white/5 hover:bg-rose-500/15 flex items-center justify-center text-sky-200/60 hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add a plan */}
        <div className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.18)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest text-sky-200/60">Add a client plan</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Field label="Business" required>
              <select className={selectCls + " !h-9 text-[12px]"} value={newBiz} onChange={e => setNewBiz(e.target.value)}>
                <option value="">Pick…</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Plan name">
              <input className={fieldCls + " !h-9 text-[12px]"} value={newPlan} onChange={e => setNewPlan(e.target.value)} />
            </Field>
            <Field label="$ / month" required>
              <input className={fieldCls + " !h-9 text-[12px]"} value={newAmount} inputMode="decimal"
                onChange={e => setNewAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="299" />
            </Field>
            <Field label="Status">
              <select className={selectCls + " !h-9 text-[12px]"} value={newStatus}
                onChange={e => setNewStatus(e.target.value as BillingSubscription["status"])}>
                {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <HqButton onClick={addSub} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Add plan</>}
            </HqButton>
          </div>
        </div>
      </div>

      {deleting && (
        <ConfirmDeleteModal
          title="Delete this subscription record?"
          description={`${bizName.get(deleting.business_id) ?? "This business"} — ${dollars(deleting.monthly_cents)}/mo will be permanently removed, including its MRR history. If they churned, set the status to Canceled instead so the chart stays honest.`}
          destructiveLabel="Delete record"
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </HqModal>
  );
}
