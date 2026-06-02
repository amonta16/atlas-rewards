import { redirect } from "next/navigation";

/**
 * Business discovery QR landing.
 * Format: https://<thisHost>/qr/<slug>
 *
 * Behavior:
 * - Outside Atlas Engine (regular browser): redirect to this business's
 *   PATH-based landing on the SAME host (`/<slug>`), which forwards on to
 *   the app / login. Path-based routing works on every host (*.vercel.app,
 *   custom domains, localhost) — no per-business subdomain required.
 * - Inside Atlas Engine (the native shell): Atlas Engine intercepts the URL
 *   via `extractSlugFromQr` and adds the business directly — this route
 *   never renders.
 *
 * CP-43 fix: this used to redirect to `https://<slug>.<rootDomain>/`, a
 * per-business SUBDOMAIN that doesn't exist on a Vercel deployment (every
 * project has a single `*.vercel.app` host), so the QR landed nowhere.
 */
export default function DiscoveryQrLanding({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}`);
}
