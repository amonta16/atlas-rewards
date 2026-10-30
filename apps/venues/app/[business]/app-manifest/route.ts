import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer-app PWA manifest — CP-219.
 *
 * app/[business]/manifest.ts never worked: Next.js doesn't serve a
 * manifest metadata file from a nested dynamic segment (the same 404 the
 * front desk hit in CP-43.4), and nothing linked it. Every customer page
 * shipped WITHOUT a manifest, so on Android "Add to Home screen" made a plain
 * browser shortcut (opens in a Chrome tab, no app icon/splash/standalone)
 * and Chrome never offered to install the app. Served here as a route
 * handler, linked from app/[business]/layout.tsx generateMetadata.
 *
 * start_url/scope follow how the customer reached us: on the business
 * subdomain the app lives at /app; on the shared host it's /<slug>/app.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("name, logo_url, app_icon_url, brand_colors")
    .eq("slug", params.business)
    .maybeSingle();

  const name = data?.name?.trim() || "Atlas Rewards";
  const themeColor = (data?.brand_colors as { primary?: string } | null)?.primary ?? "#0a3d62";
  const iconUrl = (data as { app_icon_url?: string | null } | null)?.app_icon_url ?? data?.logo_url ?? "/atlas-apple-touch.png";

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  const onSubdomain = host.startsWith(`${params.business}.`);
  const base = onSubdomain ? "" : `/${params.business}`;

  const manifest = {
    id: `${base}/app`,
    name: `${name} Rewards`,
    short_name: name.length > 12 ? name.slice(0, 12).trim() : name,
    description: `Earn points and unlock rewards at ${name}.`,
    start_url: `${base}/app`,
    scope: `${base}/`,
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}
