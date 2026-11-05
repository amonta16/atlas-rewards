"use client";
/**
 * Client profiles · Memberships · Payouts, plus the Google review queue the
 * front desk confirms. Everything here used to live on the old portal desk;
 * same database functions, so nothing about the data changes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { optimizedUrl } from "@atlas/core/img";
import type { DeskApi, DeskMember, OrderRow, PayoutStatus, PendingMember, PendingReview } from "@/lib/desk-api";
import { formatPhone } from "@/lib/format";
import { priceLabel, type MedspaPlan } from "@/lib/plans";
import { IcCheck, IcGoogle, IcNext, IcSearch } from "../icons";

const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* ───────────── Client profiles ───────────── */

export function PatientsView({ api, onOpen }: { api: DeskApi; onOpen: (m: DeskMember) => void }) {
  const [rows, setRows] = useState<DeskMember[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.members().then(setRows).catch((e) => setErr((e as Error).message)); }, [api]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return (rows ?? []).filter((m) => !term || (m.full_name ?? "").toLowerCase().includes(term) || (m.email ?? "").toLowerCase().includes(term) || (digits.length >= 3 && (m.phone ?? "").includes(digits)));
  }, [rows, q]);
  if (err) return <p className="rounded-[14px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  return (
    <section className={`${card} p-4`}>
      <label className="flex h-10 max-w-[360px] items-center gap-2.5 rounded-[10px] bg-[#F4F5F6] px-3 focus-within:ring-2 focus-within:ring-brand/30">
        <IcSearch className="h-4 w-4 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search patients" className="h-full flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
      </label>
      {!rows ? <div className="mt-4 h-56 animate-pulse rounded-[12px] bg-page" /> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] border-separate border-spacing-y-1 text-left text-[13.5px]">
            <thead className="text-[11.5px] text-faint"><tr><th className="px-3 py-1 font-normal">Client name</th><th className="px-3 py-1 font-normal">Phone</th><th className="px-3 py-1 text-right font-normal">Points</th><th className="px-3 py-1 text-right font-normal">Visits</th><th className="px-3 py-1 font-normal">Joined</th><th /></tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.membership_id} className="bg-[#F7F8F8]">
                  <td className="rounded-l-[10px] px-3 py-2">
                    <span className="flex items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[11.5px] font-semibold ring-1 ring-line">{initials(m.full_name)}</span><span className="font-medium">{m.full_name ?? "No name yet"}</span></span>
                  </td>
                  <td className="px-3 py-2 text-sub">{formatPhone(m.phone) || m.email || "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{m.points_balance.toLocaleString("en-US")}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-sub">{m.visit_count ?? 0}</td>
                  <td className="px-3 py-2 text-sub">{date(m.joined_at)}</td>
                  <td className="rounded-r-[10px] px-3 py-2 text-right"><button type="button" onClick={() => onOpen(m)} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-[12.5px] font-semibold text-white">Open <IcNext className="h-3 w-3" strokeWidth={2.4} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-10 text-center text-[14px] text-sub">{rows.length ? "Nobody matches that search." : "Patients show up here when they join the app."}</p>}
        </div>
      )}
    </section>
  );
}

/* ───────────── Reviews to confirm (Check in) ───────────── */

export function ReviewsCard({ api, say, onChanged }: { api: DeskApi; say: (t: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<PendingReview[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api.pendingReviews().then(setRows).catch(() => setRows([])); }, [api]);
  useEffect(() => { load(); }, [load]);
  if (!rows.length) return null;
  const decide = async (r: PendingReview, ok: boolean) => {
    setBusy(r.id);
    try { await api.decideReview(r.id, ok); say(ok ? `Review confirmed · points added for ${r.member_name ?? "the patient"}` : "Review declined"); load(); onChanged(); } catch (e) { say((e as Error).message); }
    setBusy(null);
  };
  return (
    <section className={`${card} p-4`}>
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold"><IcGoogle className="h-4 w-4" />Google reviews to confirm</h2>
      <ul className="mt-2.5 space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-[10px] bg-[#F4F5F6] px-3 py-2.5">
            <p className="text-[13.5px] font-semibold">{r.member_name ?? r.member_email ?? "Patient"}</p>
            <p className="text-[12.5px] text-sub">Says they left a review · {date(r.submitted_at)}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className="h-8 rounded-full bg-ink px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60">Confirm</button>
              <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className="h-8 rounded-full bg-white px-3.5 text-[12.5px] font-semibold ring-1 ring-line disabled:opacity-60">Decline</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────── Memberships ───────────── */

export function MembershipsView({ api, say, plans, onEdit }: { api: DeskApi; say: (t: string) => void; plans: MedspaPlan[]; onEdit?: () => void }) {
  const [paying, setPaying] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingMember[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api.pendingMemberships().then(setPending).catch(() => setPending([])); }, [api]);
  useEffect(() => { load(); api.overview().then((o) => setPaying(o.members_paid)).catch(() => {}); }, [api, load]);
  const decide = async (m: PendingMember, ok: boolean) => {
    setBusy(m.membership_id);
    try { await api.decideMembership(m.membership_id, ok); say(ok ? `${m.full_name ?? "Member"} is now a member` : "Request declined"); load(); } catch (e) { say((e as Error).message); }
    setBusy(null);
  };
  const live = plans.filter((p) => p.is_active !== false);
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className={`${card} p-4`}><p className="text-[24px] font-bold tabular-nums tracking-[-0.02em]">{paying?.toLocaleString("en-US") ?? "—"}</p><p className="text-[12.5px] text-sub">Active memberships</p></div>
        <div className={`${card} p-4`}><p className="text-[24px] font-bold tabular-nums tracking-[-0.02em]">{live.length}</p><p className="text-[12.5px] text-sub">Plans in the app</p></div>
      </div>

      {!!pending?.length && (
        <section className={`${card} p-4`}>
          <h2 className="text-[13.5px] font-semibold">Waiting to be activated</h2>
          <ul className="mt-2.5 space-y-2">
            {pending.map((m) => (
              <li key={m.membership_id} className="flex flex-wrap items-center gap-3 rounded-[10px] bg-[#F4F5F6] px-3 py-2.5">
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{m.full_name ?? m.email ?? "Patient"}</span><span className="block text-[12.5px] text-sub">{m.pending_plan?.label ?? "Membership"}{m.pending_plan?.price_cents ? ` · ${priceLabel(m.pending_plan.price_cents)}` : ""} · {formatPhone(m.phone) || "no phone"}</span></span>
                <button type="button" disabled={busy === m.membership_id} onClick={() => decide(m, true)} className="h-8 rounded-full bg-ink px-3.5 text-[12.5px] font-semibold text-white disabled:opacity-60">Activate</button>
                <button type="button" disabled={busy === m.membership_id} onClick={() => decide(m, false)} className="h-8 rounded-full bg-white px-3.5 text-[12.5px] font-semibold ring-1 ring-line disabled:opacity-60">Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-[13.5px] font-semibold">Plans</h2>{onEdit && <button type="button" onClick={onEdit} className="text-[12.5px] font-semibold text-brand">Edit in App Builder</button>}</div>
        {live.length === 0 ? <p className="py-8 text-center text-[14px] text-sub">No plans yet. Add one in App Builder → Membership.</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {live.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-[12px] bg-[#F7F8F8] p-2.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-ink">
                  {p.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={optimizedUrl(p.image_url, 120)} alt="" className="photo-bw h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{p.name}</span><span className="block text-[12.5px] text-sub">{priceLabel(p.price_cents)}/month{p.commitment_months ? ` · ${p.commitment_months} mo min` : ""}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────────── Payouts ───────────── */

export function PayoutsView({ api, slug, demo }: { api: DeskApi; slug: string; demo: boolean }) {
  const [status, setStatus] = useState<PayoutStatus | undefined>(undefined);
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.payoutStatus().then(setStatus).catch(() => setStatus(null));
    api.orders().then((o) => setRows(o.filter((x) => x.pay_method === "stripe" && (x.status === "paid" || x.status === "fulfilled")))).catch(() => setRows([]));
  }, [api]);
  const ready = !!status?.charges_enabled && !!status?.payouts_enabled;

  async function connect() {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/${slug}/desk/stripe-onboard`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { url?: string; error?: string } | undefined;
    if (data?.url) { window.location.href = data.url; return; }
    setErr(data?.error ?? "Couldn't reach Stripe. Please try again."); setBusy(false);
  }

  return (
    <div className="space-y-3.5">
      <section className={`${card} flex flex-wrap items-center gap-4 p-4`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{status === undefined ? "Checking Stripe…" : ready ? "Payouts are on" : status ? "Finish setting up Stripe" : "Connect Stripe to get paid"}</span>
          <span className="mt-0.5 block text-[13px] text-sub">{ready ? "Patients pay you directly. Stripe sends the money to your bank." : "Patients pay you directly through your own Stripe account. Atlas never holds the money."}</span>
          {err && <span className="mt-1 block text-[13px] text-red-600">{err}</span>}
        </span>
        {ready
          ? <a href="https://dashboard.stripe.com/payouts" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-full bg-ink px-4 text-[13px] font-semibold text-white">Open Stripe <IcNext className="h-3.5 w-3.5" strokeWidth={2.2} /></a>
          : status !== undefined && !demo && <button type="button" disabled={busy} onClick={connect} className="h-9 rounded-full bg-brand px-4 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? "Opening…" : status ? "Continue setup" : "Connect Stripe"}</button>}
      </section>

      <section className={`${card} p-4`}>
        <h2 className="text-[13.5px] font-semibold">History</h2>
        {!rows ? <div className="mt-3 h-40 animate-pulse rounded-[12px] bg-page" /> : rows.length === 0 ? <p className="py-10 text-center text-[14px] text-sub">App payments show up here.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-left text-[13.5px]">
              <thead className="text-[11.5px] text-faint"><tr><th className="px-3 py-1 font-normal">Client name</th><th className="px-3 py-1 font-normal">Item</th><th className="px-3 py-1 font-normal">Date</th><th className="px-3 py-1 font-normal">Amount</th><th className="px-3 py-1 font-normal">Status</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="bg-[#F7F8F8]">
                    <td className="rounded-l-[10px] px-3 py-2.5 font-medium">{o.full_name ?? "Patient"}</td>
                    <td className="px-3 py-2.5 text-sub">{o.item_name}</td>
                    <td className="px-3 py-2.5 text-sub">{date(o.created_at)}</td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">{priceLabel(o.amount_cents)}</td>
                    <td className="rounded-r-[10px] px-3 py-2.5"><span className="inline-flex items-center gap-1 rounded-[6px] bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">Succeeded <IcCheck className="h-3.5 w-3.5" /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
