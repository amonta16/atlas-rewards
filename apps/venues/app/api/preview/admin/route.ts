import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clean } from "@/lib/landing/notify";
import { parseColor } from "@/lib/preview/colors";
import { buildPreview } from "@/lib/preview/build";
import { normalizeTreatments } from "@/lib/preview/treatments";
import { checkUrl } from "@/lib/preview/safe-fetch";
import { expiresAt, newPreviewSlug, previewUrl } from "@/lib/preview/store";

/**
 * POST /api/preview/admin — CP-232 · create a preview by hand (agency_admin only).
 *
 * Body { business_name, website?, logo_url?, primary?, secondary?, treatments?: [{ name, category, price }] }
 * Anything left blank is filled the automatic way (from the website), then the
 * usual fallbacks. The logo URL is downloaded through the SSRF guard and
 * re-hosted, never hot-linked. Waits for the build (up to ~2 minutes).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function requireAgencyAdmin(): Promise<string | null> {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await server.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  return data?.length ? user.id : null;
}

function optionalUrl(v: unknown): string | null | "bad" {
  const s = clean(v, 500);
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try { return checkUrl(withScheme).toString(); } catch { return "bad"; }
}

export async function POST(req: Request) {
  const userId = await requireAgencyAdmin();
  if (!userId) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const name = clean(b.business_name, 160);
  if (!name) return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  const website = optionalUrl(b.website);
  const logoUrl = optionalUrl(b.logo_url);
  if (website === "bad") return NextResponse.json({ error: "That website address isn't allowed (public http/https only)." }, { status: 400 });
  if (logoUrl === "bad") return NextResponse.json({ error: "That logo URL isn't allowed (public http/https only)." }, { status: 400 });
  const primary = parseColor(clean(b.primary, 30));
  const secondary = parseColor(clean(b.secondary, 30));
  const treatments = normalizeTreatments({ treatments: Array.isArray(b.treatments) ? b.treatments.slice(0, 20) : [] });

  const slug = newPreviewSlug(name);
  const db = createAdminClient();
  const { data, error } = await db.from("app_previews").insert({
    slug, business_name: name, website, phone: clean(b.phone, 40) || null, address: clean(b.address, 200) || null,
    source: "manual", status: "building", expires_at: expiresAt(), created_by: userId,
  }).select("id").single();
  if (error || !data) {
    console.error("[preview] admin insert failed", error);
    return NextResponse.json({ error: "Couldn't save that preview." }, { status: 500 });
  }

  await buildPreview(data.id, { logoUrl, primary, secondary, treatments: treatments.length ? treatments : null });
  const { data: row } = await db.from("app_previews").select("slug, status, build_error, logo_url, colors, treatments_are_examples").eq("id", data.id).single();
  return NextResponse.json({ ok: true, url: previewUrl(slug), ...row });
}
