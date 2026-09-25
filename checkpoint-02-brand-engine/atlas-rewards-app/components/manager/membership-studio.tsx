"use client";
/**
 * MembershipStudio — CP-151 · the ONE place a membership is set up
 *
 * Used by the manager portal's Membership tab AND the app builder's
 * Membership/Passes tab (the builder used to stack two different editors on
 * the same row — MembershipEditor (CP-22, v1 RPC, knows nothing about
 * passes) above MembershipBillingSetup — so saving one silently wiped what
 * the other saved. That was the "can't update anything on the passes" bug.)
 *
 * Left: the editor, in the order an owner thinks —
 *   1 What it's called (name, photo)
 *   2 What members get (perks, points multiplier, priority booking)
 *   3 What they can buy (monthly + passes)
 *   4 How they pay (front desk / your link / Stripe Connect)
 *   5 Go live
 * Right (lg+): a LIVE preview rendered by the very same MembershipOfferCard
 * the customer sees, fed from the unsaved draft — WYSIWYG.
 *
 * Reads/writes business_membership_billing through membership_billing_public
 * (read, same as the customer) and upsert_membership_billing_v3 (write).
 * Stripe secrets are never touched here: card checkout is a Connect account
 * (StripeConnectCard).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Check, AlertCircle, Loader2, Store, Link2, Zap, Eye, Crown, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ImageUploader } from "@/components/agency/image-uploader";
import { StripeConnectCard } from "@/components/manager/stripe-connect-card";
import { MembershipOfferCard } from "@/components/customer/membership-hub";
import { readMembership, membershipBlockers, money, defaultPassLabel, type MembershipPass, type PaymentMode } from "@/lib/membership";
import type { Business } from "@/lib/types/database";

type Draft = {
  is_enabled: boolean;
  membership_name: string;
  image_url: string | null;
  perks: string[];
  points_multiplier: number;
  has_priority_booking: boolean;
  monthly_cash_balance_cents: number;
  offer_monthly: boolean;
  price_cents: number;
  pass_options: MembershipPass[];
  payment_mode: PaymentMode;
  external_payment_url: string | null;
  payment_instructions: string | null;
};

const BLANK: Draft = {
  is_enabled: false, membership_name: "", image_url: null, perks: [], points_multiplier: 1, has_priority_booking: false,
  monthly_cash_balance_cents: 0, offer_monthly: true, price_cents: 0, pass_options: [],
  payment_mode: "in_person", external_payment_url: null, payment_instructions: null,
};

const PASS_LENGTHS = [1, 3, 6, 12];
const uid = () => Math.random().toString(36).slice(2, 10);

export function MembershipStudio({ business, onSaved }: { business: Business; onSaved?: () => void }) {
  const primary = business.brand_colors.primary;
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [saved, setSaved] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connectLive, setConnectLive] = useState(false);
  const [newPerk, setNewPerk] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("membership_billing_public", { p_business_id: business.id });
    const r = (Array.isArray(data) ? data[0] : data) as any;
    if (!error && r) {
      const d: Draft = {
        is_enabled: !!r.is_enabled,
        membership_name: r.membership_name ?? "",
        image_url: r.image_url ?? null,
        perks: (r.perks ?? []).filter(Boolean),
        points_multiplier: Number(r.points_multiplier ?? 1) || 1,
        has_priority_booking: !!r.has_priority_booking,
        monthly_cash_balance_cents: r.monthly_cash_balance_cents ?? 0,
        offer_monthly: r.offer_monthly ?? true,
        price_cents: r.price_cents ?? 0,
        pass_options: (r.pass_options ?? []).map((p: any) => ({ id: p.id ?? uid(), label: p.label ?? "", months: Number(p.months) || 1, price_cents: Number(p.price_cents) || 0 })),
        payment_mode: (r.payment_mode ?? "in_person") as PaymentMode,
        external_payment_url: r.external_payment_url ?? null,
        payment_instructions: r.payment_instructions ?? null,
      };
      setDraft(d); setSaved(JSON.stringify(d));
    } else {
      setSaved(JSON.stringify(BLANK));
    }
    setLoaded(true);
  }, [business.id]);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => readMembership({
    is_enabled: draft.is_enabled, membership_name: draft.membership_name, price_cents: draft.price_cents, perks: draft.perks,
    points_multiplier: draft.points_multiplier, has_priority_booking: draft.has_priority_booking, image_url: draft.image_url,
    payment_mode: draft.payment_mode, external_payment_url: draft.external_payment_url, payment_instructions: draft.payment_instructions,
    pass_options: draft.pass_options, offer_monthly: draft.offer_monthly,
  }), [draft]);
  const blockers = membershipBlockers(view, connectLive);
  const canGoLive = blockers.length === 0;
  const dirty = loaded && JSON.stringify(draft) !== saved;
  const [previewSel, setPreviewSel] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) { setDraft(d => ({ ...d, [k]: v })); }

  async function save() {
    setSaving(true); setErr(null); setFlash(null);
    const live = draft.is_enabled && canGoLive;   // never persist "on but unsellable"
    const passes = draft.pass_options
      .filter(p => p.price_cents > 0 && p.months > 0)
      .map(p => ({ id: p.id, label: p.label.trim() || defaultPassLabel(p.months), months: p.months, price_cents: p.price_cents }));
    const { error } = await createClient().rpc("upsert_membership_billing_v3", {
      p_business_id: business.id,
      p_is_enabled: live,
      p_membership_name: draft.membership_name.trim() || "Membership",
      p_price_cents: draft.price_cents,
      p_perks: draft.perks.map(p => p.trim()).filter(Boolean),
      p_monthly_cash_balance_cents: draft.monthly_cash_balance_cents,
      p_points_multiplier: draft.points_multiplier,
      p_has_priority_booking: draft.has_priority_booking,
      p_image_url: draft.image_url,
      p_payment_mode: draft.payment_mode,
      p_external_payment_url: draft.payment_mode === "external_link" ? (draft.external_payment_url?.trim() || null) : null,
      p_payment_instructions: draft.payment_instructions?.trim() || null,
      p_pass_options: passes,
      p_offer_monthly: draft.offer_monthly,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    const next = { ...draft, is_enabled: live, pass_options: passes };
    setDraft(next); setSaved(JSON.stringify(next));
    setFlash(live ? "Saved — members can see it in the app." : "Saved (not live yet).");
    onSaved?.();
  }

  if (!loaded) return <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> Loading…</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
      {/* ═════════════ EDITOR ═════════════ */}
      <div className="space-y-5 min-w-0">
        {/* Status */}
        <div className={cn("rounded-2xl border p-4 flex items-start gap-3", view.enabled && canGoLive ? "bg-emerald-50 border-emerald-200" : "bg-white")}>
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0", view.enabled && canGoLive ? "bg-emerald-600" : "bg-zinc-400")}>
            <Crown className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold">{view.enabled && canGoLive ? "Live in the app" : draft.is_enabled ? "Switched on, but not sellable yet" : "Not live"}</div>
            {blockers.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[12px] text-zinc-700">
                {blockers.map((b, i) => <li key={i} className="flex items-start gap-1.5"><AlertCircle className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />{b}</li>)}
              </ul>
            ) : (
              <p className="text-[12px] text-zinc-600 mt-0.5">
                {view.offers.map(o => `${o.label} ${money(o.priceCents)}${o.kind === "monthly" ? "/mo" : ""}`).join(" · ")} · paid {view.paymentMode === "stripe" ? "by card in the app" : view.paymentMode === "external_link" ? "on your link" : "at the front desk"}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
            <span className="text-[11px] font-bold text-zinc-600">Live</span>
            <button type="button" role="switch" aria-checked={draft.is_enabled}
              onClick={() => { if (draft.is_enabled || canGoLive) set("is_enabled", !draft.is_enabled); }}
              className={cn("h-7 w-12 rounded-full transition relative", draft.is_enabled ? "" : "bg-zinc-300", !draft.is_enabled && !canGoLive && "opacity-50 cursor-not-allowed")}
              style={draft.is_enabled ? { background: primary } : undefined}>
              <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition", draft.is_enabled ? "left-[22px]" : "left-0.5")} />
            </button>
          </label>
        </div>

        {/* 1 · Name & photo */}
        <Section n={1} title="What it's called" sub="The name members see on their card and at the desk.">
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Name</Label>
                <Input value={draft.membership_name} onChange={e => set("membership_name", e.target.value)} placeholder="Flippo's VIP" className="mt-1 text-base font-semibold" maxLength={40} />
              </div>
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Photo (optional)</Label>
              <div className="mt-1">
                <ImageUploader bucket="membership-images" pathPrefix={business.id} value={draft.image_url} onChange={url => set("image_url", url)} aspectClass="aspect-video" label="Photo" />
              </div>
            </div>
          </div>
        </Section>

        {/* 2 · Perks */}
        <Section n={2} title="What members get" sub="Short, concrete lines. These are the reason to buy.">
          <ul className="space-y-1.5">
            {draft.perks.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-zinc-300 shrink-0" />
                <Input value={p} onChange={e => set("perks", draft.perks.map((x, j) => j === i ? e.target.value : x))} maxLength={80} className="h-9" />
                <button type="button" onClick={() => set("perks", draft.perks.filter((_, j) => j !== i))} className="h-9 w-9 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center shrink-0" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 mt-2" onSubmit={e => { e.preventDefault(); if (newPerk.trim()) { set("perks", [...draft.perks, newPerk.trim()]); setNewPerk(""); } }}>
            <Input value={newPerk} onChange={e => setNewPerk(e.target.value)} placeholder="e.g. 1 free hour of cage time every month" maxLength={80} className="h-9" />
            <Button type="submit" variant="outline" className="h-9 shrink-0"><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </form>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl border p-3">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Points multiplier</Label>
              <div className="flex items-center gap-2 mt-1.5">
                {[1, 1.5, 2, 3].map(m => (
                  <button key={m} type="button" onClick={() => set("points_multiplier", m)}
                    className={cn("h-9 px-3 rounded-full text-sm font-bold border", draft.points_multiplier === m ? "text-white" : "bg-white")}
                    style={draft.points_multiplier === m ? { background: primary, borderColor: primary } : undefined}>
                    {m}×
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">Members earn this much on every visit / purchase.</p>
            </div>
            <label className="rounded-xl border p-3 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={draft.has_priority_booking} onChange={e => set("has_priority_booking", e.target.checked)} />
              <div>
                <div className="text-sm font-bold">Priority booking</div>
                <p className="text-[11px] text-zinc-500">Shows as a perk. (Booking rules come later.)</p>
              </div>
            </label>
          </div>
        </Section>

        {/* 3 · Plans */}
        <Section n={3} title="What they can buy" sub="A monthly plan, one or more passes, or both.">
          <div className={cn("rounded-xl border p-3 transition", draft.offer_monthly ? "bg-white" : "bg-zinc-50")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold">Monthly membership</div>
                <p className="text-[11px] text-zinc-500">Renews every month{draft.payment_mode === "stripe" ? " — Stripe bills it automatically" : " — you collect it"}.</p>
              </div>
              <input type="checkbox" checked={draft.offer_monthly} onChange={e => set("offer_monthly", e.target.checked)} />
            </div>
            {draft.offer_monthly && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-zinc-400 font-bold">$</span>
                <Input type="number" min={0} step="0.01" value={draft.price_cents ? (draft.price_cents / 100).toString() : ""} onChange={e => set("price_cents", Math.round((parseFloat(e.target.value) || 0) * 100))} placeholder="29.99" className="w-32 h-10 text-base font-semibold" />
                <span className="text-sm text-zinc-500">/ month</span>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {draft.pass_options.map((p, i) => (
              <div key={p.id} className="rounded-xl border p-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] items-end">
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Pass name</Label>
                  <Input value={p.label} onChange={e => set("pass_options", draft.pass_options.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder={defaultPassLabel(p.months)} className="mt-1 h-9" maxLength={40} />
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Length</Label>
                  <select value={p.months} onChange={e => set("pass_options", draft.pass_options.map((x, j) => j === i ? { ...x, months: parseInt(e.target.value) } : x))} className="mt-1 h-9 rounded-md border bg-white px-2 text-sm">
                    {PASS_LENGTHS.map(m => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Price</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-zinc-400 font-bold">$</span>
                    <Input type="number" min={0} step="0.01" value={p.price_cents ? (p.price_cents / 100).toString() : ""} onChange={e => set("pass_options", draft.pass_options.map((x, j) => j === i ? { ...x, price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) } : x))} className="w-24 h-9" placeholder="99" />
                  </div>
                </div>
                <button type="button" onClick={() => set("pass_options", draft.pass_options.filter((_, j) => j !== i))} className="h-9 w-9 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center" aria-label="Remove pass"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {draft.pass_options.length < 6 && (
              <Button type="button" variant="outline" className="h-9" onClick={() => set("pass_options", [...draft.pass_options, { id: uid(), label: "", months: 12, price_cents: 0 }])}>
                <Plus className="h-4 w-4 mr-1" /> Add a pass
              </Button>
            )}
            <p className="text-[11px] text-zinc-500">A pass is a one-time purchase that expires after its length. Great for season passes and gift-able bundles.</p>
          </div>
        </Section>

        {/* 4 · Payment */}
        <Section n={4} title="How they pay you" sub="Pick one. You can change it later without losing members.">
          <div className="grid sm:grid-cols-3 gap-2">
            <ModeTile active={draft.payment_mode === "in_person"} onClick={() => set("payment_mode", "in_person")} primary={primary} icon={<Store className="h-4 w-4" />} title="Front desk" blurb="They tap Join, pay at the counter, staff activates. Works with any register." />
            <ModeTile active={draft.payment_mode === "external_link"} onClick={() => set("payment_mode", "external_link")} primary={primary} icon={<Link2 className="h-4 w-4" />} title="Your payment link" blurb="Square, PayPal, Venmo… they pay there, staff confirms here." />
            <ModeTile active={draft.payment_mode === "stripe"} onClick={() => set("payment_mode", "stripe")} primary={primary} icon={<Zap className="h-4 w-4" />} title="Card in the app" blurb="Stripe Connect. Apple/Google Pay, auto-renewals, no staff step." />
          </div>
          {draft.payment_mode === "external_link" && (
            <div className="mt-3">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Payment link</Label>
              <Input value={draft.external_payment_url ?? ""} onChange={e => set("external_payment_url", e.target.value || null)} placeholder="https://square.link/u/…" className="mt-1" />
            </div>
          )}
          {draft.payment_mode !== "stripe" && (
            <div className="mt-3">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Note shown to the customer (optional)</Label>
              <Input value={draft.payment_instructions ?? ""} onChange={e => set("payment_instructions", e.target.value || null)} placeholder="Ask for Mary at the desk · cash or card" className="mt-1" maxLength={140} />
            </div>
          )}
          {draft.payment_mode === "stripe" && (
            <div className="mt-3">
              <StripeConnectCard businessId={business.id} primary={primary} onStatus={setConnectLive} />
            </div>
          )}
        </Section>

        {err && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-900 flex items-start gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {err}</div>}

        {/* Save bar */}
        <div className={cn("sticky bottom-3 z-20 rounded-2xl border p-2.5 flex items-center gap-3 shadow-lg backdrop-blur transition", dirty ? "bg-amber-50/95 border-amber-300" : "bg-white/95")}>
          <div className="flex-1 min-w-0 pl-1.5 text-[12px]">
            {dirty ? <span className="font-bold text-amber-900 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Unsaved changes</span>
              : <span className="font-semibold text-zinc-500 flex items-center gap-1.5">{flash ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> {flash}</> : "All changes saved."}</span>}
          </div>
          <Button onClick={save} disabled={saving || !dirty} className="text-white font-bold h-10 px-5" style={{ background: primary }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      {/* ═════════════ LIVE PREVIEW ═════════════ */}
      <div className="hidden lg:block sticky top-20">
        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> What customers see</div>
        <div className="rounded-[2rem] border-[6px] border-zinc-900 bg-zinc-100 p-3 shadow-2xl">
          {view.purchasable ? (
            <MembershipOfferCard business={business} view={{ ...view, imageUrl: draft.image_url }} selectedId={previewSel} onSelect={setPreviewSel} compact />
          ) : (
            <div className="rounded-3xl bg-white p-6 text-center text-sm text-zinc-500">
              <Sparkles className="h-6 w-6 mx-auto mb-2 text-zinc-300" />
              Add a monthly price or a pass and the card appears here.
            </div>
          )}
        </div>
        {!view.enabled && view.purchasable && <p className="text-[11px] text-zinc-500 mt-2 text-center">Preview only — flip <b>Live</b> and Save to publish.</p>}
      </div>
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="h-6 w-6 rounded-full bg-zinc-900 text-white text-[11px] font-black flex items-center justify-center">{n}</span>
        <div>
          <h3 className="text-sm font-extrabold leading-tight">{title}</h3>
          <p className="text-[11px] text-zinc-500">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ModeTile({ active, onClick, primary, icon, title, blurb }: { active: boolean; onClick: () => void; primary: string; icon: React.ReactNode; title: string; blurb: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-xl border p-3 text-left transition", active ? "text-white shadow-md" : "bg-white hover:bg-zinc-50")}
      style={active ? { background: primary, borderColor: primary } : undefined}>
      <div className="flex items-center gap-1.5 text-sm font-bold">{icon}{title}</div>
      <p className={cn("text-[11px] mt-1 leading-snug", active ? "opacity-90" : "text-zinc-500")}>{blurb}</p>
    </button>
  );
}
