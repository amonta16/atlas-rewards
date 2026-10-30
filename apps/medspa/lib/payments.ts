/**
 * Card payments for a clinic (server only).
 *
 * Every clinic is a Stripe Connect account (CP-149): Atlas holds only its
 * acct_… id, charges run on the clinic's account, and the money goes to the
 * clinic. Clinics connect Stripe from the manager portal (Billing → Connect
 * Stripe). The ONE Connect webhook in the venue app
 * (/api/stripe/connect/webhook) marks the member as paid, for both apps.
 */
import { liveStripeAccount } from "@atlas/core/payments/accounts";
import type { Clinic } from "./clinic";

/** The clinic's connected Stripe account, or null when card checkout isn't live. */
export async function clinicStripeAccount(clinic: Clinic): Promise<string | null> {
  if (clinic.isExample || !process.env.STRIPE_SECRET_KEY) return null;
  try { return await liveStripeAccount(clinic.id); } catch { return null; }
}

/** Show "Subscribe" as a real checkout? (The demo clinic fakes a successful one.) */
export async function clinicTakesCards(clinic: Clinic): Promise<boolean> {
  if (clinic.isExample && clinic.id === "example") return true;
  return !!(await clinicStripeAccount(clinic));
}
