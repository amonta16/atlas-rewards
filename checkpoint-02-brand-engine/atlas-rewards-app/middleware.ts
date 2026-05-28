import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Multi-tenant routing for Atlas Rewards.
 *
 *   demo.lvh.me:3000          → rewrites to /demo (customer-facing branded view)
 *   demo.atlasrewards.app     → rewrites to /demo
 *   atlasrewards.app          → root landing / agency
 *   agency.atlasrewards.app   → reserved for agency dashboard
 *   lvh.me:3000               → root landing / agency
 *
 * The PWA reads the resolved business slug from the URL pathname after this rewrite.
 */
export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  // Refresh Supabase auth cookies on every request
  const response = await updateSession(request);

  // Strip port (e.g., "demo.lvh.me:3000" → "demo.lvh.me")
  const hostNoPort = host.split(":")[0];

  // Determine the subdomain by removing the root domain
  let subdomain: string | null = null;
  if (hostNoPort === rootDomain || hostNoPort === `www.${rootDomain}`) {
    subdomain = null; // root domain — agency / landing
  } else if (hostNoPort.endsWith(`.${rootDomain}`)) {
    subdomain = hostNoPort.replace(`.${rootDomain}`, "");
  }

  // Reserved subdomains route to agency view
  const RESERVED = new Set(["www", "agency", "admin", "api"]);

  if (subdomain && !RESERVED.has(subdomain)) {
    // /agency is reserved for the agency dashboard (only reachable from the root domain).
    if (url.pathname.startsWith("/agency")) {
      return response;
    }
    // Avoid double-rewriting if URL already starts with the business slug
    if (url.pathname.startsWith(`/${subdomain}`)) {
      return response;
    }
    // Rewrite the path so app/[business]/... handles it.
    // /login, /signup, /app, /manage all get scoped under the business slug.
    url.pathname = `/${subdomain}${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url, { headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static, image, and API routes
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
