"use client";
/**
 * App Builder → Journey → One-time offers and → Campaigns (managers).
 * CP-238: these were the Desk → Offers and Desk → Atlas Engine tabs.
 *
 *   Offers       · one-time promos (upsert_offer, delete_offer). Patients get
 *                  the newest one as the scratch gift on Home and claim it with
 *                  save_offer, then show the code at the desk.
 *   Atlas Engine · what runs in the patient app today (recall, automated offers,
 *                  win-back) and the ad plan. Nothing here sends or tracks ads
 *                  yet, so the copy says "planning".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeskApi, DeskOffer, GiftOffer } from "@/lib/desk-api";
import { IcEngine, IcNext, IcTag } from "../icons";
import { Empty, Modal } from "./ui";
import { EngineGate } from "./engine-lock";

const card = "rounded-[16px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* ───────────── One-time offers ───────────── */

const in14Days = () => { const d = new Date(); d.setDate(d.getDate() + 14); d.setHours(23, 59, 59, 0); return d.toISOString(); };
/** The date field works in the clinic's local day, so "expires the 20th" means the end of the 20th there. */
const toLocalDay = (iso: string | null) => { if (!iso) return ""; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function OffersView({ api, say, offersOn, onOpenAutomated }: { api: DeskApi; say: (t: string) => void; offersOn: boolean; onOpenAutomated?: () => void }) {
  const [rows, setRows] = useState<DeskOffer[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<DeskOffer | null>(null);
  const load = useCallback(() => { api.offers().then(setRows).catch((e) => setErr((e as Error).message)); }, [api]);
  useEffect(() => { load(); }, [load]);

  const feature = async (o: DeskOffer) => {
    const next = { ...o, is_featured: !o.is_featured };
    try {
      const id = await api.saveOffer(next);
      if (next.is_featured && next.is_active) api.announceOffer(next, id);
      say(next.is_featured ? `${o.title} is featured` : `${o.title} is no longer featured`); load();
    } catch (e) { say((e as Error).message); }
  };
  const toggle = async (o: DeskOffer) => {
    try { await api.saveOffer({ ...o, is_active: !o.is_active }); say(o.is_active ? `${o.title} switched off` : `${o.title} is live`); load(); } catch (e) { say((e as Error).message); }
  };

  if (err) return <p className="rounded-[14px] bg-white px-5 py-4 text-[14.5px] text-red-600">{err}</p>;
  if (!rows) return <div className="h-60 animate-pulse rounded-[16px] bg-white/70" />;
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[620px] text-[13.5px] text-sub">A limited-time promo. Patients scratch it open on Home, claim it and show the code at the desk. Featuring one puts it first and tells patients about it.</p>
        <button type="button" onClick={() => setEdit({ id: null, title: "", description: "", image_url: null, expires_at: in14Days(), is_active: true, is_featured: rows.length === 0 })} className="h-9 rounded-full bg-ink px-4 text-[13px] font-semibold text-white">Add offer</button>
      </div>
      {!offersOn && <p className="rounded-[12px] bg-amber-50 px-4 py-3 text-[13px] text-amber-800">Offers are switched off for this clinic, so patients won&apos;t see these yet. Ask your Atlas contact to turn them on.</p>}
      {rows.length === 0 ? <Empty text="No offers yet. Add one and patients see it on Home." /> : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((o) => {
            const expired = !!o.expires_at && new Date(o.expires_at).getTime() < Date.now();
            return (
              <div key={o.id} className={`${card} overflow-hidden ${o.is_active && !expired ? "" : "opacity-70"}`}>
                <div className="aspect-[16/9] bg-[#F4F5F6]">
                  {o.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={o.image_url} alt="" className="h-full w-full object-cover" />
                    : <span className="grid h-full place-items-center text-faint"><IcTag className="h-7 w-7" /></span>}
                </div>
                <div className="p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {o.is_featured && <span className="rounded-full bg-brand/[.1] px-2 py-0.5 text-[11.5px] font-semibold text-brand">Featured</span>}
                    {expired && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] font-semibold text-red-700">Expired</span>}
                    {!o.is_active && <span className="rounded-full bg-[#F4F5F6] px-2 py-0.5 text-[11.5px] font-semibold text-sub">Off</span>}
                  </div>
                  <p className="mt-1 line-clamp-1 text-[14.5px] font-semibold">{o.title}</p>
                  {o.description && <p className="line-clamp-2 text-[12.5px] text-sub">{o.description}</p>}
                  <p className="mt-0.5 text-[12px] text-faint">{o.expires_at ? `${expired ? "Expired" : "Expires"} ${date(o.expires_at)}` : "No end date"}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => setEdit({ ...o })} className="h-8 flex-1 rounded-full bg-[#F4F5F6] text-[12.5px] font-semibold">Edit</button>
                    <button type="button" onClick={() => feature(o)} className="h-8 flex-1 rounded-full bg-[#F4F5F6] text-[12.5px] font-semibold">{o.is_featured ? "Unfeature" : "Feature"}</button>
                    <button type="button" role="switch" aria-checked={o.is_active} aria-label={`${o.title} live in the app`} onClick={() => toggle(o)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${o.is_active ? "bg-brand" : "bg-line"}`}>
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${o.is_active ? "left-[1.4rem]" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {onOpenAutomated && <button type="button" onClick={onOpenAutomated} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand">Birthday, holiday and win-back gifts are in Automated offers <IcNext className="h-3 w-3" strokeWidth={2.4} /></button>}
      {edit && <OfferModal api={api} init={edit} onClose={() => setEdit(null)} onSaved={(msg) => { setEdit(null); say(msg); load(); }} />}
    </div>
  );
}

function OfferModal({ api, init, onClose, onSaved }: { api: DeskApi; init: DeskOffer; onClose: () => void; onSaved: (msg: string) => void }) {
  const [o, setO] = useState(init);
  const [busy, setBusy] = useState<"save" | "photo" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<DeskOffer>) => setO((x) => ({ ...x, ...p }));
  async function save() {
    if (!o.title.trim()) { setErr("Give it a headline."); return; }
    setBusy("save"); setErr(null);
    try {
      const id = await api.saveOffer(o);
      // A brand-new featured offer is announced; edits aren't, so a typo fix doesn't buzz every phone.
      if (!init.id && o.is_featured && o.is_active) api.announceOffer(o, id);
      onSaved(init.id ? `${o.title} saved` : `${o.title} added`);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  async function photo(f: File) {
    setBusy("photo"); setErr(null);
    try { set({ image_url: await api.uploadImage(f, "offer-images") }); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  }
  async function del() {
    if (!init.id || !confirm(`Delete "${init.title}"?`)) return;
    setBusy("delete");
    try { await api.deleteOffer(init.id); onSaved(`${init.title} deleted`); } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  return (
    <Modal title={init.id ? "Edit offer" : "New offer"} onClose={onClose}>
      <button type="button" onClick={() => file.current?.click()} className="relative block aspect-[16/9] w-full overflow-hidden rounded-[18px] bg-page">
        {o.image_url
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={o.image_url} alt="" className="h-full w-full object-cover" />
          : <span className="grid h-full place-items-center text-[14px] text-sub">{busy === "photo" ? "Uploading…" : "Add a photo (optional)"}</span>}
        {o.image_url && <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-3 py-1 text-[12.5px] font-semibold">{busy === "photo" ? "Uploading…" : "Change"}</span>}
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) photo(f); e.target.value = ""; }} />
      <input className="field mt-4" aria-label="Headline" placeholder="Headline, e.g. 20% off your next facial" value={o.title} onChange={(e) => set({ title: e.target.value })} />
      <textarea className="field mt-3 h-20 resize-none py-3" aria-label="Description" placeholder="Description (optional)" value={o.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
      <label className="mt-3 flex items-center justify-between gap-3 rounded-[16px] bg-page px-4 py-3 text-[14px]">
        <span><b className="block">Expires on</b><span className="text-sub">Leave blank for no end date</span></span>
        <input type="date" value={toLocalDay(o.expires_at)} onChange={(e) => set({ expires_at: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null })} className="rounded-[10px] bg-white px-2.5 py-2 text-[13.5px] ring-1 ring-line" />
      </label>
      <label className="mt-3 flex items-center justify-between rounded-[16px] bg-page px-4 py-3 text-[14px]">
        <span><b className="block">Featured</b><span className="text-sub">Shows first. Only one offer can be featured.</span></span>
        <input type="checkbox" checked={o.is_featured} onChange={(e) => set({ is_featured: e.target.checked })} className="h-5 w-5 accent-[rgb(var(--p-rgb))]" />
      </label>
      <label className="mt-3 flex items-center justify-between rounded-[16px] bg-page px-4 py-3 text-[14px]">
        <span><b className="block">Live in the app</b><span className="text-sub">Off = patients don&apos;t see it</span></span>
        <input type="checkbox" checked={o.is_active} onChange={(e) => set({ is_active: e.target.checked })} className="h-5 w-5 accent-[rgb(var(--p-rgb))]" />
      </label>
      {err && <p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
      <button type="button" className="btn-ink mt-5" disabled={busy !== null} onClick={save}>{busy === "save" ? "Saving…" : init.id ? "Save offer" : "Add offer"}</button>
      {init.id && <button type="button" disabled={busy !== null} onClick={del} className="mt-3 w-full text-center text-[14px] font-medium text-red-600">{busy === "delete" ? "Deleting…" : "Delete offer"}</button>}
    </Modal>
  );
}

/* ───────────── Atlas Engine ───────────── */

const AD_PLAYS = [
  { id: "new-patient", name: "New-patient offer", channel: "Instagram + Facebook", hook: "A first-visit special that ends at your app's join link, so every lead becomes a patient you can reach again.", lands: "Join link + welcome gift" },
  { id: "before-after", name: "Before & after showcase", channel: "Instagram Reels", hook: "Your consented gallery, cut into reels. Proof sells the consult; the consult sells the plan.", lands: "Book a consult" },
  { id: "membership", name: "Membership launch", channel: "Meta + in-app", hook: "Sell the monthly plan to warm patients: member pricing, banked credit, and a signup bonus.", lands: "Memberships" },
  { id: "referral", name: "Review & referral engine", channel: "Organic + retargeting", hook: "Happy-patient clips with a points reason to share. Reviews rank you; referrals fill the book.", lands: "Invite a friend" },
];

export function MarketingView({ api, recall, onOpenCare, onOpenOffers, onOpenInsights }: {
  api: DeskApi; recall: { enabled: boolean; lead_days: number; followup_days: number };
  onOpenCare?: () => void; onOpenOffers?: () => void; onOpenInsights: () => void;
}) {
  const [offers, setOffers] = useState<GiftOffer[] | null>(null);
  useEffect(() => { api.giftOffers().then(setOffers).catch(() => setOffers([])); }, [api]);
  const active = (offers ?? []).filter((o) => o.is_active);
  return (
    <div className="space-y-3.5">
      <section className="relative overflow-hidden rounded-[16px] p-5 text-white" style={{ background: "radial-gradient(120% 140% at 100% 0%, #1d6fb8 0%, #0d3b74 45%, #0a1f3f 100%)" }}>
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-white/10 ring-1 ring-white/20"><IcEngine className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/60">Atlas Engine</p>
            <h2 className="text-[22px] font-bold leading-tight">Campaigns</h2>
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-white/75">Two engines fill your book: the <b className="text-white">always-on</b> one inside the patient app, and the <b className="text-white">ad engine</b> that feeds it new patients. Run the first from here today; plan the second with your Atlas partner.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[13.5px] font-semibold">Always-on · live in the patient app</h2>
        <EngineGate className="rounded-[16px]"><div className="grid gap-3.5 md:grid-cols-3">
          <EngineCard title="Recall messages" on={recall.enabled} onClick={onOpenCare} foot="Settings → Care & recall"
            body={recall.enabled ? `Every treatment has a due window; patients hear from you ${recall.lead_days} days before, again ${recall.followup_days} days after.` : "Off. Turn it on and every logged treatment chases its own rebooking."} />
          <EngineCard title="Automated offers" on={active.length > 0} onClick={onOpenOffers} foot="Journey → Automated offers"
            body={offers == null ? "…" : active.length > 0 ? `${active.length} running: ${active.slice(0, 3).map((o) => o.name).join(", ")}${active.length > 3 ? "…" : ""}.` : "None running. Birthday, holiday and win-back offers are one switch each."} />
          <EngineCard title="Win-back" on onClick={onOpenInsights} foot="Insights → Inactive patients"
            body="Patients who haven't visited in 30 to 90 days get a one-tap &quot;we miss you&quot; with bonus points or a free reward." />
        </div></EngineGate>
      </section>

      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-[13.5px] font-semibold">Ad engine</h2><p className="text-[12.5px] text-sub">Paid campaigns that land in your app. Planned here, run with your Atlas partner.</p></div>
          <span className="rounded-full bg-[#F4F5F6] px-2.5 py-1 text-[11.5px] font-semibold text-sub">Planning view</span>
        </div>
        <ol className="mt-3 flex flex-wrap items-center gap-1.5 rounded-[12px] bg-[#F7F8F8] px-3 py-2.5 text-[12.5px] font-medium" aria-label="The funnel every play feeds">
          {["Ad", "App install", "First visit", "Member"].map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              {i > 0 && <IcNext className="h-3 w-3 text-faint" strokeWidth={2.2} />}
              <span className={`rounded-full px-2.5 py-1 ${i === 3 ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
          {AD_PLAYS.map((p) => (
            <div key={p.id} className="rounded-[12px] bg-[#F7F8F8] p-3.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">{p.name}</span><span className="rounded-full bg-[#E9EBED] px-2 py-0.5 text-[11.5px] font-semibold text-sub">Draft</span></div>
              <p className="mt-1 text-[12.5px] leading-snug text-sub">{p.hook}</p>
              <p className="mt-1.5 flex justify-between gap-3 text-[12px]"><span className="text-faint">{p.channel}</span><span className="font-semibold text-brand">{p.lands}</span></p>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-[12px] border border-dashed border-line p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[13px] font-semibold">Per-campaign results you&apos;ll see here</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800">Tracking coming soon</span></div>
          <p className="mt-1 text-[12.5px] text-sub">Sent, opened, redeemed and booked for each campaign.</p>
        </div>
      </section>

      <section className={`${card} p-4`}>
        <h2 className="text-[13.5px] font-semibold">Email &amp; SMS blasts</h2>
        <p className="text-[12.5px] text-sub">One-off sends to segments (lapsed, birthdays, members). Coming soon.</p>
      </section>
    </div>
  );
}

function EngineCard({ title, on, body, foot, onClick }: { title: string; on: boolean; body: string; foot: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">{title}</span><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${on ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{on ? "On" : "Off"}</span></span>
      <span className="mt-1 block text-[12.5px] leading-snug text-sub">{body}</span>
      <span className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-brand">{foot}{onClick && <IcNext className="h-3 w-3" strokeWidth={2.4} />}</span>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`${card} block w-full p-4 text-left transition hover:shadow-card`}>{inner}</button>
    : <div className={`${card} p-4`}>{inner}</div>;
}
