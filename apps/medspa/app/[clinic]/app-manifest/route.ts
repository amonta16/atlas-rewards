import { NextResponse } from "next/server";
import { getClinic } from "@/lib/clinic";

/**
 * Per-clinic install manifest (same idea as the venue app's CP-219 one).
 * Needed so "Add to Home Screen" makes a real app, and on iPhone web push
 * only works from an app added to the Home Screen.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { clinic: string } }) {
  const c = await getClinic(params.clinic).catch(() => null);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const icon = c.appIconUrl ?? "/atlas-icon-512.png";
  const base = `/${c.slug}`;
  return NextResponse.json({
    id: base,
    name: c.name,
    short_name: shortName(c.name),
    description: `Rewards, memberships and treatments at ${c.name}.`,
    start_url: base,
    scope: `${base}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}

/** Home-screen label: whole words that fit in 12 characters ("Glow Aesthetics" → "Glow"). */
function shortName(name: string) {
  if (name.length <= 12) return name;
  let out = "";
  for (const w of name.split(/\s+/)) { if ((out ? out.length + 1 : 0) + w.length > 12) break; out = out ? `${out} ${w}` : w; }
  return out || name.slice(0, 12);
}
