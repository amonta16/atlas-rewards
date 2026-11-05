import { NextResponse } from "next/server";
import { getClinic } from "@/lib/clinic";

/**
 * The front desk's own install manifest. Without it, "Add to Home Screen" on
 * the desk uses the clinic's patient-app manifest and opens the patient app.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { clinic: string } }) {
  const c = await getClinic(params.clinic).catch(() => null);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const icon = c.appIconUrl ?? "/atlas-icon-512.png";
  const start = `/${c.slug}/desk`;
  return NextResponse.json({
    id: start,
    name: `${c.name} Front Desk`,
    short_name: "Front Desk",
    description: `Front desk for ${c.name}: check patients in, orders, rewards and the app builder.`,
    start_url: start,
    scope: start,
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
