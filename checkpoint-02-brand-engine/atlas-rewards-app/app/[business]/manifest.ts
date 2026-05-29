import { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-business PWA manifest — each customer subdomain gets its own
 * installable app with the business's branding.
 */
export const dynamic = "force-dynamic";

export default async function manifest({ params }: { params: { business: string } }): Promise<MetadataRoute.Manifest> {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses").select("name, logo_url, brand_colors").eq("slug", params.business).single();

  const name = data?.name ?? "Atlas Rewards";
  const themeColor = (data?.brand_colors as { primary?: string })?.primary ?? "#6366f1";

  return {
    name: `${name} Rewards`,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: `Earn points and unlock rewards at ${name}.`,
    start_url: "/app",
    scope: "/",
    // CP-37: display_override gives iOS a stronger signal that this is
    // a fully standalone app (no browser chrome). Falls back to
    // "standalone" on browsers that don't support display_override.
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    // CP-37: "any maskable" lets Android crop the icon to its preferred
    // shape (circle on Pixel, squircle on Samsung) without distortion.
    icons: [
      { src: data?.logo_url ?? "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: data?.logo_url ?? "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
