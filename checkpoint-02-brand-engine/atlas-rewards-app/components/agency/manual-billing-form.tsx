"use client";
/**
 * ManualBillingForm — CP-33
 *
 * Modal form on the agency billing panel that lets Andrew log
 * MRR + setup fee for a business *manually* — used during the
 * in-person pitch + onboarding phase before full Stripe self-
 * serve is wired up.
 *
 * Calls the existing CP-17 RPC `upsert_business_billing` (already
 * present in the schema), so no migration is needed. The
 * agency_billing_summary RPC automatically picks up the new row,
 * so the dashboard MRR + pipeline numbers reflect reality the
 * moment you save.
 */
import { useEffect, useState } from "react";
import { X, Loader2, DollarSign, Save, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type BizPick = { id: string; name: string };
type Status = "trialing" | "active" | "past_due" | "paused" | "canceled";

const STATUS_LABELS: Record<Status, string> = {
  trialing: "Pipeline / Trial",
  active:   "Active (paying)",
  past_due: "Past due",
  paused:   "Paused",
  canceled: "Canceled / churned",
};

export function ManualBillingButton({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" /> Log MRR / setup fee
      </Button>
      {open && (
        <ManualBillingForm
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); onSaved?.(); }}
        />
      )}
    </>
  );
}

function ManualBillingForm({
  onClose, onSaved,
}: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [businesses, setBusinesses] = useState<BizPick[] | null>(null);
  const [businessId, setBusinessId] = useState<string>("");
  const [planName, setPlanName]     = useState("Atlas Standard");
  const [mrr, setMrr]               = useState<string>("");
  const [setupFee, setSetupFee]     = useState<string>("");
  const [status, setStatus]         = useState<Status>("active");
  const [busy, setBusy]             = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("businesses")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setBusinesses((data ?? []) as BizPick[]));
  }, []);

  async function save() {
    if (!businessId) { toast.error("Pick a business"); return; }
    const mrrCents = Math.round(parseFloat(mrr || "0") * 100);
    const setupFeeCents = setupFee ? Math.round(parseFloat(setupFee) * 100) : null;
    if (Number.isNaN(mrrCents) || mrrCents < 0) {
      toast.error("MRR must be a number"); return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_business_billing", {
      p_business_id:     businessId,
      p_plan_name:       planName.trim() || "Atlas Standard",
      p_monthly_cents:   mrrCents,
      p_status:          status,
      p_setup_fee_cents: setupFeeCents,
    });
    setBusy(false);
    if (error) {
      toast.error("Save failed — " + error.message);
      return;
    }
    toast.success("Billing entry saved ✨");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              Log MRR / setup fee
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Use this for in-person deals before Stripe self-serve is wired.
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Business picker */}
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Business</Label>
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-md border bg-white text-sm"
            >
              <option value="">{businesses ? "Pick a business…" : "Loading…"}</option>
              {(businesses ?? []).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Plan name */}
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Plan name</Label>
            <Input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="Atlas Standard"
              className="mt-1"
            />
          </div>

          {/* MRR */}
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Monthly recurring ($)</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
              <Input
                type="number"
                step="1"
                min="0"
                value={mrr}
                onChange={e => setMrr(e.target.value)}
                placeholder="297"
                className="pl-7"
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              What this client pays you per month. Enter dollars (no cents needed for round numbers).
            </p>
          </div>

          {/* Setup fee */}
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Setup fee ($) — optional</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
              <Input
                type="number"
                step="1"
                min="0"
                value={setupFee}
                onChange={e => setSetupFee(e.target.value)}
                placeholder="500"
                className="pl-7"
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              One-time onboarding fee. Leave blank if none.
            </p>
          </div>

          {/* Status */}
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className="mt-1 w-full h-11 px-3 rounded-md border bg-white text-sm"
            >
              {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              <strong>Active</strong> = counts toward MRR. <strong>Pipeline / Trial</strong> = counts toward pipeline.
              Canceled removes them from both.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3 bg-zinc-50">
          <button onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button
            onClick={save}
            disabled={busy || !businessId}
            className="rounded-full px-5 bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
              : <><Save className="h-4 w-4 mr-1.5" /> Save entry</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
