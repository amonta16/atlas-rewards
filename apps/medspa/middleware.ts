import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@atlas/core/supabase/middleware";

/**
 * Keeps the Supabase session cookie fresh (same hardened logic as the venue app).
 *
 * Skipped for the built-in example clinic (/demo) and whenever Supabase keys
 * are missing, so the sales demo runs on any machine with no setup.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isDemo = path === "/demo" || path.startsWith("/demo/");
  const hasKeys = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isDemo || !hasKeys) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|medspa-example/|.*\\.(?:png|jpg|jpeg|webp|svg|woff2)$).*)"],
};
