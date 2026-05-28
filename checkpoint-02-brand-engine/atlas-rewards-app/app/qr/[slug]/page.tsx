import { redirect } from "next/navigation";
import { headers } from "next/headers";

/**
 * Business discovery QR landing.
 * Format: https://<root>/qr/<slug>
 *
 * Behavior:
 * - Outside Atlas Engine (regular browser): redirect to the business landing page on its subdomain.
 * - Inside Atlas Engine (the native shell): Atlas Engine intercepts the URL via its
 *   `extractSlugFromQr` function and adds the business directly — this route never renders.
 *
 * Host resolution order:
 *   1. NEXT_PUBLIC_ROOT_DOMAIN env (canonical when set)
 *   2. The request's own Host header (fallback so prod deployments without env still work)
 *   3. "lvh.me" for local dev
 */
export default function DiscoveryQrLanding({ params }: { params: { slug: string } }) {
  const env = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  const h = headers();
  // x-forwarded-host wins behind load balancers; fall back to host.
  const reqHost = (h.get("x-forwarded-host") ?? h.get("host") ?? "lvh.me").split(":")[0];

  // Prefer env (deliberate), else the request host minus any leading subdomain.
  let rootDomain = env;
  if (!rootDomain) {
    const parts = reqHost.split(".");
    rootDomain = parts.length > 2 ? parts.slice(1).join(".") : reqHost;
  }

  const isLocal = /lvh\.me|localhost|127\.0\.0\.1/.test(rootDomain);
  const protocol = isLocal ? "http" : "https";
  const port     = isLocal ? ":3000" : "";

  redirect(`${protocol}://${params.slug}.${rootDomain}${port}/`);
}
