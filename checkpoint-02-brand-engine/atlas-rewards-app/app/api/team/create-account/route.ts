/**
 * POST /api/team/create-account — CP-46 (email + password invites)
 *
 * Fixes the "Database error finding user" toast AND switches invites to a
 * straightforward email + password the inviter can hand to the teammate.
 *
 * Root cause of the old error: the auth.users row was created via a raw
 * SQL INSERT (admin_provision_account), which skips the auth.identities
 * row and leaves token columns NULL, so GoTrue can't load it. We now
 * create the user through the Admin SDK, which produces a fully
 * GoTrue-valid row — so password sign-in works reliably.
 *
 * Flow:
 *   1. team_invite_precheck RPC — permission gate (raises on denial, so
 *      we never create an orphan auth user) + returns the existing auth
 *      uid for this email, or NULL.
 *   2. New: admin.auth.admin.createUser({ email, password, email_confirm }).
 *      Existing: admin.auth.admin.updateUserById to (re)set the password +
 *      confirm the email, repairing any legacy raw-SQL row.
 *   3. attach_team_role RPC — profiles upsert + business_users insert.
 *   4. Return the email + password + login URL so the inviter can share.
 *
 * Body:
 *   { email, role, business_id?, full_name?, password? }
 *   password is optional — when omitted we generate a readable one.
 *
 * Returns:
 *   { ok, email, password, login_url, role, business_id, created_new }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Role = "agency_admin" | "business_manager" | "business_staff";

// CP-46: friendly auto-generated password when the inviter doesn't set one.
// No ambiguous characters (0/O, 1/l/I) so it's easy to read aloud / type.
function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const upper   = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits  = "23456789";
  const pick = (s: string, n: number) =>
    Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  // e.g. "Atlas-Kp7mqr" → satisfies length + a capital + digits.
  return `Atlas-${pick(upper, 1)}${pick(letters, 3)}${pick(digits, 3)}${pick(letters, 2)}`;
}

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    role?: Role;
    business_id?: string | null;
    full_name?: string;
    password?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const email      = (body.email ?? "").trim().toLowerCase();
  const role       = body.role;
  const businessId = body.business_id ?? null;
  const fullName   = (body.full_name ?? "").trim();
  // CP-46: password-based invites. The inviter may set one; if blank, we
  // generate a readable temp password and hand it back so they can share it.
  const customPassword = (body.password ?? "").trim();
  if (customPassword && customPassword.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  const teamPassword = customPassword || generatePassword();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  if (!role || !["agency_admin", "business_manager", "business_staff"].includes(role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }
  if (role !== "agency_admin" && !businessId) {
    return NextResponse.json({ error: "business_id required for this role" }, { status: 400 });
  }

  // Caller must be signed in. Permission gate (admin vs manager) lives
  // inside the team_invite_precheck + attach_team_role RPCs.
  const server = createServer();
  const { data: { user: caller } } = await server.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ─── 1. Permission gate + existing-user lookup (no auth.users writes). ──
  // The precheck RAISES if the caller isn't allowed to invite this role,
  // so we never create an orphan auth user before the gate.
  const { data: existingUid, error: preErr } = await server.rpc("team_invite_precheck", {
    p_email: email,
    p_role: role,
    p_business_id: businessId,
  });
  if (preErr) {
    return NextResponse.json({ error: preErr.message }, { status: 403 });
  }
  const existingId = (existingUid as string | null) ?? null;

  // ─── 2. Create (or normalise) the auth user via the Admin SDK. ──
  // Going through GoTrue guarantees a valid row + identity, which is what
  // generateLink() needs. A raw SQL INSERT does not, which is what caused
  // "Database error finding user".
  let userId: string;
  let createdNew = false;
  if (!existingId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: teamPassword,         // the credential we hand back to the inviter
      email_confirm: true,            // skip the confirm-email step for invites
      user_metadata: { full_name: fullName || "" },
    });
    if (createErr || !created?.user) {
      return NextResponse.json(
        { error: `could not create account: ${createErr?.message ?? "unknown"}` },
        { status: 400 },
      );
    }
    userId = created.user.id;
    createdNew = true;
  } else {
    userId = existingId;
    // Existing account → reset the password to the new one (and confirm the
    // email) through GoTrue so email+password sign-in works immediately,
    // even if the row was a legacy raw-SQL insert.
    try {
      await admin.auth.admin.updateUserById(userId, {
        password: teamPassword,
        email_confirm: true,
      });
    } catch { /* non-fatal — the user already exists and is usable */ }
  }

  // ─── 3. Wire the profile + role (permission re-checked inside). ──
  const { error: roleErr } = await server.rpc("attach_team_role", {
    p_user_id: userId,
    p_role: role,
    p_business_id: businessId,
    p_full_name: fullName || null,
  });
  if (roleErr) {
    return NextResponse.json({ error: roleErr.message }, { status: 403 });
  }

  // ─── 4. Where the recipient signs in. ──
  // agency_admin → /login ; manager / front-desk → /<slug>/login
  // They sign in with email + password at this page.
  let loginPath = "/login";
  if (role !== "agency_admin" && businessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("slug")
      .eq("id", businessId)
      .maybeSingle();
    const slug = (biz as any)?.slug;
    if (slug) loginPath = `/${slug}/login`;
  }
  const loginUrl = `${req.nextUrl.origin}${loginPath}`;

  return NextResponse.json({
    ok: true,
    email,
    password: teamPassword,
    login_url: loginUrl,
    role,
    business_id: businessId,
    created_new: createdNew,
  });
}
