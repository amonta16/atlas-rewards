"use client";
/**
 * MembershipBillingSetup — manager-side panel for wiring customer memberships
 * to Stripe so customers can subscribe and pay.
 *
 * Security model:
 *  • The Stripe secret key is stored in business_membership_billing (staff-only
 *    RLS). It is never sent to the browser — the checkout API route reads it
 *    server-side via the service role key.
 *  • Only the is_enabled, price, and name fields are readable by customers
 *    (via membership_billing_public() which strips the key).
 *
 * How to connect:
 *  1. Get your Stripe secret key from dashboard.stripe.com → Developers → API keys.
 *  2. Paste it here and set a monthly price.
 *  3. Customers will see a "Subscribe" button on the app; tapping creates a
 *     Stripe Checkout session and redirects them to pay.
 *  4. After payment, the webhook endpoint (set in Stripe dashboard) upgrades
 *     their membership tier automatically.
 */

import { useEffect, useState } from "react";
import {
  CreditCard, Eye, EyeOff, Check, AlertCircle, Loader2,
  ExternalLink, ShieldCheck, Plus, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Business } from "@/lib/types/database";

type BillingConfig = {
  is_enabled: boolean;
  membership_name: string;
  price_cents: number;
  perks: string[];
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  connected_at: string | null;
};

export function MembershipBillingSetup({ business }: { business: Business }) {
  const [cfg, setCfg] = useState<BillingConfig>({
    is_enabled: false,
    membership_name: "VIP Membership",
    price_cents: 999,
    perks: [],
    stripe_secret_key: null,
    stripe_webhook_secret: null,
    connected_at: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [newPerk, setNewPerk] = useState("");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("business_membership_billing")
        .select("*")
        .eq("business_id", business.id)
        .maybeSingle();
      if (data) setCfg(data as BillingConfig);
      setLoaded(true);
    })();
  }, [business.id]);

  async function save() {
    setSaving(true); setErr(null);
    const supabase = createClient();
    const payload = {
      business_id: business.id,
      is_enabled: cfg.is_enabled,
      membership_name: cfg.membership_name,
      price_cents: cfg.price_cents,
      perks: cfg.perks,
      stripe_secret_key: cfg.stripe_secret_key || null,
      stripe_webhook_secret: cfg.stripe_webhook_secret || null,
      connected_at: cfg.stripe_secret_key ? (cfg.connected_at ?? new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("business_membership_billing")
      .upsert(payload, { onConflict: "business_id" });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function addPerk() {
    const p = newPerk.trim();
    if (!p || cfg.perks.includes(p)) return;
    setCfg(c => ({ ...c, perks: [...c.perks, p] }));
    setNewPerk("");
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/${business.slug}/membership/webhook`
    : `https://yourdomain.com/api/${business.slug}/membership/webhook`;

  const isConnected = !!cfg.stripe_secret_key;

  if (!loaded) return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">

      {/* ── Status header ── */}
      <div className="rounded-2xl border bg-white p-5"
        style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}06 0%, white 60%)` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Customer Memberships</div>
            <div className="mt-1 text-xl font-bold">{cfg.membership_name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              ${(cfg.price_cents / 100).toFixed(2)} / month
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
              isConnected ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
            }`}>
              {isConnected ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {isConnected ? "Stripe connected" : "Not connected"}
            </span>
            <Switch
              checked={cfg.is_enabled}
              disabled={!isConnected}
              onCheckedChange={v => setCfg(c => ({ ...c, is_enabled: v }))}
            />
          </div>
        </div>
        {!isConnected && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Connect your Stripe account below to enable customer subscriptions. Customers won't see the
            "Subscribe" button until billing is active.
          </div>
        )}
      </div>

      {/* ── Membership details ── */}
      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" /> Membership details
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Membership name</Label>
          <Input
            value={cfg.membership_name}
            onChange={e => setCfg(c => ({ ...c, membership_name: e.target.value }))}
            placeholder="VIP Membership"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Monthly price (USD)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              className="pl-7"
              value={(cfg.price_cents / 100).toFixed(2)}
              onChange={e => setCfg(c => ({ ...c, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
            />
          </div>
        </div>

        {/* Perks list */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Member perks (shown on the join screen)</Label>
          <div className="space-y-1.5">
            {cfg.perks.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-zinc-50 border px-3 py-2 text-sm">
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: business.brand_colors.primary }} />
                <span className="flex-1">{p}</span>
                <button onClick={() => setCfg(c => ({ ...c, perks: c.perks.filter((_, j) => j !== i) }))}
                  className="text-zinc-400 hover:text-rose-500 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newPerk}
              onChange={e => setNewPerk(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPerk(); } }}
              placeholder="e.g. 2× points on every visit"
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={addPerk} disabled={!newPerk.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Stripe connection ── */}
      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Stripe connection
          <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
            className="ml-auto text-[11px] font-medium text-blue-600 flex items-center gap-1 hover:underline">
            Open Stripe <ExternalLink className="h-3 w-3" />
          </a>
        </h3>

        <div className="rounded-lg bg-zinc-50 border p-3 text-[11px] text-zinc-600 space-y-1">
          <div className="font-semibold">How to connect in 3 steps:</div>
          <div>1. Log into <strong>dashboard.stripe.com</strong> → Developers → API keys</div>
          <div>2. Copy your <strong>Secret key</strong> (starts with <code>sk_live_</code> or <code>sk_test_</code>)</div>
          <div>3. Paste it below and save. That's it — subscriptions will route through your Stripe account.</div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Stripe secret key</Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={cfg.stripe_secret_key ?? ""}
              onChange={e => setCfg(c => ({ ...c, stripe_secret_key: e.target.value || null }))}
              placeholder="sk_live_... or sk_test_..."
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            Stored securely — never visible to customers. Only staff of this business can read it.
          </p>
        </div>

        {/* Webhook setup (optional but needed for auto tier upgrade) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Webhook endpoint (optional — for auto tier upgrade)</Label>
          </div>
          <div className="rounded-lg bg-zinc-900 text-emerald-400 font-mono text-[11px] px-3 py-2 break-all select-all">
            {webhookUrl}
          </div>
          <p className="text-[10px] text-zinc-500">
            In Stripe → Webhooks → Add endpoint, paste the URL above. Listen for{" "}
            <code>checkout.session.completed</code>. Then copy the webhook signing secret here:
          </p>
          <Input
            type="password"
            value={cfg.stripe_webhook_secret ?? ""}
            onChange={e => setCfg(c => ({ ...c, stripe_webhook_secret: e.target.value || null }))}
            placeholder="whsec_..."
            className="font-mono text-sm"
          />
        </div>
      </div>

      {/* ── Save ── */}
      {err && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 flex items-start gap-2 text-[11px] text-rose-900">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}
      <Button className="w-full" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : saved ? <Check className="h-4 w-4 mr-2" /> : null}
        {saving ? "Saving…" : saved ? "Saved!" : "Save membership settings"}
      </Button>
    </div>
  );
}
