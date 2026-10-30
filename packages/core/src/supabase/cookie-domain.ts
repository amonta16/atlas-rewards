/**
 * CP-81: ONE login for every business subdomain.
 *
 * Auth cookies were host-only (spa-a.atlas-engine.app and
 * spa-b.atlas-engine.app each had their own session), which made
 * "same account across shops" impossible without re-entering the
 * password at every business. Scoping the cookie to `.atlas-engine.app`
 * makes a single sign-in valid on the apex AND every business subdomain
 * — the /app layout's existing auto-enroll then makes joining shop #2
 * completely seamless.
 *
 * Security note: sharing the SESSION is safe — what a user can see per
 * business is enforced by RLS and per-business RPC gates, not by which
 * subdomain holds the cookie.
 *
 * The domain is only applied when the current host is actually under
 * NEXT_PUBLIC_ROOT_DOMAIN — on localhost / vercel preview URLs we fall
 * back to default host-only cookies so dev keeps working.
 */
export function sharedCookieDomain(host: string | null | undefined): string | undefined {
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
  if (!root || !host) return undefined;
  const h = host.split(":")[0].toLowerCase();
  if (h === root || h.endsWith(`.${root}`)) return `.${root}`;
  return undefined;
}

/** Cookie options to spread into a Supabase client when the domain applies. */
export function sharedCookieOptions(host: string | null | undefined) {
  const domain = sharedCookieDomain(host);
  return domain
    ? { cookieOptions: { domain, path: "/", sameSite: "lax" as const, secure: true } }
    : {};
}
