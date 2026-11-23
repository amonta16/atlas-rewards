/**
 * /api/automations/venue-email — CP-261 · the venue desk's email automations helper.
 *
 *   GET  ?business_id=…  → { sending, provider, to }  is VENUE_EMAIL_SEND on, is Resend configured,
 *                          and which inbox a test goes to (the signed-in manager's own email).
 *   POST { business_id, key, node_id } → sends ONE test of that journey email to the signed-in
 *                          manager's own email (never to a member), with "[Test]" in the subject.
 *                          Real links, real prizes, sample points, so every button can be tapped.
 *
 * Managers and Atlas admins only (is_business_manager_or_admin). Rate limited. Test sends don't need
 * VENUE_EMAIL_SEND: they only ever reach the person who asked for them.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { emailFrom } from "@/lib/automations/email-template";
import { buildVenueEmail, VENUE_CATALOG, type VenueMessage } from "@/lib/automations/venue-email-build";
import { signUnsubscribeToken } from "@/lib/automations/unsubscribe-token";
import { businessUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function gate(businessId: string | null) {
  if (!businessId || !UUID.test(businessId)) return { error: NextResponse.json({ error: "business_id required" }, { status: 400 }) };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "not authenticated" }, { status: 401 }) };
  const { data: ok } = await supabase.rpc("is_business_manager_or_admin", { p_business_id: businessId });
  if (!ok) return { error: NextResponse.json({ error: "Managers only" }, { status: 403 }) };
  return { supabase, user };
}

export async function GET(req: Request) {
  const g = await gate(new URL(req.url).searchParams.get("business_id"));
  if ("error" in g) return g.error;
  return NextResponse.json({
    sending: process.env.VENUE_EMAIL_SEND === "1",
    provider: !!process.env.RESEND_API_KEY,
    to: g.user.email ?? null,
  });
}

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "venue-test-email"), 12, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  let body: { business_id?: string; key?: string; node_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const g = await gate(body.business_id ?? null);
  if ("error" in g) return g.error;
  const to = (g.user.email ?? "").trim();
  if (!to.includes("@")) return NextResponse.json({ error: "Your account has no email address to send the test to." }, { status: 400 });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Email isn't connected yet (RESEND_API_KEY missing)." }, { status: 503 });

  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses")
    .select("id, name, slug, logo_url, hero_image_url, brand_colors, contact_info, point_rules, layout_preset").eq("id", body.business_id!).single();
  if (!biz) return NextResponse.json({ error: "business not found" }, { status: 404 });

  // The live copy (it includes any edits Atlas made for this venue), else the catalog as shipped.
  let msg: VenueMessage | undefined;
  const { data: live } = await g.supabase.rpc("wf_suite", { p_business_id: biz.id });
  const liveRow = Array.isArray(live) ? (live as { key: string; messages: VenueMessage[] | null }[]).find((r) => r.key === body.key) : undefined;
  msg = liveRow?.messages?.find((m) => m.node_id === body.node_id);
  if (!msg) msg = VENUE_CATALOG.find((j) => j.key === body.key)?.messages.find((m) => m.node_id === body.node_id);
  if (!msg || msg.channel !== "email") return NextResponse.json({ error: "unknown email" }, { status: 404 });

  const [{ data: rw }, { data: prof }, { data: mem }] = await Promise.all([
    admin.from("rewards").select("id, name, point_cost, image_url").eq("business_id", biz.id)
      .eq("is_active", true).eq("show_in_store", true).is("archived_at", null).order("point_cost", { ascending: true }),
    admin.from("profiles").select("full_name").eq("id", g.user.id).maybeSingle(),
    admin.from("business_memberships").select("id").eq("business_id", biz.id).eq("user_id", g.user.id).maybeSingle(),
  ]);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const abs = (u: string | null | undefined) => (!u ? null : /^https?:\/\//i.test(u) ? u : u.startsWith("/") ? businessUrl(root, { slug: biz.slug, path: u }) : null);
  const firstName = ((prof as { full_name?: string | null } | null)?.full_name ?? "").trim().split(/\s+/)[0] || "there";
  const unsubscribeUrl = mem?.id
    ? businessUrl(root, { path: `/api/email/unsubscribe?t=${encodeURIComponent(signUnsubscribeToken(mem.id))}` })
    : businessUrl(root, { slug: biz.slug, path: "/app/profile" });
  const contact = (biz.contact_info ?? {}) as { email?: string; address?: string; phone?: string };
  const colors = (biz.brand_colors ?? {}) as { primary?: string; secondary?: string };

  const { subject, html, text } = buildVenueEmail({
    journeyKey: body.key!, msg, firstName, test: true,
    brand: { businessName: biz.name, logoUrl: abs(biz.logo_url), primary: colors.primary ?? "#0284c7", secondary: colors.secondary ?? null,
             heroUrl: abs(biz.hero_image_url), address: contact.address ?? null, phone: contact.phone ?? null },
    prizes: ((rw ?? []) as { id: string; name: string; point_cost: number; image_url: string | null }[])
      .map((r) => ({ id: r.id, name: r.name, pointCost: r.point_cost, imageUrl: abs(r.image_url) })),
    pointRules: (biz.point_rules ?? {}) as Record<string, number>,
    base: (path) => businessUrl(root, { slug: biz.slug, path }),
    unsubscribeUrl,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(biz.name).header, to: [to], subject, html, text,
      ...((contact.email ?? "").includes("@") ? { reply_to: contact.email } : {}),
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error(`[venue-email] test send failed ${res.status}: ${detail}`);
    return NextResponse.json({ error: `The email service said no (${res.status}). Try again in a minute.` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to });
}
