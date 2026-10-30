import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/utils";

/**
 * GET /auth/confirm — CP-142
 *
 * The one place an emailed auth link is allowed to land.
 *
 * THE BUG THIS FIXES. The agency magic link pointed straight at /agency.
 * That is a server-rendered layout which calls auth.getUser() and
 * redirect("/login") before any browser code runs — so the token in the
 * URL was never exchanged, and the server redirect dropped it on the way
 * out. The link could not work by construction, for any of the eight
 * agency accounts, since CP-37.2 shipped the button in June.
 *
 * CP-139 solved the same problem for /<slug>/reset-password by consuming
 * the token in a CLIENT component. That works, but only because that page
 * is not behind a server gate. Anything gated needs the exchange to happen
 * BEFORE the render — which means a route handler, here.
 *
 * Handles both shapes Supabase might send, because which one you get
 * depends on the project's email template (see the CP-139 README):
 *
 *   ?token_hash=…&type=…  → verifyOtp             ({{ .TokenHash }})
 *   ?code=…               → exchangeCodeForSession (PKCE, current default)
 *
 * The legacy #access_token= shape is deliberately NOT handled: a fragment
 * never reaches the server. If the project's templates are ever switched
 * back to it, the link needs a client page instead.
 *
 * Both paths write the session cookies through the cookie-bound server
 * client, so by the time we redirect, the gate at the destination sees a
 * signed-in user.
 *
 * ?next= is passed through safeRedirect, so only same-origin absolute
 * paths survive — an open redirect here would be an account-takeover
 * vector, since the URL carries a live credential.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const next = safeRedirect(url.searchParams.get("next"), "/agency");

  // Where to send someone whose link didn't work. Keep the ?next so the
  // login page can bounce them onward once they get in another way.
  const failure = new URL(`/login?next=${encodeURIComponent(next)}`, url.origin);

  if (!tokenHash && !code) {
    failure.searchParams.set("error", "missing-token");
    return NextResponse.redirect(failure);
  }

  const supabase = createClient();

  if (tokenHash) {
    // `type` is whatever the template used — magiclink, recovery, invite,
    // email. Default to magiclink rather than guessing wrong and failing.
    const { error } = await supabase.auth.verifyOtp({
      type: (type as "magiclink" | "recovery" | "invite" | "email") ?? "magiclink",
      token_hash: tokenHash,
    });
    if (error) {
      failure.searchParams.set("error", "link-expired");
      return NextResponse.redirect(failure);
    }
  } else if (code) {
    // PKCE. @supabase/ssr keeps the code verifier in a cookie, so the
    // exchange works server-side — but only in the SAME BROWSER that asked
    // for the link. Request it on a laptop, open the mail on a phone, and
    // this fails by design (same limitation the CP-139 README documents).
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      failure.searchParams.set("error", "wrong-browser");
      return NextResponse.redirect(failure);
    }
  }

  // Session cookies are set. The destination's server gate will now pass.
  return NextResponse.redirect(new URL(next, url.origin));
}
