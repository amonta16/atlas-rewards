"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp, Wallet, Hourglass, CreditCard, ArrowUpRight, Receipt, AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/ui/stat-card";

type Summary = {
  mrr_cents: number;
  active_subscriptions: number;
  pipeline_cents: number;
  pipeline_count: number;
  setup_fees_outstanding_cents: number;
  setup_fees_collected_30d: number;
  payments_30d_cents: number;
  payments_30d_count: number;
};

type Payment = {
  id: string;
  business_id: string;
  business_name: string;
  amount_cents: number;
  type: "subscription" | "setup" | "onetime";
  status: "paid" | "failed" | "refunded";
  description: string | null;
  paid_at: string | null;
};

/**
 * Agency billing widget — drops into the main agency dashboard above the
 * business list. Pulls MRR / setup-fee / payment-history rollups from
 * agency_billing_summary + list_agency_payments.
 */
export function AgencyBillingPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stripeConfigured, setStripeConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const [{ data: sum }, { data: pays }, { data: settings }] = await Promise.all([
        supabase.rpc("agency_billing_summary"),
        supabase.rpc("list_agency_payments", { p_limit: 10 }),
        supabase.from("agency_settings").select("stripe_account_id").maybeSingle(),
      ]);
      if (cancelled) return;
      // RPC returns a single-row table; depending on PG/PostgREST behaviour
      // it can arrive as either an array or an object.
      const summaryRow = Array.isArray(sum) ? sum[0] : sum;
      setSummary((summaryRow ?? null) as Summary | null);
      setPayments((pays ?? []) as Payment[]);
      setStripeConfigured(!!settings?.stripe_account_id);
    })();
    return () => { cancelled = true; };
  }, []);

  const dollars = (cents: number | null | undefined) =>
    `$${((cents ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="px-8 mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-bold">Agency revenue</h2>
        <Link href="/agency/settings" className="text-xs font-semibold text-brand-primary hover:underline">
          Manage billing settings →
        </Link>
      </div>

      {stripeConfigured === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900">
            Stripe isn't connected yet. Payments won't sync until you finish setup —
            head to <Link href="/agency/settings" className="font-semibold underline">Settings</Link> to add your Stripe account ID and webhook secret.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="MRR"
          value={dollars(summary?.mrr_cents)}
          sub={`${summary?.active_subscriptions ?? 0} active plans`}
          tone="emerald"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Setup fees (30d)"
          value={dollars(summary?.setup_fees_collected_30d)}
          sub={`${dollars(summary?.setup_fees_outstanding_cents)} outstanding`}
          tone="amber"
        />
        <StatCard
          icon={<Hourglass className="h-5 w-5" />}
          label="Pipeline"
          value={dollars(summary?.pipeline_cents)}
          sub={`${summary?.pipeline_count ?? 0} trialing / paused`}
          tone="indigo"
        />
        <StatCard
          icon={<CreditCard className="h-5 w-5" />}
          label="Collected (30d)"
          value={dollars(summary?.payments_30d_cents)}
          sub={`${summary?.payments_30d_count ?? 0} payments`}
          tone="cyan"
        />
      </div>

      <div className="mt-4 rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Receipt className="h-4 w-4 text-brand-primary" /> Recent payments</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Last 10 invoices from your sub-account businesses.</p>
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No payments yet. Once Stripe processes an invoice it shows up here.
          </div>
        ) : (
          <div className="divide-y">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">
                    {p.business_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span className="capitalize">{p.type}</span>
                    {p.description && <span className="truncate">· {p.description}</span>}
                    {p.paid_at && <span>· {new Date(p.paid_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className={p.status === "paid" ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                    {dollars(p.amount_cents)}
                  </div>
                  <Link href={`/agency/businesses/${p.business_id}`}
                    className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
