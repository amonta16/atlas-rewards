import { redirect } from "next/navigation";
import { headers } from "next/headers";

/**
 * Business discovery QR landing.  Format: https://<host>/qr/<slug>
 *
 * CP-43.2 fix: this app serves each business on its own SUBDOMAIN
 * (e.g. starbucks.atlas-engine.app), where the middleware rewrites
 * `/app`, `/login`, etc. under the business. The CP-43 version redirected
 * to a PATH (`/<slug>`) on the apex/admin host (app.atlas-engine.app) —
 * which loaded the landing but then every in-app `/app` link 404'd because
 * there was no business subdomain context. So we redirect to the business
 * SUBDOMAIN instead.
 *
 * Host resolution: take the request host, drop the leading label to get the
 * root domain (app.atlas-engine.app → atlas-engine.app), then send the
 * customer to https://<slug>.<root>/ . Local dev (lvh.me) keeps http + port.
 *
 * Inside the Atlas Engine native app, the shell intercepts /qr/<slug> via
 * extractSlugFromQr and this route never renders.
 */
export default function DiscoveryQrLanding({ params }: { params: { slug: string } }) {
  const h = headers();
  const reqHost = (h.get("x-forwarded-host") ?? h.get("host") ?? "lvh.me").split(":")[0];

  // Prefer the explicit env root domain when set; else derive from the host.
  const envRoot = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").split(":")[0];
  let rootDomain = envRoot;
  if (!rootDomain) {
    const parts = reqHost.split(".");
    rootDomain = parts.length > 2 ? parts.slice(1).join(".") : reqHost;
  }

  const isLocal = /lvh\.me|localhost|127\.0\.0\.1/.test(rootDomain);
  const protocol = isLocal ? "http" : "https";
  const port     = isLocal ? ":3000" : "";

  redirect(`${protocol}://${params.slug}.${rootDomain}${port}/`);
}
