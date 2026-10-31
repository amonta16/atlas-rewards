"use client";
/**
 * Med spa front desk, Dermis-style: a soft, light dashboard.
 *
 *   Check in  · find a patient by phone / name / code, or scan their QR
 *               (patient check-in code, reward voucher or gift) → patient panel
 *   Due       · patients due for their next treatment (recall)
 *   Orders    · Shop orders to take payment for / hand over
 *   Activity  · the latest points activity at the clinic
 *
 * All reads and writes go through lib/desk-api.ts (the same database
 * functions as the patient app and the manager portal).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { demoDeskApi, liveDeskApi, type ActivityRow, type DeskApi, type DeskGift, type DeskMember, type DeskVoucher, type DueRow, type LookupResult, type OrderRow, type PatientDetail, type Provider, type Treatment } from "@/lib/desk-api";
import { formatPhone } from "@/lib/format";
import { Wordmark } from "../chrome";
import { IcBag, IcCalendar, IcCheck, IcClock, IcClose, IcGift, IcNext, IcOut, IcPhone, IcQr, IcSearch, IcSpark, IcUser } from "../icons";
import type { Staff } from "@/lib/staff";

const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), { ssr: false });

type DeskClinic = {
  id: string; slug: string; name: string; logoUrl: string | null; phone: string | null; demo: boolean;
  pointsPerDollar: number; visitPoints: number;
  treatments: Treatment[]; providers: Provider[];
  rewards: { id: string; name: string; point_cost: number; image_url: string | null; description: string | null }[];
};
type View = "checkin" | "due" | "orders" | "activity";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const rel = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  return day(iso);
};
const initials = (n: string | null) => (n ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const RULE: Record<string, string> = { visit: "Check-in", purchase: "Purchase", redemption: "Reward redeemed", manual_adjust: "Points removed", reversal: "Undo", referral_referrer: "Referral", birthday: "Birthday", review: "Review" };

export function DeskApp({ clinic, staff, portalUrl }: { clinic: DeskClinic; staff: Staff; portalUrl: string | null }) {
  const api = useMemo<DeskApi>(() => (clinic.demo ? demoDeskApi(clinic.rewards, clinic.treatments) : liveDeskApi(clinic.id, clinic.slug, clinic.pointsPerDollar)), [clinic]);
  const [view, setView] = useState<View>("checkin");
  const [selected, setSelected] = useState<DeskMember | null>(null);
  const [counts, setCounts] = useState<{ due: number; orders: number }>({ due: 0, orders: 0 });
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const say = useCallback((text: string, undo?: () => void) => {
    setToast({ text, undo }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), undo ? 9000 : 3500);
  }, []);

  const refreshCounts = useCallback(() => {
    Promise.all([api.due().catch(() => []), api.orders().catch(() => [])]).then(([d, o]) => setCounts({
      due: d.filter((r) => !r.has_upcoming_booking && new Date(r.due_at).getTime() <= Date.now() + 7 * 864e5).length,
      orders: o.filter((r) => r.status === "reserved" || r.status === "paid").length,
    }));
  }, [api]);
  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const open = (m: DeskMember) => { setSelected(m); setView("checkin"); };
  const NAV: { id: View; label: string; Icon: typeof IcUser; badge?: number }[] = [
    { id: "checkin", label: "Check in", Icon: IcQr },
    { id: "due", label: "Patients due", Icon: IcClock, badge: counts.due },
    { id: "orders", label: "Shop orders", Icon: IcBag, badge: counts.orders },
    { id: "activity", label: "Activity", Icon: IcSpark },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#F4F5F7] text-ink lg:flex">
      {/* Sidebar */}
      <aside className="border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-[100dvh] lg:w-[248px] lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:pt-7">
          <Wordmark name={clinic.name} logoUrl={clinic.logoUrl} />
          <p className="mt-1 hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-faint lg:block">Front desk</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:mt-4 lg:flex-col lg:px-4">
          {NAV.map(({ id, label, Icon, badge }) => (
            <button key={id} type="button" onClick={() => setView(id)}
              className={`flex shrink-0 items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-[14.5px] font-medium transition ${view === id ? "bg-tint text-brand" : "text-sub hover:bg-page hover:text-ink"}`}>
              <Icon className="h-[19px] w-[19px]" />
              <span className="flex-1 text-left">{label}</span>
              {!!badge && <span className={`min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[11.5px] font-bold ${view === id ? "bg-brand text-white" : "bg-page text-sub"}`}>{badge}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line px-6 py-5 lg:block">
          <p className="truncate text-[14px] font-semibold">{staff.name}</p>
          <p className="text-[12.5px] text-faint">{staff.role === "business_staff" ? "Front desk" : staff.role === "agency_admin" ? "Atlas admin" : "Manager"}{clinic.demo ? " · demo" : ""}</p>
          {portalUrl && staff.isManager && (
            <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink">Manager settings <IcNext className="h-3.5 w-3.5" /></a>
          )}
          {!clinic.demo && <Link href="/auth/signout" prefetch={false} className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-ink"><IcOut className="h-3.5 w-3.5" />Sign out</Link>}
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-faint">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1 className="mt-0.5 text-[28px] font-semibold tracking-[-0.025em]">{NAV.find((n) => n.id === view)!.label}</h1>
          </div>
          {clinic.demo && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[12.5px] font-semibold text-amber-800">Demo clinic: sample patients, nothing is saved</span>}
        </header>

        {view === "checkin" && <CheckIn api={api} clinic={clinic} selected={selected} onSelect={setSelected} say={say} onChanged={refreshCounts} />}
        {view === "due" && <Due api={api} clinic={clinic} onOpen={open} />}
        {view === "orders" && <Orders api={api} say={say} onChanged={refreshCounts} />}
        {view === "activity" && <Activity api={api} />}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 animate-rise items-center gap-4 rounded-full bg-ink py-3 pl-5 pr-3 text-[14.5px] text-white shadow-2xl">
          <IcCheck className="h-5 w-5 text-emerald-300" />
          <span>{toast.text}</span>
          {toast.undo ? (
            <button type="button" onClick={() => { toast.undo!(); setToast(null); }} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13.5px] font-semibold">Undo</button>
          ) : <span className="w-1" />}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Check in ───────────────────────── */

function CheckIn({ api, clinic, selected, onSelect, say, onChanged }: {
  api: DeskApi; clinic: DeskClinic; selected: DeskMember | null; onSelect: (m: DeskMember | null) => void;
  say: (t: string, undo?: () => void) => void; onChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [scan, setScan] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function run(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const r = await api.lookup(value);
      setResult(r);
      if (r.kind === "members" && r.members.length === 1) onSelect(r.members[0]);
    } catch (e) { setResult({ kind: "none", message: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,400px)_1fr]">
      <div className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="rounded-[22px] bg-white p-4 shadow-[0_10px_30px_-22px_rgba(23,27,38,.4)]">
          <label className="flex h-[54px] items-center gap-3 rounded-[16px] bg-page px-4 focus-within:ring-2 focus-within:ring-brand/40">
            <IcSearch className="h-5 w-5 text-faint" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone, name or code"
              className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" aria-label="Find a patient" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="submit" disabled={busy} className="h-11 rounded-full bg-ink text-[14.5px] font-semibold text-white disabled:opacity-60">{busy ? "Looking…" : "Find"}</button>
            <button type="button" onClick={() => setScan(true)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-tint text-[14.5px] font-semibold text-brand"><IcQr className="h-[18px] w-[18px]" />Scan QR</button>
          </div>
        </form>

        {result?.kind === "none" && <p className="rounded-[18px] bg-white px-5 py-4 text-[14.5px] text-sub">{result.message}</p>}
        {result?.kind === "members" && (
          <ul className="overflow-hidden rounded-[22px] bg-white shadow-[0_10px_30px_-22px_rgba(23,27,38,.4)]">
            {result.members.map((m) => (
              <li key={m.membership_id}>
                <button type="button" onClick={() => onSelect(m)} className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition ${selected?.membership_id === m.membership_id ? "bg-tint" : "hover:bg-page"}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-page text-[14px] font-semibold">{initials(m.full_name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold">{m.full_name ?? "No name yet"}</span>
                    <span className="block text-[13px] text-sub">{formatPhone(m.phone) || m.email || "—"}</span>
                  </span>
                  <span className="text-right text-[13px] text-sub"><b className="block text-[15px] text-ink">{m.points_balance.toLocaleString("en-US")}</b>pts</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {result?.kind === "voucher" && <VoucherCard api={api} v={result.voucher} say={say} onDone={() => setResult(null)} />}
        {result?.kind === "gift" && <GiftCard api={api} g={result.gift} say={say} onDone={() => setResult(null)} />}
        {!result && (
          <div className="rounded-[22px] border border-dashed border-line px-5 py-6 text-[14px] leading-relaxed text-sub">
            Ask for the patient&apos;s phone number, or scan the QR in their app: their <b className="text-ink">check-in code</b>, a <b className="text-ink">reward voucher</b> or a <b className="text-ink">gift</b>.
          </div>
        )}
      </div>

      <div>
        {selected
          ? <PatientPanel key={selected.membership_id} api={api} clinic={clinic} member={selected} onClose={() => onSelect(null)} say={say} onChanged={onChanged}
              onPoints={(pts) => setResult((r) => (r?.kind === "members" ? { ...r, members: r.members.map((x) => (x.membership_id === selected.membership_id ? { ...x, points_balance: pts } : x)) } : r))} />
          : <div className="hidden h-full min-h-[420px] place-items-center rounded-[26px] bg-white/60 text-center xl:grid">
              <div><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white shadow-card"><IcUser className="h-6 w-6 text-faint" /></span><p className="mt-3 text-[15px] text-sub">Find a patient to check them in</p></div>
            </div>}
      </div>

      {scan && (
        <Modal title="Scan a QR code" onClose={() => setScan(false)}>
          <div className="overflow-hidden rounded-[18px] bg-black">
            <Scanner onScan={(codes) => { const v = codes?.[0]?.rawValue; if (v) { setScan(false); setQ(v); run(v); } }} components={{ finder: true }} styles={{ container: { width: "100%" } }} />
          </div>
          <p className="mt-3 text-center text-[13.5px] text-sub">Point the camera at the code in the patient&apos;s app.</p>
        </Modal>
      )}
    </div>
  );
}

function VoucherCard({ api, v, say, onDone }: { api: DeskApi; v: DeskVoucher; say: (t: string) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const used = !!v.fulfilled_at || v.status === "fulfilled";
  const expired = !!v.expires_at && new Date(v.expires_at).getTime() < Date.now();
  return (
    <div className="rounded-[22px] bg-white p-5 shadow-[0_10px_30px_-22px_rgba(23,27,38,.4)]">
      <p className="eyebrow">Reward voucher · {v.code}</p>
      <h3 className="mt-1.5 text-[20px] font-semibold leading-tight">{v.reward_name}</h3>
      <p className="mt-1 text-[14px] text-sub">{v.member_name ?? "Patient"} · {v.point_cost.toLocaleString("en-US")} pts already taken</p>
      {used ? <p className="mt-4 rounded-[14px] bg-page px-4 py-3 text-[14px] text-sub">Already handed over on {day(v.fulfilled_at)}.</p>
        : expired ? <p className="mt-4 rounded-[14px] bg-red-50 px-4 py-3 text-[14px] text-red-700">Expired on {day(v.expires_at)}.</p>
        : <button type="button" disabled={busy} className="btn-ink mt-4" onClick={async () => { setBusy(true); try { await api.handOver({ kind: "voucher", id: v.redemption_id }); say(`${v.reward_name} handed over`); onDone(); } catch (e) { say((e as Error).message); } setBusy(false); }}>{busy ? "Saving…" : "Hand over reward"}</button>}
    </div>
  );
}

function GiftCard({ api, g, say, onDone }: { api: DeskApi; g: DeskGift; say: (t: string) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const expired = !!g.expires_at && new Date(g.expires_at).getTime() < Date.now();
  return (
    <div className="rounded-[22px] bg-white p-5 shadow-[0_10px_30px_-22px_rgba(23,27,38,.4)]">
      <p className="eyebrow">Gift · {g.redeem_code}</p>
      <h3 className="mt-1.5 text-[20px] font-semibold leading-tight">{g.gift_reward_name ?? g.title}</h3>
      <p className="mt-1 text-[14px] text-sub">{g.full_name ?? "Patient"} · {g.title}</p>
      {g.fulfilled_at ? <p className="mt-4 rounded-[14px] bg-page px-4 py-3 text-[14px] text-sub">Already used on {day(g.fulfilled_at)}.</p>
        : expired ? <p className="mt-4 rounded-[14px] bg-red-50 px-4 py-3 text-[14px] text-red-700">Expired on {day(g.expires_at)}.</p>
        : <button type="button" disabled={busy} className="btn-ink mt-4" onClick={async () => { setBusy(true); try { await api.handOver({ kind: "gift", id: g.saved_id }); say("Gift applied"); onDone(); } catch (e) { say((e as Error).message); } setBusy(false); }}>{busy ? "Saving…" : "Apply gift"}</button>}
    </div>
  );
}

/* ───────────────────────── Patient panel ───────────────────────── */

function PatientPanel({ api, clinic, member, onClose, say, onChanged, onPoints }: {
  api: DeskApi; clinic: DeskClinic; member: DeskMember; onClose: () => void; say: (t: string, undo?: () => void) => void; onChanged: () => void; onPoints?: (pts: number) => void;
}) {
  const [m, setM] = useState(member);
  const [d, setD] = useState<PatientDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<"purchase" | "treatment" | "remove" | null>(null);
  const load = useCallback(() => { api.patient(m).then((x) => { setD(x); setM((p) => ({ ...p, points_balance: x.points })); onPoints?.(x.points); }).catch((e) => setErr((e as Error).message)); }, [api, m.membership_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<string | null>, undoable = false) => {
    setBusy(key); setErr(null);
    try {
      const msg = await fn();
      load(); onChanged();
      if (msg) say(msg, undoable ? async () => { try { const r = await api.undoLast(m); say(r.undone ? `Undid ${r.undone} pts` : "Nothing to undo"); load(); } catch (e) { say((e as Error).message); } } : undefined);
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };

  const pending = d?.store.filter((r) => r.kind !== "reward") ?? [];
  const rewards = d?.store.filter((r) => r.kind === "reward") ?? [];

  return (
    <section className="animate-rise space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-[26px] bg-white p-6 shadow-[0_14px_40px_-26px_rgba(23,27,38,.45)]">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
        <div className="flex items-center gap-4 pr-10">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-ink text-[20px] font-semibold text-white">{initials(m.full_name)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-[24px] font-semibold tracking-[-0.02em]">{m.full_name ?? "No name yet"}</h2>
            <p className="flex flex-wrap items-center gap-x-3 text-[14px] text-sub">
              {m.phone && <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 hover:text-ink"><IcPhone className="h-3.5 w-3.5" />{formatPhone(m.phone)}</a>}
              {d?.vip?.is_member
                ? <span className="rounded-full bg-brand px-2.5 py-0.5 text-[12px] font-bold text-white">{d.vip.plan_label ?? "Member"}</span>
                : <span className="rounded-full bg-page px-2.5 py-0.5 text-[12px] font-semibold">Not a member</span>}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Stat label="Points" value={(d?.points ?? m.points_balance).toLocaleString("en-US")} big />
          <Stat label="Visits" value={String(d?.visits ?? m.visit_count ?? 0)} />
          <Stat label="Last visit" value={d?.lastVisit ? rel(d.lastVisit) : "—"} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionBtn primary busy={busy === "visit"} onClick={() => act("visit", async () => { const r = await api.checkIn(m); return r.awarded ? `Checked in · +${r.awarded} pts` : "Checked in"; }, true)}>
            <IcCheck className="h-[18px] w-[18px]" />Check in{clinic.visitPoints ? ` · +${clinic.visitPoints}` : ""}
          </ActionBtn>
          <ActionBtn onClick={() => setModal("purchase")}><IcBag className="h-[18px] w-[18px]" />Add purchase</ActionBtn>
          <ActionBtn onClick={() => setModal("treatment")} disabled={clinic.treatments.length === 0}><IcSpark className="h-[18px] w-[18px]" />Log treatment</ActionBtn>
          <ActionBtn onClick={() => setModal("remove")}><IcClose className="h-[16px] w-[16px]" />Remove points</ActionBtn>
        </div>
        {err && <p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
      </div>

      {!d ? <div className="h-40 animate-pulse rounded-[26px] bg-white/70" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Rewards & gifts */}
          <Card title="Rewards & gifts" className="lg:col-span-2">
            {pending.length > 0 && (
              <ul className="mb-3 space-y-2">
                {pending.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-[16px] bg-tint px-4 py-3">
                    <IcGift className="h-5 w-5 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{r.name}</span><span className="block text-[12.5px] text-sub">{r.kind === "gift" ? "Gift" : "Already redeemed in the app"}{r.code ? ` · ${r.code}` : ""}</span></span>
                    <button type="button" disabled={busy === r.id} onClick={() => act(r.id, async () => { await api.handOver({ kind: r.kind === "gift" ? "gift" : "pending", id: r.id }); return `${r.name} handed over`; })}
                      className="h-9 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-white disabled:opacity-60">{busy === r.id ? "…" : "Hand over"}</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {rewards.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-[16px] border border-line px-3.5 py-3">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold">{r.name}</span><span className="block text-[12.5px] text-sub">{r.point_cost.toLocaleString("en-US")} pts</span></span>
                  <button type="button" disabled={!r.affordable || busy === r.id}
                    onClick={() => act(r.id, async () => { await api.redeem(m, r.id); return `${r.name} redeemed · −${r.point_cost} pts`; })}
                    className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${r.affordable ? "bg-ink text-white" : "bg-page text-faint"}`}>
                    {busy === r.id ? "…" : r.affordable ? "Redeem" : `${(r.point_cost - (d.points ?? 0)).toLocaleString("en-US")} to go`}
                  </button>
                </div>
              ))}
              {rewards.length === 0 && <p className="text-[14px] text-sub">No rewards set up yet.</p>}
            </div>
          </Card>

          <Card title="Packages">
            {d.packages.length === 0 ? <p className="text-[14px] text-sub">No packages with sessions left.</p> : (
              <ul className="space-y-2.5">
                {d.packages.map((p) => (
                  <li key={p.id}>
                    <div className="flex justify-between text-[14.5px]"><span className="font-semibold">{p.item_name}</span><span className="tabular-nums text-sub">{p.sessions_total - p.sessions_used} of {p.sessions_total} left</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-page"><div className="h-full rounded-full bg-brand" style={{ width: `${((p.sessions_total - p.sessions_used) / p.sessions_total) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12.5px] text-faint">Log a treatment to use a session.</p>
          </Card>

          <Card title="Recent treatments">
            {d.treatments.length === 0 ? <p className="text-[14px] text-sub">Nothing logged yet.</p> : (
              <ul className="space-y-2.5">{d.treatments.slice(0, 5).map((t) => (
                <li key={t.id} className="flex justify-between gap-3 text-[14.5px]"><span><span className="font-semibold">{t.treatment_name}</span>{t.provider_name && <span className="text-sub"> · {t.provider_name}</span>}</span><span className="shrink-0 text-sub">{day(t.performed_at)}</span></li>
              ))}</ul>
            )}
          </Card>

          <Card title="Points history" className="lg:col-span-2">
            {d.ledger.length === 0 ? <p className="text-[14px] text-sub">No points activity yet.</p> : (
              <ul className="divide-y divide-line">{d.ledger.slice(0, 8).map((l, i) => (
                <li key={i} className="flex items-center justify-between py-2.5 text-[14.5px]">
                  <span><span className="font-medium">{RULE[l.rule_type] ?? l.rule_type.replace(/_/g, " ")}</span>{l.notes && <span className="text-sub"> · {l.notes}</span>}</span>
                  <span className="flex items-center gap-3"><span className="text-[13px] text-faint">{rel(l.created_at)}</span><b className={`w-14 text-right tabular-nums ${l.delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>{l.delta >= 0 ? "+" : ""}{l.delta}</b></span>
                </li>
              ))}</ul>
            )}
            <p className="mt-3 text-[12.5px] text-faint">Member since {day(d.joined)} · {d.lifetime.toLocaleString("en-US")} pts earned all-time</p>
          </Card>
        </div>
      )}

      {modal === "purchase" && <PurchaseModal rate={clinic.pointsPerDollar} onClose={() => setModal(null)}
        onSave={(dollars) => { setModal(null); act("purchase", async () => { const r = await api.purchase(m, dollars); return `$${dollars.toFixed(2)} purchase · +${r.awarded} pts`; }, true); }} />}
      {modal === "treatment" && <TreatmentModal treatments={clinic.treatments} providers={clinic.providers} packages={d?.packages ?? []} onClose={() => setModal(null)}
        onSave={(t, p, notes, pkg) => { setModal(null); act("treatment", async () => { await api.logTreatment(m, t, p, notes, pkg); return `${t.name} logged${pkg ? " · 1 session used" : ""}`; }); }} />}
      {modal === "remove" && <RemoveModal balance={d?.points ?? m.points_balance} onClose={() => setModal(null)}
        onSave={(n, note) => { setModal(null); act("remove", async () => { await api.removePoints(m, n, note); return `Removed ${n} pts`; }); }} />}
    </section>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-[18px] bg-page px-4 py-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${big ? "text-[26px] tracking-[-0.02em]" : "text-[18px]"}`}>{value}</p>
    </div>
  );
}
function ActionBtn({ children, onClick, primary, busy, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; busy?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-[16px] px-3 text-[14px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${primary ? "bg-brand text-white shadow-[0_10px_24px_-12px_rgb(var(--p-rgb)/.8)]" : "bg-page text-ink hover:bg-line/60"}`}>
      {busy ? "Saving…" : children}
    </button>
  );
}
function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[24px] bg-white p-5 shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)] ${className}`}>
      <h3 className="mb-3.5 text-[16px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/* ───────────────────────── Modals ───────────────────────── */

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/35 px-4" onClick={onClose}>
      <div role="dialog" aria-modal className="max-h-[calc(100dvh-2rem)] w-full max-w-[420px] animate-rise overflow-y-auto rounded-[26px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[19px] font-semibold">{title}</h3><button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

function PurchaseModal({ rate, onClose, onSave }: { rate: number; onClose: () => void; onSave: (dollars: number) => void }) {
  const [v, setV] = useState("");
  const dollars = parseFloat(v) || 0;
  const pts = Math.floor(dollars * rate);
  return (
    <Modal title="Add a purchase" onClose={onClose}>
      <label className="flex h-[64px] items-center gap-2 rounded-[18px] bg-page px-5"><span className="text-[26px] text-faint">$</span>
        <input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))} placeholder="0.00" className="h-full w-full bg-transparent text-[28px] font-semibold tabular-nums outline-none" />
      </label>
      <p className="mt-3 text-[14px] text-sub">{rate ? <>Earns <b className="text-ink">{pts.toLocaleString("en-US")} pts</b> at {rate} pt per $1.</> : "This clinic doesn't award points for purchases."}</p>
      <button type="button" className="btn-ink mt-5" disabled={dollars <= 0} onClick={() => onSave(dollars)}>Add purchase</button>
    </Modal>
  );
}

function TreatmentModal({ treatments, providers, packages, onClose, onSave }: {
  treatments: Treatment[]; providers: Provider[]; packages: PatientDetail["packages"];
  onClose: () => void; onSave: (t: Treatment, p: Provider | null, notes: string, pkg: string | null) => void;
}) {
  const [tid, setTid] = useState<string | null>(null);
  const [pid, setPid] = useState<string>("");
  const [pkg, setPkg] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const t = treatments.find((x) => x.id === tid) ?? null;
  const provs = t ? providers.filter((p) => p.treatment_ids.length === 0 || p.treatment_ids.includes(t.id)) : providers;
  const pkgs = t ? packages.filter((o) => !o.treatment_id || o.treatment_id === t.id) : [];
  return (
    <Modal title="Log a treatment" onClose={onClose}>
      <div className="flex max-h-[180px] flex-wrap gap-2 overflow-y-auto">
        {treatments.map((x) => (
          <button key={x.id} type="button" onClick={() => { setTid(x.id); setPkg(null); }}
            className={`rounded-full px-3.5 py-2 text-[13.5px] font-medium ${tid === x.id ? "bg-ink text-white" : "bg-page"}`}>{x.name}</button>
        ))}
      </div>
      {t && provs.length > 0 && (
        <select className="field mt-4" value={pid} onChange={(e) => setPid(e.target.value)}>
          <option value="">Provider (optional)</option>
          {provs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {pkgs.length > 0 && (
        <div className="mt-4 space-y-2">
          {pkgs.map((o) => (
            <label key={o.id} className="flex items-center gap-3 rounded-[14px] bg-tint px-4 py-3 text-[14px]">
              <input type="checkbox" checked={pkg === o.id} onChange={(e) => setPkg(e.target.checked ? o.id : null)} className="h-4 w-4 accent-[rgb(var(--p-rgb))]" />
              <span>Use a session from <b>{o.item_name}</b> ({o.sessions_total - o.sessions_used} left)</span>
            </label>
          ))}
        </div>
      )}
      <input className="field mt-4" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {t?.recall_weeks ? <p className="mt-3 text-[13px] text-sub">They&apos;ll show as due again in {t.recall_weeks} weeks.</p> : null}
      <button type="button" className="btn-ink mt-5" disabled={!t} onClick={() => t && onSave(t, providers.find((p) => p.id === pid) ?? null, notes, pkg)}>Log treatment</button>
    </Modal>
  );
}

function RemoveModal({ balance, onClose, onSave }: { balance: number; onClose: () => void; onSave: (n: number, note: string) => void }) {
  const [v, setV] = useState("");
  const [note, setNote] = useState("");
  const n = Math.min(parseInt(v || "0", 10) || 0, balance);
  return (
    <Modal title="Remove points" onClose={onClose}>
      <input autoFocus inputMode="numeric" className="field" placeholder={`Points (they have ${balance.toLocaleString("en-US")})`} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ""))} />
      <input className="field mt-3" placeholder="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="mt-3 text-[13px] text-sub">For mistakes only. Use Redeem to give a reward.</p>
      <button type="button" className="btn-ink mt-5" disabled={n <= 0 || note.trim().length < 3} onClick={() => onSave(n, note.trim())}>Remove {n > 0 ? `${n.toLocaleString("en-US")} pts` : "points"}</button>
    </Modal>
  );
}

/* ───────────────────────── Due · Orders · Activity ───────────────────────── */

function Due({ api, clinic, onOpen }: { api: DeskApi; clinic: DeskClinic; onOpen: (m: DeskMember) => void }) {
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.due().then(setRows).catch((e) => setErr((e as Error).message)); }, [api]);
  if (err) return <p className="rounded-[18px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  if (!rows) return <div className="h-48 animate-pulse rounded-[24px] bg-white/70" />;
  const sorted = [...rows].sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  if (!sorted.length) return <Empty text="Nobody is due right now. Patients show up here when a treatment's recall window comes around." />;
  return (
    <ul className="overflow-hidden rounded-[24px] bg-white shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]">
      {sorted.map((r, i) => {
        const overdue = new Date(r.due_at).getTime() < Date.now();
        const sms = r.phone ? `sms:${r.phone}?body=${encodeURIComponent(`Hi ${(r.full_name ?? "").split(" ")[0] || "there"}! It's about time for your next ${r.treatment_name} at ${clinic.name}. Want us to find you a time?`)}` : null;
        return (
          <li key={`${r.membership_id}-${i}`} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-page text-[14px] font-semibold">{initials(r.full_name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15.5px] font-semibold">{r.full_name ?? "No name"}</span>
              <span className="block text-[13.5px] text-sub">{r.treatment_name} · last {day(r.performed_at)}</span>
            </span>
            {r.has_upcoming_booking
              ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-[12.5px] font-semibold text-emerald-700">Booked</span>
              : <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{overdue ? `Due since ${day(r.due_at)}` : `Due ${day(r.due_at)}`}</span>}
            <span className="flex gap-2">
              {sms && !r.has_upcoming_booking && <a href={sms} className="h-9 rounded-full bg-tint px-4 text-[13.5px] font-semibold leading-9 text-brand">Text</a>}
              <button type="button" onClick={() => onOpen({ membership_id: r.membership_id, user_id: r.user_id, full_name: r.full_name, email: r.email, phone: r.phone, points_balance: r.points_balance, tier: r.tier, joined_at: r.joined_at, visit_count: r.visit_count })}
                className="h-9 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-white">Open</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  reserved: { label: "Reserved · pay at desk", tone: "bg-amber-50 text-amber-800" },
  paid: { label: "Paid · to hand over", tone: "bg-emerald-50 text-emerald-700" },
  fulfilled: { label: "Done", tone: "bg-page text-sub" },
  cancelled: { label: "Cancelled", tone: "bg-page text-faint" },
  refunded: { label: "Refunded", tone: "bg-page text-faint" },
};

function Orders({ api, say, onChanged }: { api: DeskApi; say: (t: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"open" | "done">("open");
  const load = useCallback(() => { api.orders().then(setRows).catch(() => setRows([])); }, [api]);
  useEffect(() => { load(); }, [load]);
  const set = async (o: OrderRow, status: "paid" | "fulfilled" | "cancelled", msg: string) => {
    setBusy(o.id); try { await api.updateOrder(o.id, status); say(msg); load(); onChanged(); } catch (e) { say((e as Error).message); } setBusy(null);
  };
  if (!rows) return <div className="h-48 animate-pulse rounded-[24px] bg-white/70" />;
  const open = rows.filter((o) => o.status === "reserved" || (o.status === "paid" && o.kind !== "package"));
  const list = tab === "open" ? open : rows.filter((o) => !open.includes(o));
  return (
    <div>
      <div className="mb-4 inline-flex rounded-full bg-white p-1 shadow-card">
        {(["open", "done"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`h-9 rounded-full px-5 text-[14px] font-semibold ${tab === t ? "bg-ink text-white" : "text-sub"}`}>{t === "open" ? `To do · ${open.length}` : "All other"}</button>
        ))}
      </div>
      {list.length === 0 ? <Empty text={tab === "open" ? "Nothing to do. New Shop orders show up here." : "No other orders yet."} /> : (
        <ul className="overflow-hidden rounded-[24px] bg-white shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]">
          {list.map((o) => {
            const s = ORDER_STATUS[o.status] ?? { label: o.status, tone: "bg-page text-sub" };
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-page">{o.kind === "gift_card" ? <IcGift className="h-5 w-5" /> : o.kind === "package" ? <IcSpark className="h-5 w-5" /> : <IcBag className="h-5 w-5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-semibold">{o.item_name}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</span>
                  <span className="block text-[13.5px] text-sub">{o.full_name ?? "Patient"} · {money(o.amount_cents)} · {rel(o.created_at)}{o.gift_code ? ` · code ${o.gift_code}` : ""}{o.recipient_name ? ` for ${o.recipient_name}` : ""}{o.sessions_total ? ` · ${o.sessions_total - o.sessions_used} of ${o.sessions_total} sessions left` : ""}</span>
                </span>
                <span className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${s.tone}`}>{s.label}</span>
                <span className="flex gap-2">
                  {o.status === "reserved" && <button type="button" disabled={busy === o.id} onClick={() => set(o, "paid", `Payment taken · ${o.item_name}`)} className="h-9 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-white">Mark paid</button>}
                  {o.status === "paid" && o.kind !== "package" && <button type="button" disabled={busy === o.id} onClick={() => set(o, "fulfilled", `Handed over · ${o.item_name}`)} className="h-9 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-white">Handed over</button>}
                  {o.status === "reserved" && <button type="button" disabled={busy === o.id} onClick={() => set(o, "cancelled", "Order cancelled")} className="h-9 rounded-full bg-page px-4 text-[13.5px] font-semibold">Cancel</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Activity({ api }: { api: DeskApi }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  useEffect(() => { api.activity().then(setRows).catch(() => setRows([])); }, [api]);
  if (!rows) return <div className="h-48 animate-pulse rounded-[24px] bg-white/70" />;
  if (!rows.length) return <Empty text="No activity yet today." />;
  return (
    <ul className="overflow-hidden rounded-[24px] bg-white shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${a.delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{a.delta >= 0 ? <IcSpark className="h-[18px] w-[18px]" /> : <IcGift className="h-[18px] w-[18px]" />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{a.customer_name ?? "Guest"}</span><span className="block text-[13px] text-sub">{RULE[a.rule_type] ?? a.rule_type.replace(/_/g, " ")}{a.notes ? ` · ${a.notes}` : ""}</span></span>
          <span className="text-[13px] text-faint">{rel(a.created_at)}</span>
          <b className={`w-14 text-right tabular-nums ${a.delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>{a.delta >= 0 ? "+" : ""}{a.delta}</b>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[24px] bg-white px-6 py-10 text-center text-[15px] text-sub shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]"><IcCalendar className="mx-auto mb-3 h-7 w-7 text-faint" />{text}</div>;
}
