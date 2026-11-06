"use client";
/**
 * Memberships → "Your membership": the clinic's single membership, moved from
 * the old portal's Membership tab. Same read + write (membership_billing_public,
 * upsert_membership_billing_v3), and every column goes back on save, so anything
 * set up on the old portal (passes, payment mode, credit, multiplier) is kept.
 *
 * Only what the med spa app sells is editable. The app sells the monthly price
 * (lib/plans.ts readPlans), takes cards through Stripe when it's connected and
 * otherwise offers book / text / call (api/[clinic]/checkout), so the old portal's
 * passes, payment-mode tiles and sales video would be switches that do nothing.
 * The points multiplier is left out too: no database function applies it when
 * awarding points, and this app doesn't show it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeskApi, MembershipSetup, PayoutStatus } from "@/lib/desk-api";
import { priceLabel } from "@/lib/plans";
import { IcCheck, IcClose, IcCrown, IcNext } from "../icons";
import { Modal } from "./ui";

const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const BLANK: MembershipSetup = {
  is_enabled: false, membership_name: "", image_url: null, perks: [], points_multiplier: 1, has_priority_booking: false, monthly_cash_balance_cents: 0,
  offer_monthly: true, price_cents: 0, pass_options: [], payment_mode: "in_person", external_payment_url: null, payment_instructions: null,
};

export function MembershipSetupCard({ api, say, plansInBuilder, onOpenPayouts }: { api: DeskApi; say: (t: string) => void; plansInBuilder: number; onOpenPayouts: () => void }) {
  const [m, setM] = useState<MembershipSetup | null | undefined>(undefined);
  const [stripe, setStripe] = useState<PayoutStatus | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const load = useCallback(() => { api.membershipSetup().then(setM).catch((e) => setErr((e as Error).message)); }, [api]);
  useEffect(() => { load(); api.payoutStatus().then(setStripe).catch(() => setStripe(null)); }, [api, load]);

  if (err) return <p className={`${card} px-5 py-4 text-[14px] text-red-600`}>{err}</p>;
  if (m === undefined) return <div className="h-32 animate-pulse rounded-[16px] bg-white/70" />;
  const live = !!m?.is_enabled && (m?.price_cents ?? 0) > 0;
  const hidden = plansInBuilder > 0;
  const cards = !!stripe?.charges_enabled;
  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold">Your membership</h2>
          <p className="text-[12.5px] text-sub">{hidden ? `Your ${plansInBuilder} App Builder plan${plansInBuilder === 1 ? " is" : "s are"} what patients see, so this one is hidden.` : "What patients can join in the app when you have no App Builder plans."}</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="h-9 shrink-0 rounded-full bg-ink px-4 text-[13px] font-semibold text-white">{m ? "Edit" : "Set up"}</button>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-[12px] bg-[#F7F8F8] p-2.5">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-ink text-white">
          {m?.image_url
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={m.image_url} alt="" className="h-full w-full object-cover" />
            : <IcCrown className="h-6 w-6" />}
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{m?.membership_name || "Not set up yet"}</span>
          <span className="block text-[12.5px] text-sub">{m?.price_cents ? `${priceLabel(m.price_cents)}/month` : "No price yet"}{m?.perks.length ? ` · ${m.perks.length} perk${m.perks.length === 1 ? "" : "s"}` : ""}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${live ? "bg-emerald-50 text-emerald-700" : "bg-[#ECEEEF] text-sub"}`}>{live ? "Live" : "Not live"}</span>
      </div>
      {stripe !== undefined && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-sub">
          {cards ? <><IcCheck className="h-3.5 w-3.5 text-emerald-700" />Patients pay by card through your Stripe.</> : <>Stripe isn&apos;t connected, so Subscribe offers book, text or call instead of a card.</>}
          {!cards && <button type="button" onClick={onOpenPayouts} className="inline-flex items-center gap-0.5 font-semibold text-brand">Connect in Payouts <IcNext className="h-3 w-3" strokeWidth={2.4} /></button>}
        </p>
      )}
      {!!m?.pass_options.length && <p className="mt-1.5 text-[12.5px] text-faint">{m.pass_options.length} pass{m.pass_options.length === 1 ? "" : "es"} from the old portal {m.pass_options.length === 1 ? "is" : "are"} kept, but the app only sells the monthly price.</p>}
      {editing && <MembershipModal api={api} init={m ?? BLANK} onClose={() => setEditing(false)} onSaved={(wentLive) => { setEditing(false); say(wentLive ? "Saved · live in the app" : "Saved · not live yet"); load(); }} />}
    </section>
  );
}

function MembershipModal({ api, init, onClose, onSaved }: { api: DeskApi; init: MembershipSetup; onClose: () => void; onSaved: (live: boolean) => void }) {
  const [m, setM] = useState<MembershipSetup>(init);
  const [price, setPrice] = useState(init.price_cents ? String(init.price_cents / 100) : "");
  const [perk, setPerk] = useState("");
  const [busy, setBusy] = useState<"save" | "photo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<MembershipSetup>) => setM((x) => ({ ...x, ...p }));
  const cents = Math.round((parseFloat(price) || 0) * 100);
  const canGoLive = cents > 0;

  async function photo(f: File) {
    setBusy("photo"); setErr(null);
    try { set({ image_url: await api.uploadImage(f, "membership-images") }); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }
  async function save() {
    setBusy("save"); setErr(null);
    const live = m.is_enabled && canGoLive; // never "on" with nothing to sell
    const leftover = perk.trim();
    try {
      await api.saveMembershipSetup({ ...m, is_enabled: live, price_cents: cents, offer_monthly: cents > 0 ? true : m.offer_monthly, perks: leftover ? [...m.perks, leftover] : m.perks });
      onSaved(live);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  return (
    <Modal wide title="Your membership" onClose={onClose}>
      <label className="flex items-center justify-between gap-3 rounded-[16px] bg-page px-4 py-3 text-[14px]">
        <span><b className="block">Live in the app</b><span className="text-sub">{canGoLive ? "Patients can see it and join." : "Set a monthly price first."}</span></span>
        <input type="checkbox" disabled={!canGoLive} checked={m.is_enabled && canGoLive} onChange={(e) => set({ is_enabled: e.target.checked })} className="h-5 w-5 accent-[rgb(var(--p-rgb))]" />
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_170px]">
        <div className="space-y-3">
          <label className="block text-[13px] font-semibold">Name
            <input className="field mt-1.5 h-[52px] text-[16px] font-normal" maxLength={40} placeholder="Glow Club" value={m.membership_name} onChange={(e) => set({ membership_name: e.target.value })} />
          </label>
          <label className="block text-[13px] font-semibold">Monthly price
            <span className="mt-1.5 flex h-[52px] items-center gap-1.5 rounded-[16px] bg-white px-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink/80">
              <span className="text-faint">$</span>
              <input inputMode="decimal" className="h-full w-full bg-transparent text-[16px] font-normal outline-none" placeholder="99" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} />
              <span className="shrink-0 text-[13.5px] font-normal text-faint">/month</span>
            </span>
          </label>
        </div>
        <div>
          <p className="text-[13px] font-semibold">Photo</p>
          <button type="button" onClick={() => file.current?.click()} className="relative mt-1.5 block aspect-square w-full overflow-hidden rounded-[16px] bg-page sm:h-[132px]">
            {m.image_url
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={m.image_url} alt="" className="h-full w-full object-cover" />
              : <span className="grid h-full place-items-center text-[13px] text-sub">{busy === "photo" ? "Uploading…" : "Add a photo"}</span>}
            {m.image_url && <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2.5 py-0.5 text-[12px] font-semibold">{busy === "photo" ? "Uploading…" : "Change"}</span>}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) photo(f); e.target.value = ""; }} />
        </div>
      </div>
      <p className="mt-4 text-[13px] font-semibold">What members get</p>
      <ul className="mt-1.5 space-y-1.5">
        {m.perks.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <input aria-label={`Perk ${i + 1}`} maxLength={80} value={p} onChange={(e) => set({ perks: m.perks.map((x, j) => (j === i ? e.target.value : x)) })} className="h-10 flex-1 rounded-[10px] bg-[#F4F5F6] px-3 text-[14px] outline-none focus:ring-2 focus:ring-brand/30" />
            <button type="button" aria-label={`Remove perk ${i + 1}`} onClick={() => set({ perks: m.perks.filter((_, j) => j !== i) })} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page"><IcClose className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
      <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (perk.trim()) { set({ perks: [...m.perks, perk.trim()] }); setPerk(""); } }}>
        <input aria-label="New perk" maxLength={80} placeholder="e.g. A facial every month" value={perk} onChange={(e) => setPerk(e.target.value)} className="h-10 flex-1 rounded-[10px] bg-[#F4F5F6] px-3 text-[14px] outline-none placeholder:text-faint focus:ring-2 focus:ring-brand/30" />
        <button type="submit" className="h-10 shrink-0 rounded-full bg-page px-4 text-[13px] font-semibold">Add</button>
      </form>
      {err &&<p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
      <button type="button" className="btn-ink mt-5" disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save membership"}</button>
    </Modal>
  );
}
