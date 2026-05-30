/**
 * POST /api/team/create-account — CP-42
 *
 * Admin-creates-the-account flow. Andrew's request: instead of sending
 * a token link the invitee uses to sign up, the agency admin enters
 * BOTH the email and a password, the backend creates the auth user
 * straight away, attaches the role, and returns a clean sign-in URL.
 *
 * The recipient gets a link → lands on /login pre-filled with their
 * email → types the password Andrew gave them → they're in their
 * portal. No token, no expiration, no "user already registered"
 * race conditions.
 *
 * Body:
 *   {
 *     email:    string,
 *     password: string (min 8),
 *     role:     "agency_admin" | "business_manager" | "business_staff",
 *     business_id?: string | null,
 *     full_name?: string,
 *   }
 *
 * Returns: { ok, email, role, business_id, sign_in_url }
 *
 * Auth: caller must be agency_admin (for any role / any business) OR
 * business_manager (for business_manager + business_staff in their
 * own business). Enforced by re-querying current_app_role() before
 * we touch the admin client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Role = "agency_admin" | "business_manager" | "business_staff";

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    password?: string;
    role?: Role;
    business_id?: string | null;
    full_name?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const email      = (body.email ?? "").trim().toLowerCase();
  const password   = body.password ?? "";
  const role       = body.role;
  const businessId = body.business_id ?? null;
  const fullName   = (body.full_name ?? "").trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }
  if (!role || !["agency_admin", "business_manager", "business_staff"].includes(role)) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }
  if (role !== "agency_admin" && !businessId) {
    return NextResponse.json({ error: "business_id required for this role" }, { status: 400 });
  }

  // 1. Verify the caller's role server-side.
  const server = createServer();
  const { data: { user: caller } } = await server.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // current_app_role returns the caller's role for a given business.
  // For agency_admin invites we pass null (agency-wide check).
  const { data: roleData } = await server.rpc("current_app_role", {
    p_business_id: businessId,
  });
  const callerRole = (typeof roleData === "string"
    ? roleData
    : (roleData as any)?.[0]) as Role | "customer" | null;

  // agency_admin can do anything. business_manager can create staff
  // and other managers for their own business. business_staff and
  // customers cannot create accounts.
  const allowed =
    callerRole === "agency_admin" ||
    (callerRole === "business_manager"
      && (role === "business_manager" || role === "business_staff")
      && businessId !== null);

  if (!allowed) {
    return NextResponse.json({ error: "permission denied for this role" }, { status: 403 });
  }

  // 2. Use the admin client to create (or find) the user.
  const admin = createAdminClient();

  // Check whether the user already exists. If yes, we don't try to
  // reset their password — that'd hijack their account. We just
  // attach the role.
  let userId: string | null = null;
  let createdNew = false;

  // listUsers doesn't support email filter on every Supabase version;
  // simplest reliable path: try createUser first, handle the
  // "User already registered" case by looking them up.
  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,                       // skip the verification email
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (createErr) {
      const msg = String(createErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        // Fall through — we'll look up the existing user below.
      } else {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }
    } else {
      userId = created?.user?.id ?? null;
      createdNew = true;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "create user failed" }, { status: 500 });
  }

  if (!userId) {
    // Look up the existing user by email.
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) {
      return NextResponse.json({ error: "could not look up existing user" }, { status: 500 });
    }
    const match = (list?.users ?? []).find(u =>
      (u.email ?? "").toLowerCase() === email,
    );
    if (!match) {
      return NextResponse.json({ error: "user exists but couldn't be located" }, { status: 500 });
    }
    userId = match.id;
  }

  // 3. Upsert the profile so name/email are populated immediately.
  await admin
    .from("profiles")
    .upsert({
      id: userId!,
      full_name: fullName || null,
      email,
    }, { onConflict: "id" });

  // 4. Insert the role row (skipping if it already exists).
  // We do this via the admin client to bypass RLS — we've already
  // checked caller permission above.
  const { error: roleErr } = await admin
    .from("business_users")
    .insert({
      user_id: userId!,
      business_id: role === "agency_admin" ? null : businessId,
      role,
    });
  if (roleErr && !String(roleErr.message || "").includes("duplicate key")) {
    return NextResponse.json({ error: roleErr.message }, { status: 400 });
  }

  // 5. Build the sign-in URL. We don't need a token — they sign in
  // with the email + password Andrew just set for them.
  //
  // /login?email=<email>&forBusiness=<slug> lets the page pre-fill
  // the email and (optionally) route them to the right post-login
  // destination.
  const signInUrl = new URL("/login", req.nextUrl.origin);
  signInUrl.searchParams.set("email", email);

  if (role !== "agency_admin" && businessId) {
    // Look up the slug so the link points at the right subdomain login.
    const { data: biz } = await admin
      .from("businesses")
      .select("slug")
      .eq("id", businessId)
      .maybeSingle();
    if ((biz as any)?.slug) {
      signInUrl.searchParams.set("biz", (biz as any).slug);
    }
  }

  return NextResponse.json({
    ok: true,
    email,
    role,
    business_id: businessId,
    created_new: createdNew,
    sign_in_url: signInUrl.toString(),
  });
}
