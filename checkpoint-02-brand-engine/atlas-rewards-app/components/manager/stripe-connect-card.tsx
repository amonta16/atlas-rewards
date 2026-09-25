"use client";
/**
 * StripeConnectCard — CP-149 · "Connect Stripe" for a business
 *
 * Replaces the pasted secret key + per-business webhook secret. One button:
 * Atlas creates the business's Standard connected account and sends the
 * owner into Stripe's hosted onboarding (business details, identity, bank).
 * We store only the acct_… id and the flags Stripe reports; this card just
 * shows them. Used inside MembershipBillingSetup (desk + builder).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ExternalLink, Loader2, ShieldCheck, AlertTriangle, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaymentAccountPublic = {
  provider: string; connected: boolean; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; connected_at: string | null;
};

export function useStripeAccount(businessId: string) {
  const [acct, setAcct] = useState<PaymentAccountPublic | null | "loading">("loading");
  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("payment_account_public", { p_business_id: businessId });
    if (error) { setAcct(null); return; }
    const rows = (data ?? []) as PaymentAccountPublic[];
    setAcct(rows.find(r => r.provider === "stripe") ?? null);
  }, [businessId]);
  useEffect(() => { load(); }, [load]);
  return { acct, reload: load };
}

export function StripeConnectCard({
  businessId, primary, legacyKeyOnFile, onStatus,
}: {
  businessId: string;
  primary: string;
  /** A pre-CP-149 pasted secret key exists — we tell the owner Connect replaces it. */
  legacyKeyOnFile?: boolean;
  onStatus?: (live: boolean) => void;
}) {
  const { acct, reload } = useStripeAccount(businessId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sp = useSearchParams();
  const flash = sp?.get("stripe");

  useEffect(() => { if (acct !== "loading") onStatus?.(!!acct?.charges_enabled); }, [acct, onStatus]);
  useEffect(() => { if (flash) reload(); }, [flash, reload]);

  async function connect() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: businessId, return_to: window.location.pathname + window.location.search }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start Stripe onboarding.");
      window.location.assign(json.url);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't start Stripe onboarding.");
      setBusy(false);
    }
  }

  const live = acct !== "loading" && !!acct?.charges_enabled;
  const started = acct !== "loading" && !!acct?.connected;

  return (
    <div className={cn("rounded-2xl border p-4 space-y-3", live ? "bg-emerald-50/60 border-emerald-200" : "bg-white")}>
      <div className="flex items-start gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 text-white", live ? "bg-emerald-600" : "bg-[#635BFF]")}>
          {live ? <ShieldCheck className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold">
            {acct === "loading" ? "Checking Stripe…" : live ? "Stripe connected — card checkout is live" : started ? "Stripe setup not finished" : "Connect Stripe"}
          </div>
          <p className="text-[11px] text-zinc-600 mt-0.5 leading-snug">
            {live
              ? <>Members pay by card, Apple Pay or Google Pay and activate themselves. Money settles straight to your bank; see everything at <a className="underline" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">dashboard.stripe.com</a>.</>
              : started
                ? "Stripe still needs a few details before it can take payments for you. Pick up where you left off — it takes a couple of minutes."
                : "Takes about 10 minutes on Stripe's site: business details, an ID check and the bank account payouts go to. Atlas never sees your bank or card data and never asks for an API key."}
          </p>
          {acct !== "loading" && acct && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
              <Flag ok={acct.details_submitted} label="Details" />
              <Flag ok={acct.charges_enabled} label="Charges" />
              <Flag ok={acct.payouts_enabled} label="Payouts" />
            </div>
          )}
        </div>
      </div>

      {flash === "connected" && <p className="text-[11px] font-semibold text-emerald-700">Connected. You can switch the membership live now.</p>}
      {flash === "incomplete" && <p className="text-[11px] font-semibold text-amber-700">Stripe still needs something — tap Finish setup.</p>}
      {flash === "error" && <p className="text-[11px] font-semibold text-rose-700">Something went wrong coming back from Stripe. Try again.</p>}
      {err && <p className="text-[11px] font-semibold text-rose-700 flex items-start gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {err}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {!live && (
          <Button onClick={connect} disabled={busy || acct === "loading"} className="text-white font-bold h-10" style={{ background: primary }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ExternalLink className="h-4 w-4 mr-1.5" />}
            {started ? "Finish setup on Stripe" : "Connect with Stripe"}
          </Button>
        )}
        {live && (
          <Button variant="outline" onClick={connect} disabled={busy} className="h-9 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />} Update Stripe details
          </Button>
        )}
      </div>

      {legacyKeyOnFile && (
        <p className="text-[10px] text-zinc-500">
          A pasted Stripe secret key from an earlier setup is still on file. Once Connect shows <b>Charges ✓</b>, checkout uses Connect and the old key is ignored — you can clear it below.
        </p>
      )}
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", ok ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-500")}>
      {ok ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-zinc-400" />} {label}
    </span>
  );
}
