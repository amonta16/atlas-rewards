/**
 * POST /api/team/create-account — rewritten CP-46
 *
 * MAGIC-LINK INVITES. CP-46 fixes the "magic link generation failed:
 * Database error finding user" toast Andrew hit on every invite.
 *
 * Root cause: the old flow created the auth.users row via a raw SQL
 * INSERT (admin_provision_account). GoTrue's generateLink() then can't
 * load that row — the raw INSERT skips the auth.identities row and
 * leaves token columns NULL, so GoTrue's scan fails ("Database error
 * finding user"). Creating the user through the Admin SDK instead
 * produces a fully GoTrue-valid row + identity, so generateLink works.
 *
 * Flow:
 *   1. team_invite_precheck RPC — permission gate (raises on denial, so
 *      we never create an orphan auth user) + returns the existing auth
 *      uid for this email, or NULL.
 *   2. If new: admin.auth.admin.createUser({ email, email_confirm }).
 *      If existing: admin.auth.admin.updateUserById to normalise any
 *      legacy SQL-inserted row so generateLink can load it.
 *   3. attach_team_role RPC — profiles upsert + business_users insert.
 *   4. admin.auth.admin.generateLink({ type: 'magiclink', email }) mints
 *      the one-time sign-in URL. Admin copies it to the teammate.
 *
 * Body:
 *   { email, role, business_id?, full_name? }   ← password not required
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
      password: randomPassword(),     // throwaway — recipient uses the magic link
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
    // Re-touch the row through GoTrue so any legacy raw-SQL-inserted user
    // is normalised (identity + token columns) — otherwise generateLink
    // would still fail on it.
    try {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
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

  // ─── 4. Figure out where the recipient should land after sign-in. ──
  // agency_admin → /agency
  // manager / front-desk → /<slug>/manage
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

  // ─── 5. Mint the magic link via Supabase's generateLink. ──────
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
    created_new: createdNew,
    sign_in_url: signInUrl,
  });
}
