"use client";
/**
 * MembershipEditor — agency-side single-membership form.
 *
 * Atlas Rewards offers EXACTLY ONE membership per business (no points-based
 * ladder, no multi-tier plans). The previous multi-tier UI was removed in
 * CP-22; this editor now writes to public.business_membership_billing via
 * the upsert_membership_billing() RPC.
 *
 * Fields the agency can edit here:
 *   • Name (e.g. "Anaya+", "VIP Membership")
 *   • Monthly price (cents stored, dollars in UI)
 *   • Perks list (free text bullets)
 *   • Points multiplier (e.g. 1.2× points per visit)
 *   • Priority booking toggle
 *   • Loyalty-card image
 *
 * CP-28: monthly cash balance credit was removed — Atlas is points-only now.
 * The column still exists in the DB for back-compat; the editor always
 * passes 0 so any legacy values get zeroed out on the next save.
 *
 * What's NOT here (lives on the manager dashboard's MembershipBillingSetup):
 *   • Stripe secret key + webhook secret. These are owner-level credentials
 *     and we keep the surface area for them small.
 */

import { useEffect, useState } from "react";
import {
  // CP-28: Wallet removed — no more monthly cash balance perk.
  Crown, Plus, Trash2, DollarSign, Coins, Check, Loader2, AlertCircle,
  CalendarClock, Sparkles, Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "./image-uploader";
import type { Business } from "@/lib/types/database";

type MembershipForm = {
  is_enabled: boolean;
  membership_name: string;
  price_cents: number;
  perks: string[];
  // CP-28: monthly_cash_balance_cents removed from the form. The DB column
  // still exists (we pass 0 on save), but it's no longer surfaced or editable.
  points_multiplier: number;
  has_priority_booking: boolean;
  image_url: string | null;
};

const DEFAULT_FORM: MembershipForm = {
  is_enabled: false,
  membership_name: "VIP Membership",
  price_cents: 999,
  perks: [],
  points_multiplier: 1.0,
  has_priority_booking: false,
  image_url: null,
};

export function MembershipEditor({
  business,
  onUpdate,
}: {
  business: Business;
  /** Kept for parity with the previous signature; this editor no longer
   *  mutates the Business object (membership data lives in its own table now),
   *  but the prop is preserved so the brand-editor tabs don't have to change. */
  onUpdate?: (patch: Partial<Business>) => void;
}) {
  void onUpdate; // intentional — see note above
  const [cfg, setCfg] = useState<MembershipForm>(DEFAULT_FORM);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newPerk, setNewPerk] = useState("");

  // Load existing config (or stay on DEFAULT_FORM if not yet configured)
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("business_membership_billing")
        .select(
          // CP-28: monthly_cash_balance_cents no longer selected — the form
          // doesn't track it and the save call hard-codes 0.
          "is_enabled, membership_name, price_cents, perks, " +
          "points_multiplier, has_priority_booking, image_url"
        )
        .eq("business_id", business.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) setCfg({ ...DEFAULT_FORM, ...(data as Partial<MembershipForm>) });
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [business.id]);

  async function save() {
    setSaving(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_membership_billing", {
      p_business_id: business.id,
      p_is_enabled: cfg.is_enabled,
      p_membership_name: cfg.membership_name,
      p_price_cents: cfg.price_cents,
      p_perks: cfg.perks,
      // CP-28: cash credit is no longer offered. Always pass 0 so any
      // legacy values get zeroed out on the next save. The RPC arg stays
      // for back-compat with the existing DB function signature.
      p_monthly_cash_balance_cents: 0,
      p_points_multiplier: cfg.points_multiplier,
      p_has_priority_booking: cfg.has_priority_booking,
      p_image_url: cfg.image_url,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function addPerk() {
    const p = newPerk.trim();
    if (!p || cfg.perks.includes(p)) return;
    setCfg(c => ({ ...c, perks: [...c.perks, p] }));
    setNewPerk("");
  }

  if (!loaded) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  const primary = business.brand_colors.primary;

  return (
    <div className="space-y-6">
      {/* ── Status header ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-6"
        style={{ background: `linear-gradient(135deg, ${primary}08 0%, white 60%)` }}>
        <div className="flex items-start gap-4">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${primary}15`, color: primary }}
          >
            <Crown className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Your single membership
            </div>
            <div className="mt-0.5 text-lg font-bold truncate">{cfg.membership_name || "—"}</div>
            <div className="text-sm text-muted-foreground">
              {(cfg.price_cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })} / month
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Switch
              checked={cfg.is_enabled}
              onCheckedChange={v => setCfg(c => ({ ...c, is_enabled: v }))}
            />
            <span className="text-[10px] font-semibold text-muted-foreground">
              {cfg.is_enabled ? "Visible to customers" : "Hidden"}
            </span>
          </div>
        </div>
        {!cfg.is_enabled && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              Membership is currently hidden from customers. Toggle the switch above
              when you're ready to launch.
              <br />
              <span className="text-amber-700">
                Stripe credentials are set up on the Manager dashboard → Billing tab.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Card art ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">Loyalty card art</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Shows behind the membership card on the customer's Home screen. Recommended ~1200×800 jpg or png.
            </p>
          </div>
        </div>
        <ImageUploader
          bucket="membership-images"
          pathPrefix={business.id}
          value={cfg.image_url}
          onChange={(url) => setCfg(c => ({ ...c, image_url: url }))}
          aspectClass="aspect-[3/2]"
          label="Loyalty card"
        />
      </div>

      {/* ── Details ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-6 space-y-5">
        <h3 className="font-semibold">Membership details</h3>

        <Field label="Membership name">
          <Input
            value={cfg.membership_name}
            onChange={e => setCfg(c => ({ ...c, membership_name: e.target.value }))}
            placeholder="e.g. Anaya+, VIP Membership"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Monthly price (USD)" icon={<DollarSign className="h-3 w-3" />}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number" min="0" step="0.01" className="pl-7"
                value={(cfg.price_cents / 100).toFixed(2)}
                onChange={e => setCfg(c => ({
                  ...c,
                  price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                }))}
              />
            </div>
          </Field>

          {/* CP-28: "Monthly cash balance credited to member" field removed
              — Atlas is points-only. Points multiplier + priority booking
              remain the only two membership perks the agency can configure. */}

          <Field label="Points multiplier on every visit" icon={<Coins className="h-3 w-3" />}>
            <Input
              type="number" min="1" step="0.1"
              value={cfg.points_multiplier}
              onChange={e => setCfg(c => ({
                ...c,
                points_multiplier: Math.max(1, parseFloat(e.target.value || "1")),
              }))}
              placeholder="1.0 = no boost"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              1.0 means members earn the standard points; 1.2 means 20% more.
            </p>
          </Field>

          <Field label="Priority booking" icon={<CalendarClock className="h-3 w-3" />}>
            <div className="flex items-center justify-between rounded-lg border bg-zinc-50 px-3 py-2.5">
              <span className="text-sm">Members skip the queue</span>
              <Switch
                checked={cfg.has_priority_booking}
                onCheckedChange={v => setCfg(c => ({ ...c, has_priority_booking: v }))}
              />
            </div>
          </Field>
        </div>
      </div>

      {/* ── Perks list ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-6 space-y-3">
        <h3 className="font-semibold">Perks (shown as bullets on the join screen)</h3>
        <div className="space-y-1.5">
          {cfg.perks.map((p, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-50 border px-3 py-2 text-sm">
              <Check className="h-3.5 w-3.5 shrink-0" style={{ color: primary }} />
              <span className="flex-1">{p}</span>
              <button
                onClick={() => setCfg(c => ({ ...c, perks: c.perks.filter((_, j) => j !== i) }))}
                className="text-zinc-400 hover:text-rose-500 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {cfg.perks.length === 0 && (
            <div className="text-[11px] text-muted-foreground italic py-2">
              No perks added yet. Add some short, punchy bullets — e.g. “10% off all retail”, “Free dessert on visits”.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={newPerk}
            onChange={e => setNewPerk(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPerk(); } }}
            placeholder="e.g. 10% off all retail"
            className="text-sm"
          />
          <Button variant="outline" size="sm" onClick={addPerk} disabled={!newPerk.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-blue-50 border-blue-100 p-4 flex items-start gap-2 text-[11px] text-blue-900">
        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Front-desk staff cannot see or edit this section. Stripe credentials and
          revenue numbers stay on the Manager → Billing tab, which is locked to
          managers and agency admins.
        </div>
      </div>

      {err && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2 text-[11px] text-rose-900">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : saved ? <Check className="h-4 w-4 mr-2" /> : null}
        {saving ? "Saving…" : saved ? "Saved!" : "Save membership"}
      </Button>
    </div>
  );
}

function Field({
  label, icon, children,
}: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </Label>
      {children}
    </div>
  );
}
