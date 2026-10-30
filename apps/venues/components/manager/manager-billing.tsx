"use client";
import { useEffect, useState } from "react";
import { CreditCard, Receipt, AlertCircle, Check, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Plan = {
  plan_name: string;
  monthly_cents: number;
  status: string;
  current_period_end: string | null;
  started_at: string | null;
  setup_fees_outstanding_cents: number;
  recent_payments: Array<{
    amount_cents: number;
    type: string;
    status: string;
    description: string | null;
    paid_at: string | null;
  }>;
};

/**
 * Manager-side billing view — what *this* sub-account business pays the
 * agency. Read-only summary; managers can't self-serve changes (agency
 * controls pricing). They get plan status, next renewal date, outstanding
 * setup fees, and the last 10 invoices.
 */
export function ManagerBilling({ business }: { business: Business }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("my_business_billing", { p_business_id: business.id });
      const row = (Array.isArray(data) ? data[0] : data) as Plan | null;
      setPlan(row);
      setLoaded(true);
    })();
  }, [business.id]);

  const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

  if (!loaded) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading billing…</div>;
  }

  if (!plan) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">No plan yet</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Your agency hasn't set up a plan for this account yet. Reach out to them and they'll
          configure your monthly subscription.
        </p>
      </div>
    );
  }

  const statusTone = ({
    active:   "bg-emerald-100 text-emerald-700",
    trialing: "bg-blue-100 text-blue-700",
    past_due: "bg-rose-100 text-rose-700",
    paused:   "bg-zinc-200 text-zinc-700",
    canceled: "bg-zinc-200 text-zinc-500",
  } as Record<string, string>)[plan.status] ?? "bg-zinc-100 text-zinc-700";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-6"
        style={{
          background: `linear-gradient(135deg, ${business.brand_colors.primary}06 0%, white 50%)`,
        }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Current plan</div>
            <div className="mt-1 text-2xl font-bold">{plan.plan_name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {plan.monthly_cents > 0 ? `${dollars(plan.monthly_cents)} / month` : "Free"}
            </div>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${statusTone}`}>
            {plan.status.replace("_", " ")}
          </span>
        </div>

        {plan.status === "past_due" && (
          <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2 text-xs text-rose-900">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>Your last payment failed. Reach out to your agency contact to get this resolved.</div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          {plan.current_period_end && (
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-muted-foreground">Renews</div>
              <div className="font-semibold mt-0.5">{new Date(plan.current_period_end).toLocaleDateString()}</div>
            </div>
          )}
          {plan.started_at && (
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-muted-foreground">Started</div>
              <div className="font-semibold mt-0.5">{new Date(plan.started_at).toLocaleDateString()}</div>
            </div>
          )}
        </div>

        {plan.setup_fees_outstanding_cents > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-900">
            <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">{dollars(plan.setup_fees_outstanding_cents)}</span> in
              setup fees outstanding. You'll receive a Stripe invoice when your agency triggers it.
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Recent invoices</h3>
        </div>
        {plan.recent_payments.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</div>
        ) : (
          <div className="divide-y">
            {plan.recent_payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold capitalize truncate">
                    {p.description ?? `${p.type} payment`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "Pending"} · {p.type}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.status === "paid"
                    ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                    : <AlertCircle className="h-3.5 w-3.5 text-rose-600" />}
                  <div className={p.status === "paid" ? "text-emerald-600 font-semibold text-sm" : "text-rose-600 font-semibold text-sm"}>
                    {dollars(p.amount_cents)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
