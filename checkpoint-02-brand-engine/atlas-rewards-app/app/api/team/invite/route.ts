/**
 * POST /api/team/invite — CP-31
 *
 * Two-step flow:
 *   1. Call create_invitation() as the authenticated caller. The RPC
 *      checks the caller's permissions and returns a token if allowed.
 *   2. Use the service-role admin client to send a Supabase magic-link
 *      invitation email with the token attached to the redirect URL.
 *      The recipient lands on /accept-invitation/[token] after sign-in.
 *
 * Body: { email: string; role: "agency_admin"|"business_manager"|"business_staff";
 *         business_id?: string }
 *
 * Returns: { token: string } on success, { error: string } on failure.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; role?: string; business_id?: string | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const email = (body.email ?? "").trim();
  const role  = body.role;
  const businessId = body.business_id ?? null;

  if (!email || !role) {
    return NextResponse.json({ error: "email and role required" }, { status: 400 });
  }

  // Step 1 — create the pending invitation via RPC (RPC checks perms).
  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("create_invitation", {
    p_email: email,
    p_role: role,
    p_business_id: businessId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  const token = (Array.isArray(data) ? data[0]?.token : (data as any)?.token) as string | undefined;
  if (!token) {
    return NextResponse.json({ error: "no token returned" }, { status: 500 });
  }

  // Step 2 — Supabase magic-link email via service role. The redirect URL
  // is /accept-invitation/[token]; that page calls accept_invitation() RPC
  // once the user has signed in.
  const admin = createAdminClient();
  const origin = req.nextUrl.origin;
  const redirectTo = `${origin}/accept-invitation/${token}`;

  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invitation_token: token,
      // Useful breadcrumb for support — easy to grep in the Supabase logs.
      invited_via: "atlas-cp31",
    },
  });

  if (inviteErr) {
    // Most common: user already exists in auth.users. In that case fall
    // back to a regular magic-link sign-in to the same redirect URL —
    // accept_invitation() will still claim the token once they're signed in.
    if (/already.*registered/i.test(inviteErr.message)) {
      const { error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkErr) {
        return NextResponse.json({ error: linkErr.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ token, email });
}
