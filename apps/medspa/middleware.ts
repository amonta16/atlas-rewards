import type { NextRequest } from "next/server";
import { updateSession } from "@atlas/core/supabase/middleware";

/** Keeps the Supabase session cookie fresh (same hardened logic as the venue app). */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|medspa-example/|.*\\.(?:png|jpg|jpeg|webp|svg|woff2)$).*)"],
};
