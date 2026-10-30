import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { getStripeAccountRow, syncStripeAccount } from "@/lib/payments/accounts";
import { createAccountLink } from "@/lib/payments/stripe";
import { safeRedirect } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/stripe/connect/return?business=<uuid>&to=<path>[&refresh=1] — CP-149
 *
 * Where Stripe sends the owner back after (or mid-way through) hosted
 * onboarding. We re-read the account, mirror charges/payouts/details flags,
 * and bounce to the in-app page they started from with ?stripe=connected
 * (or ?stripe=incomplete so the UI can say "finish setup").
 *
 * refresh=1 = the onboarding link expired; mint a fresh one and go straight
 * back into Stripe.
 *
 * Auth: the caller must still be signed in as a manager of the business —
 * the URL itself grants nothing (nothing is written from user input; we only
 * re-sync from Stripe).
 */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business");
  const to = safeRedirect(req.nextUrl.searchParams.get("to"), "/");
  const origin = req.nextUrl.origin;
  const fail = (code: string) => NextResponse.redirect(`${origin}${to}${to.includes("?") ? "&" : "?"}stripe=${code}`);
  if (!businessId) return fail("error");

  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(to)}`);
  const { data: manages } = await supabase.rpc("manages_business", { p_business_id: businessId });
  if (!manages) return fail("forbidden");

  const row = await getStripeAccountRow(businessId);
  if (!row?.provider_account_id) return fail("error");

  try {
    if (req.nextUrl.searchParams.get("refresh") === "1") {
      const returnUrl  = `${origin}/api/stripe/connect/return?business=${businessId}&to=${encodeURIComponent(to)}`;
      const refreshUrl = `${returnUrl}&refresh=1`;
      const link = await createAccountLink(row.provider_account_id, returnUrl, refreshUrl);
      return NextResponse.redirect(link.url);
    }
    const acct = await syncStripeAccount(businessId, row.provider_account_id);
    return fail(acct.charges_enabled ? "connected" : "incomplete");
  } catch {
    return fail("error");
  }
}
