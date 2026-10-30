import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@atlas/core/supabase/server";
import { DEMO_COOKIE } from "@/lib/patient";
import { CLINIC_COOKIE } from "@/lib/remember";

export const dynamic = "force-dynamic";

/** Sign out, then land back on the same clinic as a guest. */
export async function GET(req: NextRequest) {
  const clinic = req.cookies.get(CLINIC_COOKIE)?.value;
  try { await createClient().auth.signOut(); } catch { /* already signed out */ }
  const res = NextResponse.redirect(new URL(clinic ? `/${clinic}` : "/find", req.url));
  res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
