"use client";
import { useState, useTransition } from "react";
import { Settings as SettingsIcon, CreditCard, DollarSign, HelpCircle, Save, Check, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type AgencySettings = {
  id: number;
  stripe_account_id: string | null;
  default_setup_fee_cents: number;
  default_monthly_cents: number;
  support_email: string | null;
  support_url: string | null;
};

/**
 * Agency-wide settings: Stripe Connect ID, default pricing for new
 * sub-accounts, and the support contact info that surfaces in the
 * sidebar's footer card and the customer Profile tab.
 */
export function AgencySettingsClient({ initial }: { initial: AgencySettings }) {
  const [s, setS] = useState<AgencySettings>(initial);
  const [saving, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function update<K extends keyof AgencySettings>(k: K, v: AgencySettings[K]) {
    setS(prev => ({ ...prev, [k]: v }));
  }

  function save() {
    startSave(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("agency_settings")
        .update({
          stripe_account_id: s.stripe_account_id,
          default_setup_fee_cents: s.default_setup_fee_cents,
          default_monthly_cents:   s.default_monthly_cents,
          support_email: s.support_email,
          support_url:   s.support_url,
        })
        .eq("id", 1);
      if (!error) setSavedAt(new Date());
    });
  }

  const stripeReady = !!s.stripe_account_id;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-brand-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Account-wide preferences, billing, and support.</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving} className="bg-brand-primary text-white">
          {saving ? <>Saving…</> : savedAt ? <><Check className="h-4 w-4 mr-1" /> Saved</> : <><Save className="h-4 w-4 mr-1" /> Save</>}
        </Button>
      </div>

      {/* ============ STRIPE / BILLING ============ */}
      <Section
        title="Stripe billing"
        subtitle="Connect Stripe so MRR + setup fees from your sub-accounts sync to the dashboard."
        icon={<CreditCard className="h-5 w-5" />}
      >
        <div className={`rounded-lg px-4 py-3 mb-4 flex items-start gap-2 text-xs ${stripeReady ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            {stripeReady
              ? "Stripe is connected. Webhook events at /api/stripe/webhook will populate the MRR dashboard."
              : "Stripe isn't connected yet. Save your account ID below and configure a webhook endpoint at /api/stripe/webhook in your Stripe dashboard."}
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Stripe account ID">
            <Input
              value={s.stripe_account_id ?? ""}
              onChange={e => update("stripe_account_id", e.target.value || null)}
              placeholder="acct_1ABC23..."
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Find this in Stripe → Settings → Account details. We use it to identify which Stripe account
              the webhooks come from.
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Default monthly fee">
              <div className="flex items-center gap-2">
                <span className="text-sm">$</span>
                <Input type="number" min={0} step="0.01"
                  value={(s.default_monthly_cents / 100).toFixed(2)}
                  onChange={e => update("default_monthly_cents", Math.round(parseFloat(e.target.value || "0") * 100))} />
                <span className="text-xs text-muted-foreground shrink-0">/ month</span>
              </div>
            </Field>
            <Field label="Default setup fee">
              <div className="flex items-center gap-2">
                <span className="text-sm">$</span>
                <Input type="number" min={0} step="0.01"
                  value={(s.default_setup_fee_cents / 100).toFixed(2)}
                  onChange={e => update("default_setup_fee_cents", Math.round(parseFloat(e.target.value || "0") * 100))} />
                <span className="text-xs text-muted-foreground shrink-0">one-time</span>
              </div>
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            These defaults pre-fill when you add a new business. Override per-business in their Settings tab.
          </p>

          <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline">
            Open Stripe webhooks dashboard <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </Section>

      {/* ============ SUPPORT CONTACT ============ */}
      <Section
        title="Support contact"
        subtitle="What customers and managers see when they need help. Used by the sidebar footer + the Profile tab."
        icon={<HelpCircle className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <Field label="Support email">
            <Input
              type="email"
              value={s.support_email ?? ""}
              onChange={e => update("support_email", e.target.value || null)}
              placeholder="support@atlasengine.io"
            />
          </Field>
          <Field label="Support URL (optional)">
            <Input
              type="url"
              value={s.support_url ?? ""}
              onChange={e => update("support_url", e.target.value || null)}
              placeholder="https://help.atlasengine.io"
            />
          </Field>
        </div>
      </Section>

      {/* ============ PRICING DEFAULTS ============ */}
      <Section
        title="What sub-accounts get"
        subtitle="Snapshot — change per-business pricing from their Settings tab."
        icon={<DollarSign className="h-5 w-5" />}
      >
        <ul className="space-y-2 text-sm text-zinc-700">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            Loyalty rewards engine + customer PWA
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            Manager dashboard (point awards, redemptions, booking management)
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            Booking system with GHL Calendar sync (configured per-business)
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            GoHighLevel CRM/automation pipeline (configured at the GHL layer)
          </li>
        </ul>
      </Section>
    </div>
  );
}

/* ============== layout helpers ============== */

function Section({
  title, subtitle, icon, children,
}: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-6 mb-6">
      <div className="flex items-start gap-3 mb-4">
        {icon && (
          <div className="h-10 w-10 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
