/**
 * POST /api/team/invite — CP-31 / CP-36
 *
 * CP-36: dropped the Supabase magic-link email send. The route now just
 * mints the invitation via the create_invitation RPC and returns the
 * accept URL so the UI can render a copy-link panel. Andrew's call —
 * removing the email path also removes the "magic link never arrives"
 * support load and the dependency on SUPABASE_SERVICE_ROLE_KEY in
 * environments where email isn't configured at all.
 *
 * Permission gating still happens server-side inside create_invitation:
 *   • agency_admin can invite any role for any (or no) business_id
 *   • business_manager can invite business_manager + business_staff
 *     for their own business (CP-36 SQL update)
 *   • business_staff cannot invite anyone
 *
 * Body: { email: string; role: "agency_admin"|"business_manager"|"business_staff";
 *         business_id?: string }
 *
 * Returns: { token: string, url: string, email: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";

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

  const url = `${req.nextUrl.origin}/accept-invitation/${token}`;
  return NextResponse.json({ token, url, email });
}
