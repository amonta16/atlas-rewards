/**
 * POST /api/frontdesk/create — CP-49
 *
 * A manager creates a NEW front-desk person with just a NAME + 4-digit
 * PIN — no email, no password. Under the hood we provision a hidden
 * business_staff auth user (so all existing RLS keeps working) and attach
 * the PIN to it. The staffer then signs in at /<slug>/frontdesk.
 *
 * Mirrors /api/team/create-account, minus the email: the synthetic email
 * is internal plumbing the staffer never sees or uses.
 *
 * Body:    { business_id, display_name, pin }
 * Returns: { ok: true, user_id, display_name }
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { business_id?: string; display_name?: string; pin?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid request" }, { status: 400 }); }

  const businessId  = (body.business_id ?? "").trim();
  const displayName = (body.display_name ?? "").trim();
  const pin         = (body.pin ?? "").trim();

  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!/^[0-9]{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
  }

  // Caller must be signed in; permission (manager/admin) is enforced inside
  // the RPCs (manages_business). We re-check here to avoid creating an
  // orphan auth user when the caller isn't allowed.
  const server = createServer();
  const { data: { user: caller } } = await server.auth.getUser();
  if (!caller) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: allowed, error: gateErr } = await server.rpc("manages_business", {
    p_business_id: businessId,
  });
  if (gateErr || !allowed) {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Hidden auth user — synthetic email the staffer never uses.
  const syntheticEmail = `desk-${randomUUID()}@frontdesk.atlas.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password: randomUUID() + randomUUID(),  // strong, never surfaced
    email_confirm: true,
    user_metadata: { full_name: displayName, front_desk: true },
  });
  if (createErr || !created?.user) {
    return NextResponse.json(
      { error: `could not create account: ${createErr?.message ?? "unknown"}` },
      { status: 400 },
    );
  }
  const userId = created.user.id;

  // Attach the business_staff role (re-checks caller permission).
  const { error: roleErr } = await server.rpc("attach_team_role", {
    p_user_id: userId,
    p_role: "business_staff",
    p_business_id: businessId,
    p_full_name: displayName,
  });
  if (roleErr) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: roleErr.message }, { status: 403 });
  }

  // Set the PIN. If it clashes with someone else's, roll back the user so
  // we don't leave an orphan account behind.
  const { error: pinErr } = await server.rpc("set_front_desk_pin", {
    p_business_id: businessId,
    p_user_id: userId,
    p_display_name: displayName,
    p_pin: pin,
  });
  if (pinErr) {
    await server.rpc("remove_team_member", {
      p_user_id: userId, p_business_id: businessId, p_role: "business_staff",
    }).catch(() => {});
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: pinErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user_id: userId, display_name: displayName });
}
