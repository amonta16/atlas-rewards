import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@atlas/core/supabase/server";
import { DEMO_COOKIE } from "@/lib/patient";
import { DEMO_ORDERS_COOKIE, DEMO_REVIEW_COOKIE } from "@/lib/orders";
import { DEMO_VOUCHERS_COOKIE } from "@/lib/vouchers";
import { CLINIC_COOKIE } from "@/lib/remember";

export const dynamic = "force-dynamic";

/** Sign out, then land back on the same clinic as a guest. */
export async function GET(req: NextRequest) {
  const clinic = req.cookies.get(CLINIC_COOKIE)?.value;
  try { await createClient().auth.signOut(); } catch { /* already signed out */ }
  const res = NextResponse.redirect(new URL(clinic ? `/${clinic}` : "/find", req.url));
  // Example clinic: signing out resets the whole demo (points, orders, vouchers, review).
  for (const name of [DEMO_COOKIE, DEMO_ORDERS_COOKIE, DEMO_REVIEW_COOKIE, DEMO_VOUCHERS_COOKIE]) res.cookies.set(name, "", { path: "/", maxAge: 0 });
  return res;
}
