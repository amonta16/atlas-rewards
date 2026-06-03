import { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

/**
 * Front-desk PWA manifest — CP-43.4
 *
 * Separate from the customer manifest (app/[business]/manifest.ts) so the
 * FRONT DESK can be installed as its own desktop/taskbar app that opens
 * straight to /manage — not the customer view. A distinct `id` + `start_url`
 * makes the browser treat it as a different installable app from the
 * customer rewards app, so a business can have both pinned.
 */
export const dynamic = "force-dynamic";

export default async function manifest({ params }: { params: { business: string } }): Promise<MetadataRoute.Manifest> {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("name, logo_url, app_icon_url, brand_colors")
    .eq("slug", params.business)
    .single();

  const name = data?.name ?? "Atlas";
  const themeColor = (data?.brand_colors as { primary?: string })?.primary ?? "#0a3d62";
  const iconUrl = (data as any)?.app_icon_url ?? data?.logo_url ?? "/icons/icon-512.png";

  return {
    id: "/manage",
    name: `${name} — Front Desk`,
    short_name: name.length > 10 ? `${name.slice(0, 10)} Desk` : `${name} Desk`,
    description: `Front-desk app for ${name}: scan members, award points, fulfil rewards.`,
    start_url: "/manage",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
