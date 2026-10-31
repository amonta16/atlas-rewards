"use client";
/**
 * Med spa split (Phase 5) · membership PLANS editor.
 *
 * A clinic sells several plans (Dermis style): each has a monthly price, a
 * benefits list and the treatments included every month. Stored in
 * businesses.medspa_config.memberships, exactly the shape the med spa app
 * reads (apps/medspa/lib/plans.ts → MedspaPlan). Patients pay for a plan in
 * the med spa app through the clinic's connected Stripe account (the
 * Payments section below this editor).
 *
 * With no plans, the med spa app shows the clinic's single legacy membership
 * as one plan; "Import current membership" turns that into an editable plan.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp, Crown, Download, ExternalLink, GripVertical, Plus, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/agency/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { readMembership, type MembershipRow } from "@/lib/membership";
import { cents, newId, type MedspaConfig } from "@/lib/medspa";
import type { Business } from "@/lib/types/database";

export type IncludedTreatment = { treatment_id: string | null; name: string; quantity: number; unit: string; note: string };
export type MedspaPlan = {
  id: string; name: string; tagline: string; description: string; price_cents: number; commitment_months: number;
  image_url: string | null; benefits: string[]; included: IncludedTreatment[]; join_bonus: string; featured: boolean; is_active: boolean;
};

const UNITS = ["session", "unit", "syringe", "mL", "item", "credit"];
const MEDSPA_HOST = (process.env.NEXT_PUBLIC_MEDSPA_HOST ?? "med.atlas-engine.app").replace(/^https?:\/\//, "");

export function readPlansCfg(cfg: MedspaConfig): MedspaPlan[] {
  const raw = (cfg as MedspaConfig & { memberships?: unknown }).memberships;
  return Array.isArray(raw) ? (raw as MedspaPlan[]) : [];
}

function blankPlan(): MedspaPlan {
  return { id: newId("pl"), name: "", tagline: "", description: "", price_cents: 0, commitment_months: 0, image_url: null,
    benefits: [], included: [], join_bonus: "", featured: false, is_active: true };
}

export function PlansEditor({ business, cfg, onChange }: { business: Business; cfg: MedspaConfig; onChange: (next: MedspaConfig) => void }) {
  const plans = readPlansCfg(cfg);
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = (memberships: MedspaPlan[]) => onChange({ ...cfg, memberships } as MedspaConfig);
  const upd = (id: string, p: Partial<MedspaPlan>) => set(plans.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = () => { const p = blankPlan(); set([...plans, p]); setOpenId(p.id); };
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= plans.length) return; const n = [...plans]; [n[i], n[j]] = [n[j], n[i]]; set(n); };
  const treatments = cfg.treatments.filter((t) => t.is_active);

  async function importLegacy() {
    setImporting(true); setNote(null);
    const { data } = await createClient().rpc("membership_billing_public", { p_business_id: business.id });
    const row = ((Array.isArray(data) ? data[0] : data) ?? null) as MembershipRow;
    const m = row ? readMembership(row) : null;
    setImporting(false);
    if (!m?.enabled || m.monthlyPriceCents <= 0) { setNote("There's no monthly membership to import. Add a plan instead."); return; }
    const p: MedspaPlan = { ...blankPlan(), name: m.name, tagline: "Monthly membership", price_cents: m.monthlyPriceCents, benefits: m.perks, featured: true,
      image_url: (row as { image_url?: string | null } | null)?.image_url ?? business.membership_image_url ?? null };
    set([...plans, p]); setOpenId(p.id);
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700"><Crown className="h-4 w-4" /></span>
          <div>
            <h3 className="font-semibold">Membership plans</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">The plans patients see and buy in the med spa app (Shop → Memberships). Each plan has its own monthly price, benefits and the treatments included every month.</p>
          </div>
        </div>
        <a href={`https://${MEDSPA_HOST}/${business.slug}/shop?tab=memberships`} target="_blank" rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
          View in app <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center">
          <p className="text-sm font-medium">No plans yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Until you add one, the app shows your current membership (below) as a single plan.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={add} className="bg-zinc-900 text-white hover:bg-zinc-800"><Plus className="mr-1.5 h-4 w-4" />Add a plan</Button>
            <Button variant="outline" onClick={importLegacy} disabled={importing}><Download className="mr-1.5 h-4 w-4" />{importing ? "Importing…" : "Import current membership"}</Button>
          </div>
          {note && <p className="mt-3 text-xs text-amber-700">{note}</p>}
        </div>
      ) : (
        <>
          <ul className="divide-y rounded-2xl border">
            {plans.map((p, i) => {
              const open = openId === p.id;
              return (
                <li key={p.id} className={cn(!p.is_active && "opacity-60")}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex flex-col text-zinc-300">
                      <button type="button" onClick={() => move(i, -1)} className="hover:text-zinc-600" aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => move(i, 1)} className="hover:text-zinc-600" aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></button>
                    </div>
                    {p.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={p.image_url} alt="" className="h-11 w-11 rounded-xl object-cover grayscale" />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-900 text-[11px] font-bold text-white">{(p.name || "?").slice(0, 2).toUpperCase()}</span>
                    )}
                    <button type="button" onClick={() => setOpenId(open ? null : p.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5 truncate font-semibold">
                        {p.name || <span className="text-zinc-400">Untitled plan</span>}
                        {p.featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>{p.price_cents > 0 ? `${cents(p.price_cents)}/mo` : "No price yet"}</span>
                        <span>{p.commitment_months > 0 ? `${p.commitment_months}-month minimum` : "Cancel anytime"}</span>
                        <span>{p.included.length} included · {p.benefits.length} benefits</span>
                      </div>
                    </button>
                    <Switch checked={p.is_active} onCheckedChange={(v) => upd(p.id, { is_active: v })} aria-label="Shown in app" />
                    <button type="button" onClick={() => setOpenId(open ? null : p.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label={open ? "Collapse" : "Edit"}>
                      {open ? <ChevronUp className="h-4 w-4" /> : <GripVertical className="h-4 w-4 rotate-90" />}
                    </button>
                  </div>
                  {open && <PlanForm business={business} plan={p} treatments={treatments} onChange={(patch) => upd(p.id, patch)} onRemove={() => { set(plans.filter((x) => x.id !== p.id)); setOpenId(null); }} />}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={add}><Plus className="mr-1.5 h-4 w-4" />Add a plan</Button>
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Patients pay monthly through your connected Stripe account (Payments, below). A minimum commitment is shown to patients; Stripe doesn&apos;t enforce it.</p>
    </div>
  );
}

function PlanForm({ business, plan: p, treatments, onChange, onRemove }: {
  business: Business; plan: MedspaPlan; treatments: MedspaConfig["treatments"];
  onChange: (p: Partial<MedspaPlan>) => void; onRemove: () => void;
}) {
  const setInc = (included: IncludedTreatment[]) => onChange({ included });
  const updInc = (i: number, x: Partial<IncludedTreatment>) => setInc(p.included.map((it, j) => (j === i ? { ...it, ...x } : it)));
  return (
    <div className="grid gap-4 border-t bg-zinc-50/60 px-4 py-5 sm:grid-cols-[1fr_200px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Plan name</Label><Input value={p.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Glow Club" /></div>
          <div className="space-y-1.5"><Label>One-line tagline</Label><Input value={p.tagline} onChange={(e) => onChange({ tagline: e.target.value })} placeholder="A facial every month" /></div>
          <div className="space-y-1.5">
            <Label>Monthly price ($)</Label>
            <Input inputMode="decimal" value={p.price_cents ? String(p.price_cents / 100) : ""} placeholder="99"
              onChange={(e) => { const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); onChange({ price_cents: Number.isFinite(v) ? Math.round(v * 100) : 0 }); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Minimum commitment (months)</Label>
            <Input inputMode="numeric" value={p.commitment_months ? String(p.commitment_months) : ""} placeholder="0 = cancel anytime"
              onChange={(e) => onChange({ commitment_months: Math.max(0, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)) })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <textarea className="min-h-[72px] w-full rounded-md border bg-white px-3 py-2 text-sm" value={p.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Who it's for and why it's worth it." />
        </div>
        <div className="space-y-1.5">
          <Label>Benefits <span className="font-normal text-muted-foreground">(one per line)</span></Label>
          <textarea className="min-h-[96px] w-full rounded-md border bg-white px-3 py-2 text-sm" value={p.benefits.join("\n")}
            onChange={(e) => onChange({ benefits: e.target.value.split("\n").map((s) => s.trimStart()) })}
            onBlur={() => onChange({ benefits: p.benefits.map((s) => s.trim()).filter(Boolean) })}
            placeholder={"Member pricing on every treatment\n10% off all skincare"} />
        </div>
        <div className="space-y-2">
          <Label>Included every month</Label>
          {p.included.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_110px_auto] items-center gap-2">
              <select className="h-9 rounded-md border bg-white px-2 text-sm" value={it.treatment_id ?? "__perk"}
                onChange={(e) => { const t = treatments.find((x) => x.id === e.target.value); updInc(i, t ? { treatment_id: t.id, name: t.name } : { treatment_id: null }); }}>
                {treatments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="__perk">Other perk (type a name)…</option>
              </select>
              <Input inputMode="numeric" value={String(it.quantity)} onChange={(e) => updInc(i, { quantity: Math.max(1, parseInt(e.target.value.replace(/\D/g, "") || "1", 10)) })} aria-label="Quantity" />
              <select className="h-9 rounded-md border bg-white px-2 text-sm" value={it.unit} onChange={(e) => updInc(i, { unit: e.target.value })} aria-label="Unit">
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button type="button" onClick={() => setInc(p.included.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              {!it.treatment_id && <Input className="col-span-3" value={it.name} onChange={(e) => updInc(i, { name: e.target.value })} placeholder="Perk name, e.g. Branded tote bag" />}
              <Input className="col-span-3" value={it.note} onChange={(e) => updInc(i, { note: e.target.value })} placeholder="Short note (optional), e.g. Use any time this month" />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => {
            const t = treatments[0];
            setInc([...p.included, { treatment_id: t?.id ?? null, name: t?.name ?? "", quantity: 1, unit: "session", note: "" }]);
          }}><Plus className="mr-1.5 h-4 w-4" />Add included treatment</Button>
        </div>
        <div className="space-y-1.5">
          <Label>Join bonus <span className="font-normal text-muted-foreground">(small print under Subscribe)</span></Label>
          <Input value={p.join_bonus} onChange={(e) => onChange({ join_bonus: e.target.value })} placeholder="Sign up to claim a complimentary skin consultation" />
        </div>
        <label className="flex items-center justify-between rounded-xl border bg-white p-3">
          <span><span className="block text-sm font-semibold">Featured plan</span><span className="block text-xs text-muted-foreground">Shown first and highlighted.</span></span>
          <Switch checked={p.featured} onCheckedChange={(v) => onChange({ featured: v })} />
        </label>
      </div>
      <div className="space-y-3">
        <ImageUploader bucket="business-heroes" pathPrefix={`${business.id}/medspa/plans`} value={p.image_url} onChange={(url) => onChange({ image_url: url })} label="Photo (shown black & white)" aspectClass="aspect-square" library={{ category: "offer", industry: "medspa" }} />
        <Button variant="ghost" size="sm" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onRemove}><Trash2 className="mr-1.5 h-4 w-4" />Remove plan</Button>
      </div>
    </div>
  );
}
