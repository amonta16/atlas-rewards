/**
 * lib/payments/stripe.ts — CP-149 · Stripe Connect (server only)
 *
 * Atlas is a Stripe *platform*. Every business owns a Standard connected
 * account; Atlas holds ONLY its acct_… id. Charges, subscriptions and
 * customers live on the connected account (the `Stripe-Account` header), so
 * the business is merchant of record, sees everything in its own dashboard,
 * and Atlas never touches card data or a business's secret key.
 *
 * ENV (Vercel → Settings → Environment Variables):
 *   STRIPE_SECRET_KEY              Atlas platform secret key (sk_live_… / sk_test_…)
 *   STRIPE_CONNECT_WEBHOOK_SECRET  signing secret of the ONE Connect webhook
 *                                  ("Listen to events on Connected accounts")
 *   STRIPE_PLATFORM_FEE_PERCENT    optional, e.g. "2.5" — Atlas's cut per charge.
 *                                  Unset/0 = no application fee.
 *
 * No npm dependency: plain REST via fetch (the codebase already does this in
 * the CP-23 checkout route). Never import from a client component.
 */
import crypto from "crypto";

const API = "https://api.stripe.com/v1";
const VERSION = "2024-06-20";

export function platformKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set — add the Atlas platform key to the environment.");
  return k;
}

export function platformFeePercent(): number | null {
  const v = parseFloat(process.env.STRIPE_PLATFORM_FEE_PERCENT ?? "");
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Flatten a nested object into Stripe's form encoding (a[b][0][c]=…). */
export function encodeForm(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => typeof item === "object" ? encodeForm(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item)));
    else if (typeof v === "object") encodeForm(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeError extends Error {
  status: number; code?: string; type?: string;
  constructor(status: number, body: any) {
    super(body?.error?.message ?? `Stripe error ${status}`);
    this.status = status; this.code = body?.error?.code; this.type = body?.error?.type;
  }
}

/**
 * One call to Stripe. `account` = connected account id to act on behalf of.
 * `idempotencyKey` for anything that creates money-moving objects.
 */
export async function stripe<T = any>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, unknown>,
  opts: { account?: string | null; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${platformKey()}`,
    "Stripe-Version": VERSION,
  };
  if (opts.account) headers["Stripe-Account"] = opts.account;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let url = `${API}${path}`;
  let body: string | undefined;
  if (params && method === "GET") url += `?${encodeForm(params).toString()}`;
  else if (params) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = encodeForm(params).toString(); }
  const res = await fetch(url, { method, headers, body, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, json);
  return json as T;
}

/* ── Connect: accounts + onboarding ─────────────────────────────────── */

export type ConnectedAccount = {
  id: string;
  type: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  livemode: boolean;
  requirements?: { currently_due?: string[]; disabled_reason?: string | null };
  business_profile?: { name?: string | null };
};

/** Create a Standard connected account for a business (owner completes KYC on Stripe). */
export function createStandardAccount(businessId: string, businessName: string, email?: string | null) {
  return stripe<ConnectedAccount>("POST", "/accounts", {
    type: "standard",
    country: "US",
    email: email ?? undefined,
    business_profile: { name: businessName },
    metadata: { atlas_business_id: businessId },
  }, { idempotencyKey: `acct_create_${businessId}` });
}

/** Hosted onboarding link. Stripe returns the owner to `returnUrl` when done. */
export function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
  return stripe<{ url: string; expires_at: number }>("POST", "/account_links", {
    account: accountId, type: "account_onboarding", return_url: returnUrl, refresh_url: refreshUrl,
  });
}

export function retrieveAccount(accountId: string) {
  return stripe<ConnectedAccount>("GET", `/accounts/${accountId}`);
}

/** Owner's own Stripe dashboard (Standard accounts log in directly; this is just a convenience URL). */
export const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com/";

/* ── Checkout on the connected account ──────────────────────────────── */

export type CheckoutInput = {
  account: string;
  businessId: string;
  businessSlug: string;
  businessName: string;
  userId: string;
  membershipId?: string | null;
  customerEmail?: string | null;
  /** Reuse the customer Stripe already knows for renewals / portal. */
  customerId?: string | null;
  productName: string;
  description: string;
  priceCents: number;
  /** monthly subscription vs one-time pass */
  kind: "monthly" | "pass";
  passMonths?: number | null;
  passLabel?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export async function createCheckoutSession(i: CheckoutInput) {
  const fee = platformFeePercent();
  const metadata = {
    atlas_business_id: i.businessId,
    atlas_business_slug: i.businessSlug,
    atlas_user_id: i.userId,
    atlas_membership_id: i.membershipId ?? undefined,
    atlas_plan_kind: i.kind,
    atlas_pass_months: i.passMonths ?? undefined,
    atlas_plan_label: i.passLabel ?? (i.kind === "monthly" ? "Monthly" : undefined),
    atlas_price_cents: i.priceCents,
  };
  const params: Record<string, unknown> = {
    mode: i.kind === "monthly" ? "subscription" : "payment",
    client_reference_id: i.userId,
    customer: i.customerId ?? undefined,
    customer_email: i.customerId ? undefined : (i.customerEmail ?? undefined),
    // Always create a Customer so the portal / renewals / receipts work.
    customer_creation: i.kind === "pass" && !i.customerId ? "always" : undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: i.priceCents,
        product_data: { name: i.productName, description: i.description },
        recurring: i.kind === "monthly" ? { interval: "month" } : undefined,
      },
    }],
    metadata,
    success_url: i.successUrl,
    cancel_url: i.cancelUrl,
    allow_promotion_codes: false,
    billing_address_collection: "auto",
  };
  if (i.kind === "monthly") {
    params.subscription_data = { metadata, ...(fee ? { application_fee_percent: fee } : {}) };
  } else {
    params.payment_intent_data = {
      metadata,
      ...(fee ? { application_fee_amount: Math.round(i.priceCents * fee / 100) } : {}),
    };
  }
  return stripe<{ id: string; url: string }>("POST", "/checkout/sessions", params, {
    account: i.account,
    idempotencyKey: `co_${i.userId}_${i.businessId}_${i.kind}_${i.passLabel ?? "m"}_${Math.floor(Date.now() / 60_000)}`,
  });
}

/* ── Manage: portal + cancel ────────────────────────────────────────── */

export function createPortalSession(account: string, customerId: string, returnUrl: string) {
  return stripe<{ url: string }>("POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl }, { account });
}

export function setCancelAtPeriodEnd(account: string, subscriptionId: string, cancel: boolean) {
  return stripe<{ id: string; status: string; cancel_at_period_end: boolean; current_period_end: number }>(
    "POST", `/subscriptions/${subscriptionId}`, { cancel_at_period_end: cancel }, { account },
  );
}

export function retrieveSubscription(account: string, subscriptionId: string) {
  return stripe<any>("GET", `/subscriptions/${subscriptionId}`, undefined, { account });
}

/* ── Webhook signature (shared with the legacy routes' logic) ───────── */

export function verifyStripeSignature(rawBody: string, sigHeader: string | null, secret: string, toleranceSec = 300): boolean {
  if (!sigHeader || !secret) return false;
  const parts: Record<string, string[]> = {};
  for (const p of sigHeader.split(",")) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim();
    (parts[k] ??= []).push(v);
  }
  const t = parts.t?.[0];
  const sigs = parts.v1 ?? [];
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - parseInt(t, 10)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return sigs.some(s => {
    try { return crypto.timingSafeEqual(Buffer.from(s, "hex"), Buffer.from(expected, "hex")); } catch { return false; }
  });
}

/** Unix seconds → ISO, tolerant of null. */
export const ts = (n: number | null | undefined) => (typeof n === "number" ? new Date(n * 1000).toISOString() : null);
