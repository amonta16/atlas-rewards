import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@atlas/core/supabase/admin";
import { DEMO_SLUG } from "@/lib/clinic";

export const dynamic = "force-dynamic";

type Row = { slug: string; name: string; logo_url: string | null; contact_info: { address?: string } | null };
export type ClinicHit = { slug: string; name: string; logoUrl: string | null; address: string | null };

const DEMO: ClinicHit = { slug: DEMO_SLUG, name: "Glow Aesthetics", logoUrl: null, address: "Example clinic · San Luis Obispo, CA" };

/**
 * Find a clinic by name (?q=) or by its join / referral code (?code=).
 * Service role on purpose: it only ever returns public fields of active
 * med spas, never other businesses.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  const code = (req.nextUrl.searchParams.get("code") ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 24);
  const demoMatch = (q && ("glow aesthetics demo".includes(q.toLowerCase()) || q.toLowerCase().includes("demo"))) || code === "GLOW";

  let hits: ClinicHit[] = [];
  try {
    const admin = createAdminClient();
    let query = admin.from("businesses").select("slug, name, logo_url, contact_info")
      .eq("layout_preset", "medspa").neq("status", "archived").limit(12);
    if (code) query = query.ilike("join_code", code);
    else if (q.length >= 2) query = query.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
    else return NextResponse.json({ hits: [] });
    const { data } = await query;
    hits = ((data ?? []) as Row[]).map((r) => ({ slug: r.slug, name: r.name, logoUrl: r.logo_url, address: r.contact_info?.address ?? null }));
  } catch {
    /* No service key (local dev): only the example clinic is searchable. */
  }
  if (demoMatch) hits.push(DEMO);
  return NextResponse.json({ hits });
}
