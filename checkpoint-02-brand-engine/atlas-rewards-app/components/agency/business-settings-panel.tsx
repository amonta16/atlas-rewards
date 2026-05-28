"use client";
import { useEffect, useState } from "react";
import { CalendarClock, CreditCard, KeyRound, Check, ExternalLink, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Plan = {
  plan_name: string;
  monthly_cents: number;
  status: string;
  current_period_end: string | null;
  started_at: string | null;
};

/**
 * The per-business Settings tab — appears inside the brand-editor next to
 * Webhook Settings + Automation Rules. Two big sections:
 *   1. GHL Calendar integration (location_id + calendar_id + private API key)
 *   2. Plan & billing (monthly fee + setup fee for this specific sub-account)
 */
export function BusinessSettingsPanel({
  business,
  onUpdate,
}: {
  business: Business;
  onUpdate: (patch: Partial<Business>) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planEdit, setPlanEdit] = useState<{ plan_name: string; monthly: string; status: string; setup: string }>({
    plan_name: "Standard", monthly: "", status: "trialing", setup: "",
  });
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaved, setPlanSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("my_business_billing", { p_business_id: business.id });
      const row = (Array.isArray(data) ? data[0] : data) as (Plan & { setup_fees_outstanding_cents: number }) | null;
      if (row) {
        setPlan(row);
        setPlanEdit({
          plan_name: row.plan_name ?? "Standard",
          monthly:   ((row.monthly_cents ?? 0) / 100).toFixed(2),
          status:    row.status ?? "trialing",
          setup:     "",
        });
      }
    })();
  }, [business.id]);

  async function savePlan() {
    setSavingPlan(true);
    setPlanSaved(false);
    const supabase = createClient();
    const monthly_cents = Math.round((parseFloat(planEdit.monthly || "0") || 0) * 100);
    const setup_cents   = Math.round((parseFloat(planEdit.setup   || "0") || 0) * 100);
    const { error } = await supabase.rpc("upsert_business_billing", {
      p_business_id:     business.id,
      p_plan_name:       planEdit.plan_name || "Standard",
      p_monthly_cents:   monthly_cents,
      p_status:          planEdit.status,
      p_setup_fee_cents: setup_cents > 0 ? setup_cents : null,
    });
    setSavingPlan(false);
    if (!error) {
      setPlanSaved(true);
      const { data } = await supabase.rpc("my_business_billing", { p_business_id: business.id });
      const row = (Array.isArray(data) ? data[0] : data) as Plan | null;
      setPlan(row);
    }
  }

  const ghlReady = !!(business.ghl_calendar_id && business.ghl_api_key && business.ghl_location_id);

  return (
    <div className="space-y-6">
      {/* ============ GHL ============ */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">GoHighLevel Calendar integration</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              When configured, the customer booking flow uses GHL's availability + double-booking
              prevention. Leave blank to use Atlas's built-in scheduler.
            </p>
          </div>
        </div>

        <div className={`rounded-lg px-4 py-3 mb-4 flex items-start gap-2 text-xs ${ghlReady ? "bg-emerald-50 text-emerald-900" : "bg-zinc-50 text-zinc-700"}`}>
          {ghlReady
            ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
            : <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <div>
            {ghlReady
              ? "GHL is wired up for this business. The customer Book tab now pulls slots from GHL and writes appointments there."
              : "Need a private integration token? In GHL: Sub-Account Settings → My Staff → API Key, or use Private Integration."}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="GHL Location ID">
            <Input
              value={business.ghl_location_id ?? ""}
              onChange={e => onUpdate({ ghl_location_id: e.target.value || null })}
              placeholder="loc_..."
            />
          </Field>
          <Field label="GHL Calendar ID">
            <Input
              value={business.ghl_calendar_id ?? ""}
              onChange={e => onUpdate({ ghl_calendar_id: e.target.value || null })}
              placeholder="cal_..."
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Private Integration API key">
            <div className="relative">
              <KeyRound className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={business.ghl_api_key ?? ""}
                onChange={e => onUpdate({ ghl_api_key: e.target.value || null })}
                placeholder="pit-..."
                className="pl-8 font-mono"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Stored encrypted at-rest in Supabase. Only agency admins can read this row (RLS-protected).
            </p>
          </Field>
        </div>

        <a href="https://highlevel.stoplight.io/docs/integrations/" target="_blank" rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline">
          GHL API docs <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* ============ PLAN ============ */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Plan & billing</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              What this sub-account pays your agency. Shows up in their manager dashboard + your MRR.
            </p>
          </div>
        </div>

        {plan?.status === "past_due" && (
          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 mb-4 flex items-start gap-2 text-xs text-rose-900">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>Last invoice failed. Stripe will retry automatically; you can also charge manually from the Stripe dashboard.</div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Plan name">
            <Input
              value={planEdit.plan_name}
              onChange={e => setPlanEdit({ ...planEdit, plan_name: e.target.value })}
              placeholder="Standard"
            />
          </Field>

          <Field label="Status">
            <select
              value={planEdit.status}
              onChange={e => setPlanEdit({ ...planEdit, status: e.target.value })}
              className="w-full rounded-md border border-input bg-background h-9 px-2 text-sm"
            >
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="paused">Paused</option>
              <option value="canceled">Canceled</option>
            </select>
          </Field>

          <Field label="Monthly fee">
            <div className="flex items-center gap-2">
              <span className="text-sm">$</span>
              <Input type="number" min={0} step="0.01"
                value={planEdit.monthly}
                onChange={e => setPlanEdit({ ...planEdit, monthly: e.target.value })}
                placeholder="199.00" />
              <span className="text-xs text-muted-foreground shrink-0">/ mo</span>
            </div>
          </Field>

          <Field label="One-time setup fee">
            <div className="flex items-center gap-2">
              <span className="text-sm">$</span>
              <Input type="number" min={0} step="0.01"
                value={planEdit.setup}
                onChange={e => setPlanEdit({ ...planEdit, setup: e.target.value })}
                placeholder="500.00" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Adds to the outstanding setup fees on the agency dashboard.
            </p>
          </Field>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {plan?.started_at && <>Started {new Date(plan.started_at).toLocaleDateString()}</>}
          </div>
          <Button onClick={savePlan} disabled={savingPlan} className="bg-brand-primary text-white">
            {savingPlan ? "Saving…" : planSaved ? <><Check className="h-4 w-4 mr-1" /> Saved</> : "Update plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
