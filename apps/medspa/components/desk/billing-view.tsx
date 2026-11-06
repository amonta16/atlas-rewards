"use client";
/**
 * Desk → Billing (managers): what this clinic pays Atlas, moved from the old
 * portal (my_business_billing). Read-only: Atlas sets the plan. The money
 * patients pay the clinic is on Desk → Payouts.
 */
import { useEffect, useState } from "react";
import type { AtlasBilling, DeskApi } from "@/lib/desk-api";
import { IcCheck, IcClose, IcNext } from "../icons";

const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const dollars = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700", trialing: "bg-tint text-brand", past_due: "bg-red-50 text-red-700", paused: "bg-[#ECEEEF] text-sub", canceled: "bg-[#ECEEEF] text-faint",
};

export function BillingView({ api, demo, onOpenPayouts }: { api: DeskApi; demo: boolean; onOpenPayouts: () => void }) {
  const [plan, setPlan] = useState<AtlasBilling | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.billing().then(setPlan).catch((e) => setErr((e as Error).message)); }, [api]);
  if (err) return <p className="rounded-[14px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  if (plan === undefined) return <div className="h-48 animate-pulse rounded-[16px] bg-white/70" />;
  const payoutsLink = <button type="button" onClick={onOpenPayouts} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">Money from patients is on Payouts <IcNext className="h-3 w-3" strokeWidth={2.4} /></button>;
  if (!plan) {
    return (
      <div className="space-y-3.5">
        <section className={`${card} p-4`}>
          <h2 className="text-[15px] font-semibold">No plan yet</h2>
          <p className="mt-1 text-[13.5px] text-sub">Atlas hasn&apos;t set up a plan for this clinic yet. Reach out to your Atlas contact and they&apos;ll configure your monthly subscription.</p>
        </section>
        {payoutsLink}
      </div>
    );
  }
  return (
    <div className="space-y-3.5">
      {demo && <p className="text-[12.5px] text-sub">Sample numbers: this is the demo clinic.</p>}
      <section className={`${card} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-[12.5px] text-sub">Current plan</p><h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">{plan.plan_name}</h2><p className="text-[13.5px] text-sub">{plan.monthly_cents > 0 ? `${dollars(plan.monthly_cents)} / month` : "Free"}</p></div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold capitalize ${TONE[plan.status] ?? "bg-[#ECEEEF] text-sub"}`}>{plan.status.replace("_", " ")}</span>
        </div>
        {plan.status === "past_due" && <p className="mt-3 rounded-[10px] bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">Your last payment failed. Reach out to your Atlas contact to get this resolved.</p>}
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {plan.current_period_end && <div className="rounded-[12px] bg-[#F7F8F8] px-3.5 py-2.5"><p className="text-[12px] text-sub">Renews</p><p className="text-[14px] font-semibold">{date(plan.current_period_end)}</p></div>}
          {plan.started_at && <div className="rounded-[12px] bg-[#F7F8F8] px-3.5 py-2.5"><p className="text-[12px] text-sub">Started</p><p className="text-[14px] font-semibold">{date(plan.started_at)}</p></div>}
        </div>
        {plan.setup_fees_outstanding_cents > 0 && <p className="mt-3 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800"><b>{dollars(plan.setup_fees_outstanding_cents)}</b> in setup fees outstanding. You&apos;ll get a Stripe invoice when Atlas sends it.</p>}
      </section>
      <section className={`${card} p-4`}>
        <h2 className="text-[13.5px] font-semibold">Recent invoices</h2>
        {plan.recent_payments.length === 0 ? <p className="py-8 text-center text-[14px] text-sub">No invoices yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[460px] border-separate border-spacing-y-1 text-left text-[13.5px]">
              <thead className="text-[11.5px] text-faint"><tr><th className="px-3 py-1 font-normal">Invoice</th><th className="px-3 py-1 font-normal">Date</th><th className="px-3 py-1 font-normal">Amount</th><th className="px-3 py-1 font-normal">Status</th></tr></thead>
              <tbody>
                {plan.recent_payments.map((p, i) => (
                  <tr key={i} className="bg-[#F7F8F8]">
                    <td className="rounded-l-[10px] px-3 py-2.5 font-medium first-letter:uppercase">{p.description ?? `${p.type} payment`}</td>
                    <td className="px-3 py-2.5 text-sub">{p.paid_at ? date(p.paid_at) : "Pending"}</td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{dollars(p.amount_cents)}</td>
                    <td className="rounded-r-[10px] px-3 py-2.5">
                      {p.status === "paid"
                        ? <span className="inline-flex items-center gap-1 rounded-[6px] bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">Paid <IcCheck className="h-3.5 w-3.5" /></span>
                        : <span className="inline-flex items-center gap-1 rounded-[6px] bg-red-50 px-2 py-0.5 text-[12px] font-semibold capitalize text-red-700">{p.status.replace("_", " ")} <IcClose className="h-3 w-3" /></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {payoutsLink}
    </div>
  );
}
