"use client";
/**
 * MembershipBillingSetup — CP-108 rebuild.
 *
 * Andrew: "completely redo the membership and passes for the builder view …
 * the app builder view is messy too."
 *
 * The old panel was one long scroll of six unlabelled cards, and the same
 * facts (is it live? what can they buy? is the payment method ready?) were
 * re-derived inline in half a dozen places that could disagree. This version
 * answers a business owner's three actual questions, in order:
 *
 *   1. What do members get?      name + perks
 *   2. What can they buy?        monthly plan and/or one-time passes
 *   3. How do they pay you?      front desk / your own link / Stripe
 *
 * with a status card on top that either explains exactly what is blocking it
 * or states plainly what a customer will be able to do.
 *
 * All derivation lives in lib/membership.ts and is shared with the customer
 * app, so the panel cannot promise something the app won't render.
 *
 * Security model unchanged: the Stripe secret lives in
 * business_membership_billing (staff-only RLS), never reaches the browser on
 * the customer side, and membership_billing_public() strips it.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard, Eye, EyeOff, Check, AlertCircle, Loader2,
  Plus, Trash2, Link2, Store, Zap, Ticket, Crown, Gift,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  readMembership, membershipBlockers, money, defaultPassLabel,
  type MembershipPass, type PaymentMode,
} from "@/lib/membership";
import type { Business } from "@/lib/types/database";

const PASS_DURATIONS = [1, 3, 6, 12] as const;

type BillingConfig = {
  is_enabled: boolean;
  membership_name: string;
  price_cents: number;
  perks: string[];
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  connected_at: string | null;
  payment_mode: PaymentMode;
  external_payment_url: string | null;
  payment_instructions: string | null;
  monthly_cash_balance_cents?: number;
  points_multiplier?: number | null;
  has_priority_booking?: boolean | null;
  image_url?: string | null;
  pass_options?: MembershipPass[] | null;
  offer_monthly?: boolean | null;
};

const BLANK: BillingConfig = {
  is_enabled: false,
  membership_name: "VIP Membership",
  price_cents: 999,
  perks: [],
  stripe_secret_key: null,
  stripe_webhook_secret: null,
  connected_at: null,
  payment_mode: "in_person",
  external_payment_url: null,
  payment_instructions: null,
  pass_options: [],
  offer_monthly: true,
};

export function MembershipBillingSetup({ business }: { business: Business }) {
  const [cfg, setCfg] = useState<BillingConfig>(BLANK);
  const [savedCfg, setSavedCfg] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [newPerk, setNewPerk] = useState("");
  const [newPassMonths, setNewPassMonths] = useState<number>(12);
  const [newPassPrice, setNewPassPrice] = useState<string>("");
  const [newPassLabel, setNewPassLabel] = useState<string>("");

  const primary = business.brand_colors.primary;

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("business_membership_billing")
        .select("*")
        .eq("business_id", business.id)
        .maybeSingle();
      if (data) {
        const row = { ...BLANK, ...(data as BillingConfig) };
        setCfg(row);
        setSavedCfg(JSON.stringify(row));
      }
      setLoaded(true);
    })();
  }, [business.id]);

  /* ── the single reading of this config, shared with the customer app ── */
  const view = useMemo(() => readMembership(cfg), [cfg]);
  const blockers = membershipBlockers(view, !!cfg.stripe_secret_key);
  const canGoLive = blockers.length === 0;
  const dirty = loaded && savedCfg !== "" && JSON.stringify(cfg) !== savedCfg;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    setSaving(true); setErr(null);
    const supabase = createClient();

    // Secrets aren't on the RPC (they're staff-only columns), so they're
    // written directly first — and only in Stripe mode.
    if (cfg.payment_mode === "stripe") {
      const { error: sErr } = await supabase
        .from("business_membership_billing")
        .upsert({
          business_id:           business.id,
          stripe_secret_key:     cfg.stripe_secret_key || null,
          stripe_webhook_secret: cfg.stripe_webhook_secret || null,
          connected_at:          cfg.stripe_secret_key ? (cfg.connected_at ?? new Date().toISOString()) : null,
        }, { onConflict: "business_id" });
      if (sErr) { setSaving(false); setErr(sErr.message); return; }
    }

    // A config nobody can buy must never persist as live. The UI already
    // prevents reaching that state; coercing here makes it impossible.
    const enabled = cfg.is_enabled && canGoLive;

    const { error } = await supabase.rpc("upsert_membership_billing_v3", {
      p_business_id:                business.id,
      p_is_enabled:                 enabled,
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
      p_pass_options:               cfg.pass_options ?? [],
      p_offer_monthly:              cfg.offer_monthly ?? true,
    });
    setSaving(false);
    if (error) {
      setErr(
        /upsert_membership_billing_v3|schema cache/i.test(error.message)
          ? "This database is missing the CP-86 migration — apply cp86_migration.sql in Supabase, then reload."
          : error.message,
      );
      return;
    }
    const persisted = { ...cfg, is_enabled: enabled };
    setCfg(persisted);
    setSavedCfg(JSON.stringify(persisted));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  function addPerk() {
    const p = newPerk.trim();
    if (!p || cfg.perks.includes(p)) return;
    setCfg(c => ({ ...c, perks: [...c.perks, p] }));
    setNewPerk("");
  }
  function addPass() {
    const price = Math.round(parseFloat(newPassPrice || "0") * 100);
    if (!price || price <= 0) { setErr("Give the pass a price."); return; }
    if (view.passes.length >= 6) { setErr("A maximum of 6 passes is supported."); return; }
    setErr(null);
    const pass: MembershipPass = {
      id: (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10),
      label: newPassLabel.trim() || defaultPassLabel(newPassMonths),
      months: newPassMonths,
      price_cents: price,
    };
    setCfg(c => ({ ...c, pass_options: [...(c.pass_options ?? []), pass] }));
    setNewPassPrice(""); setNewPassLabel("");
  }
  function removePass(id: string) {
    setCfg(c => ({ ...c, pass_options: (c.pass_options ?? []).filter(p => p.id !== id) }));
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/${business.slug}/membership/webhook`
    : `https://yourdomain.com/api/${business.slug}/membership/webhook`;

  if (!loaded) {
    return <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-zinc-400" /></div>;
  }

  return (
    <div className="space-y-4 pb-24">

      {/* ── migration check ─────────────────────────────────────────────── */}
      {view.legacySchema && (
        <Card tone="danger">
          <div className="flex items-center gap-2 font-bold text-[13px]">
            <AlertCircle className="h-4 w-4 shrink-0" /> This database is missing the passes migration
          </div>
          <p className="mt-1.5 text-[12px] leading-snug">
            <code className="font-mono">pass_options</code> and <code className="font-mono">offer_monthly</code>{" "}
            aren&apos;t on this business&apos;s billing row, so passes can&apos;t be sold and the monthly
            switch has no effect — whatever you set here. Apply{" "}
            <code className="font-mono">cp86_migration.sql</code> in Supabase, then reload this page.
          </p>
        </Card>
      )}

      {/* ── status ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-white p-5"
        style={{ background: `linear-gradient(135deg, ${primary}08 0%, white 62%)` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-black"
              style={{ color: primary }}>
              <Crown className="h-3 w-3" /> Customer membership
            </div>
            <div className="mt-1 text-xl font-bold truncate">{view.name}</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {view.purchasable
                ? view.offers.map(o => o.kind === "monthly"
                    ? `${money(o.priceCents)}/mo`
                    : `${o.label} ${money(o.priceCents)}`).join("  ·  ")
                : "Nothing for sale yet"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
              cfg.is_enabled && canGoLive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"
            }`}>
              {cfg.is_enabled && canGoLive ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {cfg.is_enabled && canGoLive ? "Live" : "Off"}
            </span>
            {/* Always switchable OFF; only switchable ON when nothing blocks. */}
            <Switch
              checked={cfg.is_enabled}
              disabled={!cfg.is_enabled && !canGoLive}
              onCheckedChange={v => setCfg(c => ({ ...c, is_enabled: v }))}
            />
          </div>
        </div>

        {!canGoLive && (
          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {cfg.is_enabled ? "Can't go live — saves as OFF until you fix:" : "Before you can switch this on:"}
            </div>
            <ul className="mt-1.5 ml-5 list-disc space-y-1">
              {blockers.map(b => <li key={b}>{b}</li>)}
            </ul>
          </div>
        )}
        {canGoLive && cfg.is_enabled && (
          <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-[11px] text-emerald-900 flex items-start gap-2">
            <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Members can buy {view.offers.length === 1 ? "this" : `any of these ${view.offers.length}`}
              {view.paymentMode === "in_person"    && " and pay at your counter — staff tap Activate."}
              {view.paymentMode === "external_link" && " and pay at your link — staff tap Activate."}
              {view.paymentMode === "stripe"        && " and pay by card — Stripe activates them automatically."}
            </span>
          </div>
        )}
      </div>

      {/* ── 1. what members get ─────────────────────────────────────────── */}
      <Section n={1} title="What members get" icon={<Gift className="h-4 w-4" />} primary={primary}>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Membership name</Label>
          <Input
            value={cfg.membership_name}
            onChange={e => setCfg(c => ({ ...c, membership_name: e.target.value }))}
            placeholder="VIP Membership"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Perks — shown as a list in the app</Label>
          {cfg.perks.length > 0 && (
            <div className="space-y-1.5">
              {cfg.perks.map(p => (
                <div key={p} className="flex items-center gap-2 rounded-lg border bg-zinc-50 px-3 py-2 text-sm">
                  <Check className="h-3.5 w-3.5 shrink-0" style={{ color: primary }} />
                  <span className="flex-1">{p}</span>
                  <button
                    onClick={() => setCfg(c => ({ ...c, perks: c.perks.filter(x => x !== p) }))}
                    className="text-zinc-400 hover:text-rose-500 transition"
                    aria-label={`Remove ${p}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newPerk}
              onChange={e => setNewPerk(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPerk(); } }}
              placeholder="e.g. 10% off every visit"
            />
            <Button type="button" variant="outline" onClick={addPerk} className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {cfg.perks.length === 0 && (
            <p className="text-[10px] text-zinc-500">
              No perks yet — the app will show the membership without a benefits list.
            </p>
          )}
        </div>
      </Section>

      {/* ── 2. what they can buy ────────────────────────────────────────── */}
      <Section n={2} title="What they can buy" icon={<Ticket className="h-4 w-4" />} primary={primary}
        subtitle="A recurring monthly plan, one-time passes, or both.">

        {/* monthly */}
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50">
            <div>
              <div className="text-sm font-semibold">Monthly plan</div>
              <div className="text-[11px] text-muted-foreground">Renews every month until cancelled</div>
            </div>
            <Switch
              checked={view.monthlyOffered}
              onCheckedChange={v => setCfg(c => ({ ...c, offer_monthly: v }))}
            />
          </div>
          {view.monthlyOffered && (
            <div className="p-3 flex items-center gap-2 border-t">
              <span className="text-sm text-zinc-500">$</span>
              <Input
                type="number" min="0" step="0.01"
                value={(cfg.price_cents / 100).toString()}
                onChange={e => setCfg(c => ({ ...c, price_cents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
                className="max-w-[8rem]"
              />
              <span className="text-sm text-zinc-500">per month</span>
            </div>
          )}
        </div>

        {/* passes */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label className="text-xs text-muted-foreground">One-time passes</Label>
            <span className="text-[10px] text-zinc-400">{view.passes.length}/6</span>
          </div>

          {view.passes.map(p => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm bg-white">
              <Ticket className="h-3.5 w-3.5 shrink-0" style={{ color: primary }} />
              <span className="flex-1 font-semibold truncate">{p.label}</span>
              <span className="text-[11px] text-zinc-500 shrink-0">{p.months} mo</span>
              <span className="font-bold shrink-0" style={{ color: primary }}>{money(p.price_cents)}</span>
              <button onClick={() => removePass(p.id)}
                className="text-zinc-400 hover:text-rose-500 transition ml-1"
                aria-label={`Remove ${p.label}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {view.passes.length < 6 && (
            <div className="rounded-xl border border-dashed p-3 space-y-2 bg-zinc-50/60">
              <div className="flex gap-2">
                {PASS_DURATIONS.map(m => (
                  <button key={m} type="button"
                    onClick={() => setNewPassMonths(m)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-bold transition ${
                      newPassMonths === m ? "text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
                    }`}
                    style={newPassMonths === m ? { background: primary, borderColor: primary } : undefined}>
                    {m} mo
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newPassLabel}
                  onChange={e => setNewPassLabel(e.target.value)}
                  placeholder={defaultPassLabel(newPassMonths)}
                />
                <Input
                  type="number" min="0" step="0.01"
                  value={newPassPrice}
                  onChange={e => setNewPassPrice(e.target.value)}
                  placeholder="Price"
                  className="max-w-[7rem]"
                />
                <Button type="button" variant="outline" onClick={addPass} className="shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500">
                A pass is paid once and expires after its length. Leave the name blank to use{" "}
                &ldquo;{defaultPassLabel(newPassMonths)}&rdquo;.
              </p>
            </div>
          )}
        </div>
      </Section>

      {/* ── 3. how they pay ─────────────────────────────────────────────── */}
      <Section n={3} title="How they pay you" icon={<CreditCard className="h-4 w-4" />} primary={primary}
        subtitle="Pick whichever fits how you already take money. You can change this anytime.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <ModeCard
            active={cfg.payment_mode === "in_person"} primary={primary}
            onClick={() => setCfg(c => ({ ...c, payment_mode: "in_person" }))}
            icon={<Store className="h-4 w-4" />} title="At the front desk"
            blurb="They join in the app, then pay at your counter however you normally take money. Staff taps Activate." />
          <ModeCard
            active={cfg.payment_mode === "external_link"} primary={primary}
            onClick={() => setCfg(c => ({ ...c, payment_mode: "external_link" }))}
            icon={<Link2 className="h-4 w-4" />} title="Your payment link"
            blurb="Square invoice, PayPal, Shopify — any URL. They pay there, staff taps Activate." />
          <ModeCard
            active={cfg.payment_mode === "stripe"} primary={primary}
            onClick={() => setCfg(c => ({ ...c, payment_mode: "stripe" }))}
            icon={<Zap className="h-4 w-4" />} title="Stripe (automatic)"
            blurb="Built-in checkout. Members activate themselves — no staff step. Needs your Stripe key." />
        </div>

        {cfg.payment_mode === "external_link" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment link</Label>
            <Input
              type="url"
              value={cfg.external_payment_url ?? ""}
              onChange={e => setCfg(c => ({ ...c, external_payment_url: e.target.value || null }))}
              placeholder="https://square.link/u/… or https://paypal.me/…"
            />
          </div>
        )}

        {cfg.payment_mode !== "stripe" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Note for the customer (optional)</Label>
            <Input
              value={cfg.payment_instructions ?? ""}
              onChange={e => setCfg(c => ({ ...c, payment_instructions: e.target.value || null }))}
              placeholder={cfg.payment_mode === "in_person"
                ? "e.g. Pay at the front desk on your next visit."
                : "e.g. Use code FRIENDS at checkout."}
              maxLength={140}
            />
          </div>
        )}

        {cfg.payment_mode === "stripe" && (
          <div className="space-y-3 rounded-xl border bg-zinc-50/60 p-3">
            <div className="text-[11px] text-zinc-600">
              <strong>dashboard.stripe.com</strong> → Developers → API keys → copy your{" "}
              <strong>Secret key</strong>.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Stripe secret key</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={cfg.stripe_secret_key ?? ""}
                  onChange={e => setCfg(c => ({ ...c, stripe_secret_key: e.target.value || null }))}
                  placeholder="sk_live_… or sk_test_…"
                  className="pr-10 font-mono text-sm"
                />
                <button type="button" onClick={() => setShowKey(v => !v)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Stored staff-only. Never sent to a customer&apos;s device.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Webhook endpoint</Label>
              <div className="rounded-lg bg-zinc-900 text-emerald-400 font-mono text-[11px] px-3 py-2 break-all select-all">
                {webhookUrl}
              </div>
              <p className="text-[10px] text-zinc-500">
                Stripe → Webhooks → Add endpoint. Listen for <code>checkout.session.completed</code>,
                then paste the signing secret:
              </p>
              <Input
                type="password"
                value={cfg.stripe_webhook_secret ?? ""}
                onChange={e => setCfg(c => ({ ...c, stripe_webhook_secret: e.target.value || null }))}
                placeholder="whsec_…"
                className="font-mono text-sm"
              />
            </div>
          </div>
        )}
      </Section>

      {err && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 flex items-start gap-2 text-[11px] text-rose-900">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {/* ── save ────────────────────────────────────────────────────────── */}
      <div className={`sticky bottom-3 z-20 rounded-2xl border p-2.5 flex items-center gap-3 shadow-lg backdrop-blur transition ${
        dirty ? "bg-amber-50/95 border-amber-300" : "bg-white/95"
      }`}>
        <div className="flex-1 min-w-0 pl-1.5 text-[12px]">
          {dirty ? (
            <span className="font-bold text-amber-900 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Unsaved changes
            </span>
          ) : (
            <span className="font-semibold text-zinc-500">{saved ? "Saved." : "All changes saved."}</span>
          )}
        </div>
        <Button onClick={save} disabled={saving || !dirty} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : saved ? <Check className="h-4 w-4 mr-2" /> : null}
          {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────── sub-components ─────────────────────────── */

function Card({ tone, children }: { tone: "danger"; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      tone === "danger" ? "border-rose-300 bg-rose-50 text-rose-900" : ""
    }`}>{children}</div>
  );
}

function Section({
  n, title, subtitle, icon, primary, children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  primary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-black"
          style={{ background: `${primary}15`, color: primary }}>
          {n}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <span className="text-muted-foreground">{icon}</span> {title}
          </h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

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
      className={"text-left rounded-2xl border p-3 transition " +
        (active ? "bg-white ring-2" : "bg-zinc-50 hover:bg-white hover:shadow-sm")}
      style={{
        borderColor: active ? primary : undefined,
        ["--tw-ring-color" as any]: active ? primary : undefined,
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: active ? primary : `${primary}15`, color: active ? "white" : primary }}>
          {icon}
        </div>
        <div className="text-sm font-bold">{title}</div>
      </div>
      <p className="text-[11px] text-zinc-600 mt-2 leading-snug">{blurb}</p>
    </button>
  );
}
