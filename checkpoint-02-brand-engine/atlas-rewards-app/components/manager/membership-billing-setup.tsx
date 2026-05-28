"use client";
/**
 * MembershipBillingSetup — manager-side panel for wiring customer memberships.
 *
 * CP-34: now supports THREE payment modes so local business owners aren't
 * forced into Stripe.
 *
 *   1. stripe         — built-in Stripe Checkout (the existing CP-23 flow)
 *   2. external_link  — paste any payment URL (Square invoice, PayPal
 *                       subscribe button, Shopify checkout, anything).
 *                       Customer pays there. Front desk activates manually.
 *   3. in_person      — no online payment. Customer joins → front desk
 *                       collects cash/card on POS → staff taps Activate.
 *
 * Security model (unchanged for stripe mode):
 *  • Stripe secret key stored in business_membership_billing (staff-only RLS).
 *    Never sent to the browser — checkout API reads server-side.
 *  • membership_billing_public() strips secrets but exposes payment_mode +
 *    external_payment_url so the customer app knows which flow to run.
 */

import { useEffect, useState } from "react";
import {
  CreditCard, Eye, EyeOff, Check, AlertCircle, Loader2,
  ExternalLink, ShieldCheck, Plus, Trash2, Link2, Store, Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Business } from "@/lib/types/database";

type PaymentMode = "stripe" | "external_link" | "in_person";

type BillingConfig = {
  is_enabled: boolean;
  membership_name: string;
  price_cents: number;
  perks: string[];
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  connected_at: string | null;
  // CP-34
  payment_mode: PaymentMode;
  external_payment_url: string | null;
  payment_instructions: string | null;
  // CP-22 carry-overs needed by the v2 RPC
  monthly_cash_balance_cents?: number;
  points_multiplier?: number | null;
  has_priority_booking?: boolean | null;
  image_url?: string | null;
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
    // CP-34: default to in-person (lowest-friction for local businesses)
    payment_mode: "in_person",
    external_payment_url: null,
    payment_instructions: null,
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

    // CP-34: write Stripe key + webhook directly (those fields aren't on the
    // v2 RPC since they're secrets), then call upsert_membership_billing_v2
    // for everything else including the new payment_mode fields.
    if (cfg.payment_mode === "stripe") {
      const { error: stripeErr } = await supabase
        .from("business_membership_billing")
        .upsert({
          business_id:           business.id,
          stripe_secret_key:     cfg.stripe_secret_key || null,
          stripe_webhook_secret: cfg.stripe_webhook_secret || null,
          connected_at:          cfg.stripe_secret_key ? (cfg.connected_at ?? new Date().toISOString()) : null,
        }, { onConflict: "business_id" });
      if (stripeErr) { setSaving(false); setErr(stripeErr.message); return; }
    }

    const { error } = await supabase.rpc("upsert_membership_billing_v2", {
      p_business_id:                business.id,
      p_is_enabled:                 cfg.is_enabled,
      p_membership_name:            cfg.membership_name,
      p_price_cents:                cfg.price_cents,
      p_perks:                      cfg.perks,
      p_monthly_cash_balance_cents: cfg.monthly_cash_balance_cents ?? 0,
      p_points_multiplier:          cfg.points_multiplier ?? 1.0,
      p_has_priority_booking:       cfg.has_priority_booking ?? false,
      p_image_url:                  cfg.image_url ?? null,
      p_payment_mode:               cfg.payment_mode,
      p_external_payment_url:       cfg.external_payment_url || null,
      p_payment_instructions:       cfg.payment_instructions || null,
    });
    setSaving(false);
    if (error) {
      setErr(
        error.message.includes("upsert_membership_billing_v2")
          ? "RPC not found — apply the CP-34 SQL migration in Supabase first."
          : error.message,
      );
      return;
    }
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
  // CP-34: each mode has its own "ready to enable customers" rule
  const modeReady =
    cfg.payment_mode === "stripe"        ? isConnected :
    cfg.payment_mode === "external_link" ? !!cfg.external_payment_url :
    /* in_person */                         true;

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
              modeReady ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
            }`}>
              {modeReady ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {cfg.payment_mode === "stripe"
                ? (isConnected ? "Stripe connected" : "Stripe not connected")
                : cfg.payment_mode === "external_link"
                  ? (cfg.external_payment_url ? "Payment link set" : "Payment link missing")
                  : "In-person ready"}
            </span>
            <Switch
              checked={cfg.is_enabled}
              disabled={!modeReady}
              onCheckedChange={v => setCfg(c => ({ ...c, is_enabled: v }))}
            />
          </div>
        </div>
        {!modeReady && (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {cfg.payment_mode === "stripe"
              ? "Paste your Stripe secret key below to enable subscriptions."
              : "Add your payment link below to enable subscriptions."}
          </div>
        )}
      </div>

      {/* ── CP-34: payment mode picker ── */}
      <div className="rounded-2xl border bg-white p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" /> How do members pay you?
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Pick whichever fits your existing setup. You can change this anytime.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <ModeCard
            active={cfg.payment_mode === "in_person"}
            onClick={() => setCfg(c => ({ ...c, payment_mode: "in_person" }))}
            icon={<Store className="h-4 w-4" />}
            title="At the front desk"
            blurb="Customer signs up in the app, then pays at your counter however they normally do (cash, POS card, anything). Staff taps Activate."
            primary={business.brand_colors.primary}
          />
          <ModeCard
            active={cfg.payment_mode === "external_link"}
            onClick={() => setCfg(c => ({ ...c, payment_mode: "external_link" }))}
            icon={<Link2 className="h-4 w-4" />}
            title="External payment link"
            blurb="Paste your Square invoice / PayPal subscribe / Shopify checkout / any payment URL. Customer pays there, staff activates."
            primary={business.brand_colors.primary}
          />
          <ModeCard
            active={cfg.payment_mode === "stripe"}
            onClick={() => setCfg(c => ({ ...c, payment_mode: "stripe" }))}
            icon={<Zap className="h-4 w-4" />}
            title="Stripe (auto)"
            blurb="Built-in Stripe Checkout — customer subscribes, webhook activates them automatically. Needs your Stripe secret key."
            primary={business.brand_colors.primary}
          />
        </div>

        {/* Mode-specific extra fields */}
        {cfg.payment_mode === "external_link" && (
          <div className="space-y-1.5 pt-2">
            <Label className="text-xs text-muted-foreground">Payment link (URL)</Label>
            <Input
              type="url"
              value={cfg.external_payment_url ?? ""}
              onChange={e => setCfg(c => ({ ...c, external_payment_url: e.target.value || null }))}
              placeholder="https://square.link/u/... or https://paypal.me/... or any payment URL"
            />
            <p className="text-[10px] text-zinc-500">
              When a customer taps "Join Membership", this is the URL we open. Use any payment processor you already trust.
            </p>
          </div>
        )}

        {(cfg.payment_mode === "external_link" || cfg.payment_mode === "in_person") && (
          <div className="space-y-1.5 pt-2">
            <Label className="text-xs text-muted-foreground">
              Instructions for the customer (optional)
            </Label>
            <Input
              value={cfg.payment_instructions ?? ""}
              onChange={e => setCfg(c => ({ ...c, payment_instructions: e.target.value || null }))}
              placeholder={
                cfg.payment_mode === "in_person"
                  ? "e.g. Pay $10 at the front desk on your next visit."
                  : "e.g. Use code FRIENDS at checkout for $5 off."
              }
              maxLength={140}
            />
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

      {/* ── Stripe connection (only when mode = stripe) ── */}
      {cfg.payment_mode === "stripe" && (
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
      )}

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

/* ─────────────────────────── sub-components ─────────────────────────── */

function ModeCard({
  active, onClick, icon, title, blurb, primary,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  blurb: string;
  primary: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left rounded-2xl border p-3 transition " +
        (active ? "bg-white ring-2" : "bg-zinc-50 hover:bg-white hover:shadow-sm")
      }
      style={{
        borderColor: active ? primary : undefined,
        ['--tw-ring-color' as any]: active ? primary : undefined,
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: active ? primary : `${primary}15`,
            color: active ? "white" : primary,
          }}
        >
          {icon}
        </div>
        <div className="text-sm font-bold">{title}</div>
      </div>
      <p className="text-[11px] text-zinc-600 mt-2 leading-snug">{blurb}</p>
    </button>
  );
}
