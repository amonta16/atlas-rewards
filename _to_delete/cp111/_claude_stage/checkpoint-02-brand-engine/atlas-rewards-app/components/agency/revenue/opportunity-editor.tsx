"use client";
/**
 * opportunity-editor.tsx — CP-111
 *
 * Drawer-style editor for a pipeline opportunity. Every save is
 * optimistic-concurrency-guarded (two admins can't silently overwrite
 * each other) and recalculates the analytics the moment it lands.
 */
import { useMemo, useState } from "react";
import { Loader2, Trash2, Rocket, BadgeDollarSign } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { PipelineOpportunity, AgencyAdminLite } from "@/lib/types/database";
import {
  SALES_STAGES, LEAD_SOURCES, normalizeStage, stageMeta,
  parseMoneyToCents, isValidIsoDate, dollars,
} from "@/lib/founder-hq";
import { HqModal, Field, HqButton, fieldCls, areaCls, selectCls, Chip } from "@/components/agency/hq/hq-ui";
import { insertRow, guardedUpdate, refreshRevenueSnapshot } from "@/components/agency/hq/hq-data";
import { ManualBillingButton } from "@/components/agency/manual-billing-form";

export function OpportunityEditor({
  opp, admins, businesses, onClose, onSaved, onConflict, onRequestDelete, onCreateBusiness,
}: {
  opp: PipelineOpportunity | null;
  admins: AgencyAdminLite[];
  businesses: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (row: PipelineOpportunity) => void;
  onConflict: () => void;
  onRequestDelete?: (opp: PipelineOpportunity) => void;
  onCreateBusiness?: (name: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(opp?.name ?? "");
  const [contactName, setContactName] = useState(opp?.contact_name ?? "");
  const [contactInfo, setContactInfo] = useState(opp?.contact_info ?? "");
  const [ownerId, setOwnerId] = useState(opp?.owner_user_id ?? "");
  const [source, setSource] = useState(opp?.lead_source ?? "door_to_door");
  const [stage, setStage] = useState(normalizeStage(opp?.stage ?? "prepared_app"));
  const [monthly, setMonthly] = useState(opp && opp.est_monthly_cents > 0 ? String(opp.est_monthly_cents / 100) : "");
  const [prob, setProb] = useState(opp?.win_probability != null ? String(opp.win_probability) : "");
  const [closeDate, setCloseDate] = useState(opp?.expected_close_date ?? "");
  const [lastContact, setLastContact] = useState(opp?.last_contact_date ?? "");
  const [nextFollowup, setNextFollowup] = useState(opp?.next_followup_date ?? "");
  const [nextAction, setNextAction] = useState(opp?.next_action ?? "");
  const [notes, setNotes] = useState(opp?.notes ?? "");
  const [status, setStatus] = useState<PipelineOpportunity["status"]>(opp?.status ?? "open");
  const [convertedId, setConvertedId] = useState(opp?.converted_business_id ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const stageDefault = useMemo(() => stageMeta(stage).defaultProb, [stage]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Business name is required.";
    if (monthly.trim() && parseMoneyToCents(monthly) == null) e.monthly = "Enter a valid monthly amount.";
    if (prob.trim()) {
      const p = parseInt(prob, 10);
      if (!Number.isFinite(p) || p < 0 || p > 100) e.prob = "Probability is 0–100.";
    }
    for (const [k, v] of [["closeDate", closeDate], ["lastContact", lastContact], ["nextFollowup", nextFollowup]] as const) {
      if (v && !isValidIsoDate(v)) e[k] = "Date looks wrong.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (busy || !validate()) return;
    setBusy(true);

    // Keep stage and status coherent: a won/lost STATUS wins over the
    // stage dropdown, and picking the Won/Lost stage sets the status.
    let nextStage = stage as string;
    let nextStatus = status;
    if (nextStatus === "open" && (nextStage === "won" || nextStage === "lost")) {
      nextStatus = nextStage as "won" | "lost";
    }
    if (nextStatus === "won") nextStage = "won";
    if (nextStatus === "lost") nextStage = "lost";

    const closing = nextStatus === "won" || nextStatus === "lost";
    const values: Record<string, unknown> = {
      name: name.trim(),
      contact_name: contactName.trim() || null,
      contact_info: contactInfo.trim() || null,
      owner_user_id: ownerId || null,
      lead_source: source,
      stage: nextStage,
      status: nextStatus,
      est_monthly_cents: monthly.trim() ? (parseMoneyToCents(monthly) ?? 0) : 0,
      win_probability: prob.trim() ? parseInt(prob, 10) : null,
      expected_close_date: closeDate || null,
      last_contact_date: lastContact || null,
      next_followup_date: nextFollowup || null,
      next_action: nextAction.trim() || null,
      notes: notes.trim() || null,
      converted_business_id: convertedId || null,
      closed_at: closing ? (opp?.closed_at ?? new Date().toISOString()) : null,
    };

    const res = opp
      ? await guardedUpdate<PipelineOpportunity>("agency_pipeline", opp.id, opp.updated_at, values)
      : await insertRow<PipelineOpportunity>("agency_pipeline", values);
    setBusy(false);
    if (res.error !== undefined) { toast.error("Couldn't save — " + res.error); return; }
    if (res.conflict) { toast.info("Someone else edited this opportunity — refreshed with their version."); onConflict(); return; }
    refreshRevenueSnapshot();
    if (nextStatus === "won" && opp?.status !== "won") {
      toast.success("Marked Won 🎉 — log its live MRR below to count it as revenue.");
    } else {
      toast.success(opp ? "Opportunity updated" : "Opportunity added");
    }
    onSaved(res.row);
  }

  const isWon = status === "won";

  return (
    <HqModal wide title={opp ? "Edit opportunity" : "New opportunity"}
      subtitle={opp ? `Added ${opp.created_at.slice(0, 10)}` : "A business you're actively selling to."}
      onClose={onClose}>
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Business name" required error={errors.name}>
            <input className={fieldCls} value={name} onChange={e => setName(e.target.value)} placeholder="Rosa's Taqueria" autoFocus={!opp} />
          </Field>
          <Field label="Contact name">
            <input className={fieldCls} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Rosa (owner)" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Contact info">
            <input className={fieldCls} value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder="Phone / email / @handle" />
          </Field>
          <Field label="Owner (who's on it)">
            <select className={selectCls} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {admins.map(a => <option key={a.user_id} value={a.user_id}>{a.full_name || a.email}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Lead source">
            <select className={selectCls} value={source} onChange={e => setSource(e.target.value)}>
              {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Sales stage">
            <select className={selectCls} value={stage} onChange={e => setStage(normalizeStage(e.target.value))}>
              {SALES_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as PipelineOpportunity["status"])}>
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Potential monthly value" error={errors.monthly} hint="What they'd pay per month.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40 text-sm">$</span>
              <input className={fieldCls + " pl-6"} value={monthly} inputMode="decimal"
                onChange={e => setMonthly(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="299" />
            </div>
          </Field>
          <Field label="Win probability %" error={errors.prob}
            hint={`Blank = stage default (${stageDefault}%).`}>
            <input className={fieldCls} value={prob} inputMode="numeric"
              onChange={e => setProb(e.target.value.replace(/[^0-9]/g, ""))} placeholder={String(stageDefault)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Expected close" error={errors.closeDate}>
            <input type="date" className={fieldCls} value={closeDate} onChange={e => setCloseDate(e.target.value)} />
          </Field>
          <Field label="Last contact" error={errors.lastContact}>
            <input type="date" className={fieldCls} value={lastContact} onChange={e => setLastContact(e.target.value)} />
          </Field>
          <Field label="Next follow-up" error={errors.nextFollowup}>
            <input type="date" className={fieldCls} value={nextFollowup} onChange={e => setNextFollowup(e.target.value)} />
          </Field>
        </div>
        <Field label="Next action">
          <input className={fieldCls} value={nextAction} onChange={e => setNextAction(e.target.value)}
            placeholder="Drop off the demo phone + follow up with Rosa Tuesday" />
        </Field>
        <Field label="Notes">
          <textarea className={areaCls} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Objections, decision process, anything the next visit needs." />
        </Field>
        <Field label="Linked Atlas app (optional)"
          hint="Link the business once its app exists — it keeps live MRR and pipeline from double-counting.">
          <select className={selectCls} value={convertedId} onChange={e => setConvertedId(e.target.value)}>
            <option value="">Not linked</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>

        {isWon && (
          <div className="rounded-xl px-4 py-3.5"
            style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)" }}>
            <div className="flex items-center gap-2 text-emerald-200 font-bold text-sm">
              <BadgeDollarSign className="h-4 w-4" /> Won — make it real revenue
            </div>
            <p className="text-[12px] text-emerald-100/70 mt-1">
              A won deal only counts toward <b>Live MRR</b> after its subscription is
              logged{opp?.est_monthly_cents ? ` (deal was ${dollars(opp.est_monthly_cents)}/mo)` : ""}.
              Create the business app if it doesn't exist yet, then log the plan.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {onCreateBusiness && (
                <HqButton kind="outline" className="h-8 text-[12px]" onClick={() => onCreateBusiness(name.trim() || "New business")}>
                  <Rocket className="h-3.5 w-3.5" /> Create business app
                </HqButton>
              )}
              <ManualBillingButton onSaved={() => refreshRevenueSnapshot()} />
              <Chip tone="emerald">Then link the app above</Chip>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {opp && onRequestDelete ? (
            <HqButton kind="danger" onClick={() => onRequestDelete(opp)}>
              <Trash2 className="h-4 w-4" /> Delete
            </HqButton>
          ) : <span />}
          <div className="flex gap-2">
            <HqButton kind="ghost" onClick={onClose}>Cancel</HqButton>
            <HqButton onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : opp ? "Save changes" : "Add opportunity"}
            </HqButton>
          </div>
        </div>
      </div>
    </HqModal>
  );
}
