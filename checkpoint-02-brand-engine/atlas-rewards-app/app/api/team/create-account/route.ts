/**
 * POST /api/team/create-account — rewritten CP-37.16
 *
 * MAGIC-LINK INVITES. Andrew kept hitting "Wrong email or password"
 * with the password-based flow no matter how the underlying password
 * was written (admin SDK, direct SQL, etc). The fix is to stop using
 * passwords entirely for team invites and lean on Supabase's
 * generateLink({ type: 'magiclink' }) instead.
 *
 * Flow:
 *   1. admin_provision_account RPC creates / updates the auth.users
 *      row + attaches the role. We pass a throwaway random password
 *      so the row is valid — but the recipient never has to type it.
 *   2. admin.auth.admin.generateLink({ type: 'magiclink', email })
 *      mints a one-time sign-in URL via Supabase's native flow.
 *   3. Route returns that URL. Admin copies it, sends to the
 *      teammate. Teammate clicks → signed in → lands on portal.
 *
 * The recipient can set their own password later from the profile
 * page if they want. For team invites, the magic link is enough.
 *
 * Body:
 *   { email, role, business_id?, full_name? }   ← password no longer required
 *
 * Returns:
 *   { ok, email, role, business_id, sign_in_url, created_new }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Role = "agency_admin" | "business_manager" | "business_staff";

// Random throwaway password — only exists so auth.users.encrypted_password
// is not null. Recipient never types it; they sign in via the magic link.
function randomPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  let out = "";
  for (let i = 0; i < 32; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    role?: Role;
    business_id?: string | null;
    full_name?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const email      = (body.email ?? "").trim().toLowerCase();
  const role       = body.role;
  const businessId = body.business_id ?? null;
  const fullName   = (body.full_name ?? "").trim();

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
  // inside the admin_provision_account RPC.
  const server = createServer();
  const { data: { user: caller } } = await server.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // ─── 1. Provision the auth.users row + role via the RPC. ──────
  // Pass a throwaway password (must satisfy the RPC's >=8 char check)
  // so the row's encrypted_password isn't null.
  const throwawayPassword = randomPassword();
  const { data: provData, error: provErr } = await server.rpc("admin_provision_account", {
    p_email: email,
    p_password: throwawayPassword,
    p_role: role,
    p_business_id: businessId,
    p_full_name: fullName || null,
  });
  if (provErr) {
    return NextResponse.json({ error: provErr.message }, { status: 400 });
  }
  const provRow = (Array.isArray(provData) ? provData[0] : provData) as
    { user_id: string; created_new: boolean } | null;
  if (!provRow) {
    return NextResponse.json({ error: "provisioning returned no row" }, { status: 500 });
  }

  // ─── 2. Figure out where the recipient should land after sign-in. ──
  // agency_admin → /agency
  // manager / front-desk → /<slug>/manage
  const admin = createAdminClient();
  let postLoginPath = "/agency";
  if (role !== "agency_admin" && businessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("slug")
      .eq("id", businessId)
      .maybeSingle();
    const slug = (biz as any)?.slug;
    if (!slug) {
      return NextResponse.json({ error: "business slug not found" }, { status: 500 });
    }
    postLoginPath = `/${slug}/manage`;
  }

  // ─── 3. Mint the magic link via Supabase's generateLink. ──────
  // type: 'magiclink' produces a one-time sign-in URL. Supabase's
  // own auth handler verifies it and signs the user in — completely
  // independent of our password storage. The redirectTo controls
  // where they land after Supabase processes the link.
  const redirectTo = `${req.nextUrl.origin}${postLoginPath}`;
  let signInUrl: string;
  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkErr) throw linkErr;
    signInUrl = (linkData as any)?.properties?.action_link ?? "";
    if (!signInUrl) throw new Error("generateLink returned no action_link");
  } catch (e: any) {
    return NextResponse.json(
      { error: `magic link generation failed: ${e?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    role,
    business_id: businessId,
    created_new: provRow.created_new,
    sign_in_url: signInUrl,
  });
}
