/**
 * POST /api/team/create-account — rewritten CP-37.15
 *
 * Provisions a team account (agency_admin / business_manager / business_staff)
 * via the new admin_provision_account RPC instead of the Supabase admin SDK.
 *
 * Why the rewrite: the SDK's createUser/updateUserById dance was producing
 * accounts the user couldn't sign into — every "Wrong email or password"
 * report Andrew hit. The exact root cause inside the SDK call was never
 * isolated (suspect: password silently dropped on the existing-user
 * update path in our SDK version). The RPC writes auth.users directly
 * via pgcrypto — the SAME path the cp37_14 fresh-start used to reset
 * Andrew's own account, which works reliably.
 *
 * The route now does almost nothing — read the body, call the RPC,
 * build a sign-in URL. All the heavy lifting is in admin_provision_account.
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
 * Returns:
 *   { ok, email, role, business_id, sign_in_url, created_new }
 *
 * Auth: caller must already be agency_admin (any role / any business)
 * OR business_manager (business_manager + business_staff in their
 * own business). Enforced inside the RPC.
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

  // Light client-side validation; the RPC re-validates everything.
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

  // Auth check + permission gate is inside the RPC; we just need a
  // signed-in client to invoke it (so auth.uid() resolves).
  const server = createServer();
  const { data: { user: caller } } = await server.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // Call the RPC. SECURITY DEFINER means it runs with elevated
  // privileges and can write auth.users.encrypted_password — the
  // critical bit the SDK kept fumbling.
  const { data, error } = await server.rpc("admin_provision_account", {
    p_email: email,
    p_password: password,
    p_role: role,
    p_business_id: businessId,
    p_full_name: fullName || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { user_id: string; created_new: boolean } | null;
  if (!row) {
    return NextResponse.json({ error: "provisioning returned no row" }, { status: 500 });
  }

  // Build the sign-in URL — same routing as CP-37.5: agency_admin
  // lands on /login → /agency; manager / front-desk lands on
  // /<slug>/login → /<slug>/manage (via ?next=).
  let signInUrl: URL;
  if (role === "agency_admin") {
    signInUrl = new URL("/login", req.nextUrl.origin);
    signInUrl.searchParams.set("email", email);
  } else if (businessId) {
    // Need the slug for the per-business surface. Use the admin
    // client because business_users RLS is restrictive for the
    // caller in some configurations.
    const admin = createAdminClient();
    const { data: biz } = await admin
      .from("businesses")
      .select("slug")
      .eq("id", businessId)
      .maybeSingle();
    const slug = (biz as any)?.slug;
    if (!slug) {
      return NextResponse.json({ error: "business slug not found" }, { status: 500 });
    }
    signInUrl = new URL(`/${slug}/login`, req.nextUrl.origin);
    signInUrl.searchParams.set("email", email);
    signInUrl.searchParams.set("next", `/${slug}/manage`);
  } else {
    signInUrl = new URL("/login", req.nextUrl.origin);
    signInUrl.searchParams.set("email", email);
  }

  return NextResponse.json({
    ok: true,
    email,
    role,
    business_id: businessId,
    created_new: row.created_new,
    sign_in_url: signInUrl.toString(),
  });
}
