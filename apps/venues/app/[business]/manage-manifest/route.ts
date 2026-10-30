import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Front-desk PWA manifest — served as a ROUTE HANDLER (CP-43.4).
 *
 * Next.js does NOT serve a `manifest.ts` metadata file at a nested dynamic
 * segment ([business]/manage/manifest.ts → 404), so we return the manifest
 * JSON from a plain route handler at /<slug>/manage-manifest instead. The
 * front-desk install card / ManagerPwaInstall points the page's
 * <link rel="manifest"> here.
 *
 * Business-scoped start_url so the installed desktop/taskbar app opens
 * straight to the front desk on this apex path-based deployment
 * (app.atlas-engine.app/<slug>/manage), not the customer view.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("name, logo_url, app_icon_url, brand_colors")
    .eq("slug", params.business)
    .single();

  const name = data?.name ?? "Atlas";
  const themeColor = (data?.brand_colors as { primary?: string })?.primary ?? "#0a3d62";
  const iconUrl = (data as any)?.app_icon_url ?? data?.logo_url ?? "/icons/icon-512.png";

  const manifest = {
    id: `/${params.business}/manage`,
    name: `${name} — Front Desk`,
    short_name: name.length > 10 ? `${name.slice(0, 10)} Desk` : `${name} Desk`,
    description: `Front-desk app for ${name}: scan members, award points, fulfil rewards.`,
    start_url: `/${params.business}/manage`,
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "window-controls-overlay"],
    orientation: "any",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
