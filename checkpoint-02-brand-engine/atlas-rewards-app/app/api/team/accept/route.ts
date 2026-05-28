/**
 * POST /api/team/accept — CP-31
 *
 * Called from the /accept-invitation/[token] landing page after the
 * invitee is authenticated. Just thin-wraps the accept_invitation()
 * RPC so the page can show a friendly error toast on failure.
 *
 * Body: { token: string }
 * Returns: { ok: true; role: string; business_id: string | null }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { token?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const token = body.token;
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { ok: boolean; role: string; business_id: string | null } | null;

  return NextResponse.json({
    ok: true,
    role: row?.role ?? null,
    business_id: row?.business_id ?? null,
  });
}
