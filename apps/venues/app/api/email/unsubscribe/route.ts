/**
 * /api/email/unsubscribe?t=<signed token> — CP-217
 *
 * GET  → the link in every automation email's footer: opts the member out of
 *        emails (member_comm_prefs.email_opt_out_at) and shows a small branded
 *        confirmation page.
 * POST → RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), same effect.
 *
 * The token is base64url(membership_id).hmac (lib/automations/unsubscribe-token.ts);
 * nothing else in the URL is trusted. Push notifications are not affected.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/automations/unsubscribe-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHex = (h: string | undefined) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h : "#2d6a78");

type Outcome = { ok: boolean; name: string | null; logoUrl: string | null; primary: string };

async function optOut(token: string | null): Promise<Outcome> {
  const fallback: Outcome = { ok: false, name: null, logoUrl: null, primary: "#2d6a78" };
  const membershipId = verifyUnsubscribeToken(token);
  if (!membershipId) return fallback;
  const admin = createAdminClient();
  const { data: mem } = await admin.from("business_memberships").select("id, business_id").eq("id", membershipId).maybeSingle();
  if (!mem) return fallback;
  const nowIso = new Date().toISOString();
  const { error } = await admin.from("member_comm_prefs")
    .upsert({ membership_id: membershipId, email_opt_out_at: nowIso, updated_at: nowIso }, { onConflict: "membership_id" });
  if (error) {
    console.error("[unsubscribe] upsert failed:", error.message);
    return fallback;
  }
  // anything still waiting in the queue for this member is dropped too
  await admin.from("email_outbox").update({ status: "skipped", error: "opted_out" }).eq("membership_id", membershipId).eq("status", "queued");
  const { data: biz } = await admin.from("businesses").select("name, logo_url, brand_colors").eq("id", (mem as { business_id: string }).business_id).maybeSingle();
  const b = biz as { name?: string; logo_url?: string | null; brand_colors?: { primary?: string } | null } | null;
  return { ok: true, name: b?.name ?? null, logoUrl: b?.logo_url ?? null, primary: safeHex(b?.brand_colors?.primary) };
}

function page(o: Outcome): string {
  const name = o.name ? esc(o.name) : "this clinic";
  const brand = o.logoUrl && /^https:\/\//i.test(o.logoUrl)
    ? `<img src="${esc(o.logoUrl)}" alt="${name}" style="height:40px;max-width:200px;object-fit:contain">`
    : `<div style="font-size:20px;font-weight:700;color:${o.primary}">${name}</div>`;
  const title = o.ok ? "You're unsubscribed" : "This link isn't valid";
  const msg = o.ok
    ? `You won't get any more emails from ${name}. Your points, rewards and app notifications are unchanged.`
    : "The unsubscribe link is incomplete or has expired. Open the newest email and try the link again, or ask the front desk to update your preferences.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#f4f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#262b3d">
<main style="max-width:440px;margin:56px auto;padding:0 16px">
<div style="background:#fff;border-radius:18px;padding:32px 28px;text-align:center">
${brand}
<h1 style="font-size:22px;margin:22px 0 10px">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#4a5060;margin:0">${msg}</p>
</div></main></body></html>`;
}

export async function GET(req: NextRequest) {
  const o = await optOut(req.nextUrl.searchParams.get("t"));
  return new NextResponse(page(o), { status: o.ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const o = await optOut(req.nextUrl.searchParams.get("t"));
  return NextResponse.json({ ok: o.ok }, { status: o.ok ? 200 : 400 });
}
