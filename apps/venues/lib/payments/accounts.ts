/**
 * lib/payments/accounts.ts — CP-149 · server helpers around business_payment_accounts
 *
 * Service-role only. The row never holds a secret: for Stripe it is the
 * connected account id + the capability flags Stripe reports.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveAccount, type ConnectedAccount } from "@/lib/payments/stripe";

export type PaymentAccountRow = {
  id: string;
  business_id: string;
  provider: "stripe" | "square" | "clover";
  provider_account_id: string | null;
  account_type: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  livemode: boolean;
  connected_at: string | null;
  disconnected_at: string | null;
};

export async function getStripeAccountRow(businessId: string): Promise<PaymentAccountRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("business_payment_accounts")
    .select("*")
    .eq("business_id", businessId)
    .eq("provider", "stripe")
    .is("disconnected_at", null)
    .maybeSingle();
  return (data as PaymentAccountRow | null) ?? null;
}

/** The connected account id to charge on, or null when card checkout isn't live yet. */
export async function liveStripeAccount(businessId: string): Promise<string | null> {
  const row = await getStripeAccountRow(businessId);
  return row?.provider_account_id && row.charges_enabled ? row.provider_account_id : null;
}

/** Pull the latest flags from Stripe and mirror them (called on return + account.updated). */
export async function syncStripeAccount(businessId: string, accountId: string, acct?: ConnectedAccount) {
  const a = acct ?? await retrieveAccount(accountId);
  const admin = createAdminClient();
  const patch = {
    business_id: businessId,
    provider: "stripe",
    provider_account_id: a.id,
    account_type: a.type,
    charges_enabled: !!a.charges_enabled,
    payouts_enabled: !!a.payouts_enabled,
    details_submitted: !!a.details_submitted,
    requirements: a.requirements ?? null,
    livemode: !!a.livemode,
    last_synced_at: new Date().toISOString(),
    connected_at: a.details_submitted ? new Date().toISOString() : null,
    disconnected_at: null,
  };
  const { data: existing } = await admin
    .from("business_payment_accounts").select("id, connected_at")
    .eq("business_id", businessId).eq("provider", "stripe").maybeSingle();
  if (existing) {
    const { error } = await admin.from("business_payment_accounts")
      .update({ ...patch, connected_at: (existing as any).connected_at ?? patch.connected_at })
      .eq("id", (existing as any).id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("business_payment_accounts").insert(patch);
    if (error) throw new Error(error.message);
  }
  return a;
}

/** Resolve which business a connected account belongs to (webhooks carry event.account). */
export async function businessForStripeAccount(accountId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("business_payment_accounts").select("business_id")
    .eq("provider", "stripe").eq("provider_account_id", accountId).maybeSingle();
  return (data as any)?.business_id ?? null;
}
