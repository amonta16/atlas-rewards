/**
 * POST /api/team/reset-member-password — CP-48
 *
 * Stopgap account recovery from the front desk while custom SMTP (the
 * self-serve email reset) is being set up. A staff/manager/admin sets a
 * NEW password for a member and we hand it back once to share with them.
 *
 * NOTE: we cannot show a member's CURRENT password — Supabase stores only
 * a one-way bcrypt hash, so the plaintext is unrecoverable by anyone. The
 * only safe recovery is to set a new one, which is what this does.
 *
 * Permission: staff_can_manage_member(user_id) — agency_admin, or a
 * manager/front-desk of a business the member belongs to. Enforced
 * server-side; the route's job is only to call the Admin SDK.
 *
 * Body:    { user_id: string, password?: string }   (password optional → generated)
 * Returns: { ok, password }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function generatePassword(): string {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (s: string, n: number) =>
    Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join("");
  return `Atlas-${pick(upper, 1)}${pick(lower, 3)}${pick(digits, 3)}${pick(lower, 2)}`;
}

export async function POST(req: NextRequest) {
  let body: { user_id?: string; password?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const userId = (body.user_id ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  const custom = (body.password ?? "").trim();
  if (custom && custom.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const server = createServer();
  const { data: { user: caller } } = await server.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // Permission gate — runs as the caller, so auth.uid() is correct.
  const { data: allowed, error: gateErr } = await server.rpc("staff_can_manage_member", {
    p_member_user_id: userId,
  });
  if (gateErr) {
    return NextResponse.json({ error: gateErr.message }, { status: 400 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "not allowed to manage this member" }, { status: 403 });
  }

  const newPassword = custom || generatePassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true,
  });
  if (error) {
    return NextResponse.json({ error: `could not reset password: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ ok: true, password: newPassword });
}
