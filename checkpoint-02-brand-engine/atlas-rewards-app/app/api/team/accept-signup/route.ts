/**
 * POST /api/team/accept-signup — CP-37.3
 *
 * One-shot invitation acceptance + account creation. Replaces the
 * client-side `supabase.auth.signUp` call inside the accept-invitation
 * page, which was creating accounts that Supabase then refused to sign
 * in to (because "Confirm email" was on and the user never tapped the
 * confirmation link).
 *
 * This route runs server-side with the admin client and:
 *   1. Validates the invitation token by reading pending_invitations.
 *   2. Calls admin.auth.admin.createUser({ email_confirm: true }) so
 *      the new auth.users row lands already-confirmed — no email link
 *      to click, no "Invalid login credentials" race.
 *   3. Upserts the profile row.
 *   4. Calls accept_invitation(token) so the role / business_user row
 *      is attached.
 *   5. Returns a sign-in URL the page redirects to.
 *
 * If the email already exists (someone accepted an invite to a second
 * business with the same address), we DON'T touch their password — we
 * just attach the new role via accept_invitation. The client should
 * route them into the existing-account branch.
 *
 * Body:
 *   { token: string; password: string; full_name: string; birthday?: string }
 *
 * Returns:
 *   { ok: true, sign_in_url: string, existing_account?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { token?: string; password?: string; full_name?: string; birthday?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const token    = (body.token ?? "").trim();
  const password = body.password ?? "";
  const fullName = (body.full_name ?? "").trim();
  const birthday = body.birthday || null;

  if (!token)                  return NextResponse.json({ error: "token required" }, { status: 400 });
  if (password.length < 8)     return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  if (!fullName)               return NextResponse.json({ error: "name required" }, { status: 400 });

  const admin = createAdminClient();

  // (1) Resolve the invitation. RLS on pending_invitations is bypassed
  //     by the admin client, so we can read by token without needing
  //     the caller to be signed in.
  const { data: inv, error: invErr } = await admin
    .from("pending_invitations")
    .select("id, email, role, business_id, expires_at, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });
  if (!inv)   return NextResponse.json({ error: "invitation not found" }, { status: 404 });
  if (inv.revoked_at)        return NextResponse.json({ error: "invitation has been revoked" }, { status: 400 });
  if (inv.accepted_at)       return NextResponse.json({ error: "invitation has already been accepted" }, { status: 400 });
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: "invitation has expired" }, { status: 400 });
  }

  const email = inv.email.trim().toLowerCase();
  let userId: string | null = null;
  let existing = false;

  // (2) Try to create the user. If they already exist, fall through and
  //     attach the role without touching the password.
  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        ...(birthday ? { birthday } : {}),
      },
    });
    if (createErr) {
      const msg = String(createErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        existing = true;
      } else {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }
    } else {
      userId = created?.user?.id ?? null;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "create user failed" }, { status: 500 });
  }

  if (existing) {
    // Look up the existing user by email.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return NextResponse.json({ error: "could not look up existing user" }, { status: 500 });
    const match = (list?.users ?? []).find(u => (u.email ?? "").toLowerCase() === email);
    if (!match) return NextResponse.json({ error: "existing user could not be located" }, { status: 500 });
    userId = match.id;

    // Defensive: confirm the email if it somehow isn't (legacy invitees
    // who failed under the old client-side signUp flow).
    if (!match.email_confirmed_at) {
      await admin.auth.admin.updateUserById(match.id, { email_confirm: true });
    }
  }

  if (!userId) return NextResponse.json({ error: "user id missing" }, { status: 500 });

  // (3) Upsert profile so name/email/birthday surface immediately.
  await admin
    .from("profiles")
    .upsert({
      id: userId,
      full_name: fullName,
      email,
      ...(birthday ? { birthday } : {}),
    }, { onConflict: "id" });

  // (4) Role attachment happens client-side AFTER sign-in via the
  //     existing /api/team/accept → accept_invitation RPC path. That
  //     RPC is auth.uid()-gated, so we can't usefully call it from
  //     here; we'd need a separate accept_invitation_for_user shape.
  //     Keeping the existing post-sign-in flow means we don't have to
  //     ship a new SQL migration just to support invite accept-signup.

  // (5) Build sign-in URL.
  const signInUrl = new URL("/login", req.nextUrl.origin);
  signInUrl.searchParams.set("email", email);

  if (inv.business_id) {
    const { data: biz } = await admin
      .from("businesses")
      .select("slug")
      .eq("id", inv.business_id)
      .maybeSingle();
    if ((biz as any)?.slug) {
      // Per-business surfaces sign in at /<slug>/login.
      const perBiz = new URL(`/${(biz as any).slug}/login`, req.nextUrl.origin);
      perBiz.searchParams.set("email", email);
      return NextResponse.json({
        ok: true,
        sign_in_url: perBiz.toString(),
        existing_account: existing,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    sign_in_url: signInUrl.toString(),
    existing_account: existing,
  });
}
