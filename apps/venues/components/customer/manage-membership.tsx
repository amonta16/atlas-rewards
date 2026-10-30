"use client";
/**
 * ManageMembership — CP-149 · the paid member's own controls
 *
 * Shows only when the member's membership is billed through Stripe Connect
 * (my_membership_subscription returns a stripe row). Monthly: "Cancel at
 * end of period" / "Keep my membership" + "Update card & receipts" (Stripe
 * Customer Portal, returns here). Pass: just the expiry line — nothing to
 * cancel. In-person / external-link memberships never show this.
 */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, XCircle, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

type Sub = {
  id: string; provider: string; plan_kind: "monthly" | "pass"; plan_label: string | null; price_cents: number | null;
  status: string; current_period_end: string | null; cancel_at_period_end: boolean; has_portal: boolean;
};

export function ManageMembership({ business }: { business: Business }) {
  const [sub, setSub] = useState<Sub | null | "loading">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const primary = business.brand_colors.primary;

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("my_membership_subscription", { p_business_id: business.id });
    if (error) { setSub(null); return; }
    const row = (Array.isArray(data) ? data[0] : data) as Sub | undefined;
    setSub(row && row.provider === "stripe" ? row : null);
  }, [business.id]);
  useEffect(() => { load(); }, [load]);

  async function act(action: "portal" | "cancel" | "resume") {
    if (action === "cancel" && !confirm("Cancel your membership? You keep it until the end of the period you already paid for.")) return;
    setBusy(action); setErr(null);
    try {
      const res = await fetch(`/api/${business.slug}/membership/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, returnUrl: window.location.href }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      if (action === "portal" && json.url) { window.location.assign(json.url); return; }
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (sub === "loading" || !sub) return null;
  if (!["active", "trialing", "past_due"].includes(sub.status)) return null;

  const end = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <div className="mt-3">
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Manage membership</div>

        {sub.status === "past_due" && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-900 font-semibold">
            Your last payment didn&apos;t go through — update your card to keep your perks.
          </div>
        )}
        {sub.plan_kind === "monthly" && sub.cancel_at_period_end && end && (
          <div className="rounded-xl bg-zinc-50 border px-3 py-2 text-[12px] text-zinc-700">
            Cancellation scheduled — you keep everything until <b>{end}</b>.
          </div>
        )}
        {sub.plan_kind === "pass" && end && (
          <div className="text-[12px] text-zinc-600">Your pass runs through <b>{end}</b>. Nothing renews automatically.</div>
        )}

        <div className="flex flex-wrap gap-2">
          {sub.has_portal && (
            <button type="button" onClick={() => act("portal")} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-bold text-white disabled:opacity-60"
              style={{ background: primary }}>
              {busy === "portal" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Update card &amp; receipts
            </button>
          )}
          {sub.plan_kind === "monthly" && !sub.cancel_at_period_end && (
            <button type="button" onClick={() => act("cancel")} disabled={!!busy}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-bold border text-zinc-600 hover:text-rose-700 hover:border-rose-300 disabled:opacity-60")}>
              {busy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Cancel at end of period
            </button>
          )}
          {sub.plan_kind === "monthly" && sub.cancel_at_period_end && (
            <button type="button" onClick={() => act("resume")} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-bold border text-emerald-700 border-emerald-300 disabled:opacity-60">
              {busy === "resume" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Keep my membership
            </button>
          )}
        </div>
        {err && <p className="text-[11px] text-rose-600">{err}</p>}
      </div>
    </div>
  );
}
