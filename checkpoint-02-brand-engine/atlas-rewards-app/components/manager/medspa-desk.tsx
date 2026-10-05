"use client";
/**
 * components/manager/medspa-desk.tsx — CP-186 · the med spa front desk
 *
 * Two pieces the desk gets when layout_preset === "medspa":
 *   DueTodayCard   — on the Front desk tab: how many patients are overdue /
 *                    due this week, one tap to the list.
 *   DuePatientsPanel — the Patients tab: everyone with a recall date, grouped
 *                    Overdue · Due soon · Coming up. Open the patient (same
 *                    panel staff use after a scan) or text her the recall
 *                    message the owner wrote in the builder.
 * Data: medspa_due_patients(p_business_id) — latest logged treatment per
 * patient per treatment, with the due date and whether she already booked.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronRight, MessageSquareText, RefreshCw, Syringe } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";
import { describeDue, fillTemplate, readMedspaConfig, type DueState } from "@/lib/medspa";

export type DuePatientRow = {
  membership_id: string; user_id: string; full_name: string | null; email: string | null; phone: string | null;
  points_balance: number; tier: string; joined_at: string; visit_count: number;
  treatment_id: string; treatment_name: string; provider_name: string | null; performed_at: string; recall_weeks: number; due_at: string;
  has_upcoming_booking: boolean;
};

export function useDuePatients(businessId: string) {
  const [rows, setRows] = useState<DuePatientRow[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let off = false;
    createClient().rpc("medspa_due_patients", { p_business_id: businessId }).then(({ data }) => { if (!off) setRows((data ?? []) as DuePatientRow[]); });
    return () => { off = true; };
  }, [businessId, tick]);
  const refresh = useCallback(() => setTick((k) => k + 1), []);
  return { rows, refresh };
}

type Bucket = "overdue" | "soon" | "later";
function bucketOf(s: DueState): Bucket { return s.tone === "overdue" ? "overdue" : s.days <= 14 ? "soon" : "later"; }

export function DueTodayCard({ business, onOpenList }: { business: Business; onOpenList: () => void }) {
  const { rows } = useDuePatients(business.id);
  const counts = useMemo(() => {
    const c = { overdue: 0, soon: 0, later: 0 };
    for (const r of rows ?? []) { if (r.has_upcoming_booking) continue; c[bucketOf(describeDue(new Date(r.due_at)))]++; }
    return c;
  }, [rows]);
  const primary = business.brand_colors.primary;
  const total = counts.overdue + counts.soon;
  return (
    <button type="button" onClick={onOpenList} className="w-full rounded-2xl border bg-white p-4 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-[0.99]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: total > 0 ? "linear-gradient(135deg,#d58c86,#b86b64)" : `${primary}` }}><Syringe className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Recall</div>
          <div className="text-base font-extrabold text-zinc-900">
            {rows === null ? "Checking who's due…" : total === 0 ? "Nobody is due without a booking" : `${total} patient${total === 1 ? "" : "s"} due, not booked`}
          </div>
          {rows !== null && <div className="text-xs text-zinc-500">{counts.overdue} overdue · {counts.soon} due within 2 weeks · {counts.later} coming up</div>}
        </div>
        <ChevronRight className="h-5 w-5 text-zinc-300" />
      </div>
    </button>
  );
}

export function DuePatientsPanel({ business, onOpen }: { business: Business; onOpen: (m: DuePatientRow) => void }) {
  const { rows, refresh } = useDuePatients(business.id);
  const cfg = useMemo(() => readMedspaConfig(business.medspa_config), [business.medspa_config]);
  const [filter, setFilter] = useState<Bucket | "all">("all");
  const primary = business.brand_colors.primary;

  const grouped = useMemo(() => {
    const g: Record<Bucket, (DuePatientRow & { state: DueState })[]> = { overdue: [], soon: [], later: [] };
    for (const r of rows ?? []) { const state = describeDue(new Date(r.due_at)); g[bucketOf(state)].push({ ...r, state }); }
    return g;
  }, [rows]);

  const smsHref = (r: DuePatientRow, state: DueState) => {
    if (!r.phone) return null;
    const tpl = state.tone === "overdue" ? cfg.recall.message_followup : cfg.recall.message_due;
    const body = fillTemplate(tpl, { first_name: (r.full_name ?? "there").split(" ")[0], treatment: r.treatment_name, practice: business.name, due_date: new Date(r.due_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }), incentive: cfg.recall.incentive });
    return `sms:${r.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;
  };

  const sections: { id: Bucket; title: string; blurb: string }[] = [
    { id: "overdue", title: "Overdue", blurb: "Past their due date and no visit logged since." },
    { id: "soon", title: "Due within 2 weeks", blurb: "The best time to reach out." },
    { id: "later", title: "Coming up", blurb: "Due later; nothing to do yet." },
  ];
  const show = sections.filter((s) => filter === "all" || s.id === filter);
  const totalRows = rows?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Patients due for a treatment</h3>
            <p className="text-xs text-zinc-500">Built from what the desk logs. Log today&apos;s treatment after each visit and this list stays right.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-zinc-100 p-1">
              {([["all", "All"], ["overdue", `Overdue${grouped.overdue.length ? ` · ${grouped.overdue.length}` : ""}`], ["soon", `Due soon${grouped.soon.length ? ` · ${grouped.soon.length}` : ""}`], ["later", "Coming up"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setFilter(id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", filter === id ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-800")}>{label}</button>
              ))}
            </div>
            <button type="button" onClick={refresh} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {rows === null && <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500">Loading…</div>}
      {rows !== null && totalRows === 0 && (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center">
          <Syringe className="mx-auto h-8 w-8 text-zinc-300" />
          <div className="mt-2 font-semibold">No due dates yet</div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">Scan a patient after her visit and tap the treatment under <b>Treatment today</b>. Her due date lands here and in her app.</p>
        </div>
      )}

      {show.map((s) => grouped[s.id].length > 0 && (
        <section key={s.id}>
          <div className="mb-2 flex items-baseline gap-2 px-1"><h4 className="text-sm font-bold">{s.title}</h4><span className="text-xs text-zinc-500">{s.blurb}</span></div>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 ring-black/5">
            {grouped[s.id].map((r) => {
              const sms = smsHref(r, r.state);
              return (
                <li key={`${r.user_id}:${r.treatment_id}`} className="flex items-center gap-3 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: s.id === "overdue" ? "#b86b64" : primary }}>{(r.full_name ?? "?")[0].toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate font-semibold">{r.full_name ?? "Unnamed patient"}</span>
                      {r.has_upcoming_booking && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"><CalendarCheck className="h-3 w-3" />Booked</span>}
                    </div>
                    <div className="text-xs text-zinc-500">
                      <b className={cn("font-semibold", s.id === "overdue" ? "text-[#b86b64]" : "text-zinc-800")}>{r.treatment_name}</b> · {r.state.label} · last {new Date(r.performed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}{r.provider_name ? ` with ${r.provider_name.split(" ")[0]}` : ""}
                    </div>
                  </div>
                  {sms && !r.has_upcoming_booking && (
                    <a href={sms} className="hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 sm:inline-flex"><MessageSquareText className="h-3.5 w-3.5" />Text</a>
                  )}
                  <button type="button" onClick={() => onOpen(r)} className="rounded-xl px-3 py-2 text-xs font-bold text-white" style={{ background: primary }}>Open</button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ───────────────────────── CP-190: Shop orders at the desk ───────────────────────── */

type DeskOrder = {
  id: string; user_id: string; full_name: string | null; phone: string | null; email: string | null;
  item_id: string; item_name: string; kind: "product" | "package" | "gift_card"; quantity: number; amount_cents: number;
  status: "reserved" | "paid" | "fulfilled"; pay_method: string; treatment_id: string | null; sessions_total: number | null; sessions_used: number;
  gift_code: string | null; gift_balance_cents: number | null; recipient_name: string | null; created_at: string;
};

const money = (c: number | null | undefined) => `$${((c ?? 0) / 100).toLocaleString(undefined, { maximumFractionDigits: (c ?? 0) % 100 ? 2 : 0 })}`;

export function ShopOrdersPanel({ business }: { business: Business }) {
  const [rows, setRows] = useState<DeskOrder[] | null>(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<"todo" | "packages" | "gifts" | "done">("todo");
  const [code, setCode] = useState("");
  const [redeem, setRedeem] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const primary = business.brand_colors.primary;
  useEffect(() => {
    let off = false;
    createClient().rpc("medspa_shop_orders_desk", { p_business_id: business.id }).then(({ data }) => { if (!off) setRows((data ?? []) as DeskOrder[]); });
    return () => { off = true; };
  }, [business.id, tick]);

  async function set(id: string, patch: Record<string, unknown>) {
    const { error } = await createClient().from("medspa_shop_orders").update(patch).eq("id", id);
    setMsg(error ? error.message : null);
    setTick((k) => k + 1);
  }

  const all = rows ?? [];
  const todo = all.filter((o) => o.status === "reserved" || (o.status === "paid" && o.kind === "product"));
  const packages = all.filter((o) => o.kind === "package" && o.status === "paid");
  const gifts = all.filter((o) => o.kind === "gift_card" && o.status !== "fulfilled");
  const done = all.filter((o) => o.status === "fulfilled");
  const list = filter === "todo" ? todo : filter === "packages" ? packages : filter === "gifts" ? gifts : done;
  const found = code.trim().length >= 4 ? all.find((o) => o.gift_code && o.gift_code.replace("-", "") === code.trim().toUpperCase().replace("-", "")) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-bold">Shop orders</h3><p className="text-xs text-zinc-500">Reserved orders to collect, skincare to hand over, packages in progress, gift cards.</p></div>
          <div className="flex rounded-xl bg-zinc-100 p-1">
            {([["todo", `To do${todo.length ? ` · ${todo.length}` : ""}`], ["packages", "Packages"], ["gifts", "Gift cards"], ["done", "Done"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === id ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>{label}</button>
            ))}
          </div>
        </div>
        {/* Gift card lookup */}
        <div className="mt-4 grid gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-[1fr_auto]">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Gift card code, e.g. K7QM-28RX" className="h-10 rounded-lg border bg-white px-3 font-mono text-sm tracking-widest" />
          {found ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">{money(found.gift_balance_cents)} left</span>
              {found.status === "paid" ? (
                <>
                  <input value={redeem} onChange={(e) => setRedeem(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Use $" className="h-10 w-20 rounded-lg border bg-white px-2 text-sm" />
                  <button type="button" onClick={() => { const c = Math.min(found.gift_balance_cents ?? 0, Math.round(parseFloat(redeem || "0") * 100)); if (c > 0) { const left = (found.gift_balance_cents ?? 0) - c; set(found.id, { gift_balance_cents: left, ...(left === 0 ? { status: "fulfilled", fulfilled_at: new Date().toISOString() } : {}) }); setRedeem(""); } }} className="h-10 rounded-lg px-3 text-xs font-bold text-white" style={{ background: primary }}>Apply</button>
                </>
              ) : <span className="text-xs text-amber-700">Not paid yet</span>}
            </div>
          ) : <span className="self-center text-xs text-zinc-400">{code.trim().length >= 4 ? "No match" : ""}</span>}
        </div>
        {msg && <p className="mt-2 text-sm text-rose-600">{msg}</p>}
      </div>

      {rows === null && <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500">Loading…</div>}
      {rows !== null && list.length === 0 && <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-zinc-500">{filter === "todo" ? "Nothing to hand over or collect right now." : "Nothing here yet."}</div>}
      {list.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 ring-black/5">
          {list.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 p-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: primary }}>{(o.full_name ?? "?")[0].toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{o.item_name}{o.quantity > 1 ? ` × ${o.quantity}` : ""} <span className="font-normal text-zinc-500">· {o.full_name ?? "Patient"}</span></div>
                <div className="text-xs text-zinc-500">
                  {money(o.amount_cents)} · {o.status === "reserved" ? <b className="text-amber-700">pay at the desk</b> : o.status === "paid" ? `paid ${o.pay_method === "stripe" ? "in the app" : "at the desk"}` : "done"} · {new Date(o.created_at).toLocaleDateString()}
                  {o.kind === "package" && o.sessions_total ? ` · ${o.sessions_total - o.sessions_used} of ${o.sessions_total} sessions left` : ""}
                  {o.kind === "gift_card" && o.gift_code ? ` · ${o.gift_code} · ${money(o.gift_balance_cents)} left` : ""}
                </div>
              </div>
              {o.status === "reserved" && <button type="button" onClick={() => set(o.id, { status: "paid", paid_at: new Date().toISOString(), pay_method: "in_person" })} className="rounded-xl px-3 py-2 text-xs font-bold text-white" style={{ background: primary }}>Mark paid</button>}
              {o.status === "paid" && o.kind === "product" && <button type="button" onClick={() => set(o.id, { status: "fulfilled", fulfilled_at: new Date().toISOString() })} className="rounded-xl border px-3 py-2 text-xs font-bold">Picked up</button>}
              {o.status === "reserved" && <button type="button" onClick={() => set(o.id, { status: "cancelled" })} className="rounded-xl px-2 py-2 text-xs text-zinc-400 hover:text-rose-600">Cancel</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-xs text-zinc-500">Package sessions are used from the patient&apos;s screen: log the treatment and tick &ldquo;Use a package session&rdquo;. Refunds for app payments go through the practice&apos;s Stripe dashboard.</p>
    </div>
  );
}
