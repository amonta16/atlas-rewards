import { createAdminClient } from "@/lib/supabase/admin";
import { JoinLandingClient, type LandingBusiness } from "./landing-client";

/**
 * CP-74: Smart join landing — the ONE URL every printed business QR encodes.
 *
 *   https://<root-domain>/j/FLIPPOS
 *
 * One QR covers every scenario:
 *   - Phone camera, app NOT installed → this page → store badge for the
 *     visitor's platform (once NEXT_PUBLIC_*_STORE_URL are set) + the join
 *     code shown big so they can enter it after installing (iOS loses
 *     install context; Android carries it via &referrer=<code>).
 *   - Phone camera, app installed → Universal Links / App Links will open
 *     the app directly (wired in the Capacitor checkpoint) and this page
 *     never renders.
 *   - No app yet (today) → "Continue in browser" → /qr/<slug> → the
 *     existing subdomain PWA flow (CP-43.2).
 *
 * Apex-domain route: business subdomains rewrite paths under /[business],
 * so printed QRs must always use the root domain.
 */

export const dynamic = "force-dynamic";

export default async function JoinLanding({ params }: { params: { code: string } }) {
  const clean = params.code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  let business: LandingBusiness | null = null;
  if (clean.length >= 3 && clean.length <= 24) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("businesses")
      .select("slug, name, join_code, logo_url, app_icon_url, hero_image_url, brand_colors, header_color")
      .ilike("join_code", clean)
      .maybeSingle();
    business = (data as LandingBusiness | null) ?? null;
  }

  return (
    <JoinLandingClient
      business={business}
      code={clean}
      appStoreUrl={process.env.NEXT_PUBLIC_APP_STORE_URL ?? ""}
      playStoreUrl={process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? ""}
    />
  );
}
