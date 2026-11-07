import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { checkCode, phoneVerifyEnabled, sendCode } from "@/lib/preview/twilio";
import { getPreviewBySlug, isExpired, previewDb, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/verify — CP-234 · the 6-digit texted code after the contact form.
 *
 * Body { slug, action: "send" } → texts a code to the number on the preview.
 * Body { slug, action: "check", code } → { ok } and stamps phone_verified_at.
 * The number always comes from the row (never from this request), so this
 * can't be used to text arbitrary numbers. Off (→ { skip: true }) until
 * PREVIEW_VERIFY_PHONE=1 and Twilio is configured.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-verify"), 10, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!phoneVerifyEnabled()) return NextResponse.json({ ok: true, skip: true });

  let b: { slug?: unknown; action?: unknown; code?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const slug = typeof b.slug === "string" && SLUG_RE.test(b.slug) ? b.slug : null;
  if (!slug || (b.action !== "send" && b.action !== "check")) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row) || !row.contact_phone) return NextResponse.json({ error: "Please enter your mobile number first." }, { status: 400 });
  if ((row as { phone_verified_at?: string | null }).phone_verified_at) return NextResponse.json({ ok: true, verified: true });

  if (b.action === "send") {
    const per = await rateLimit(`pv-verify-send:${slug}`, 3, 900);
    if (!per.ok) return NextResponse.json({ error: "We've sent a few codes already. Please wait a few minutes." }, { status: 429 });
    const sent = await sendCode(row.contact_phone);
    return sent ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "We couldn't text that number. Check it and try again." }, { status: 502 });
  }

  const tries = await rateLimit(`pv-verify-check:${slug}`, 6, 900);
  if (!tries.ok) return NextResponse.json({ error: "Too many tries. Please request a new code in a few minutes." }, { status: 429 });
  const code = typeof b.code === "string" ? b.code.replace(/\D/g, "") : "";
  if (!(await checkCode(row.contact_phone, code))) return NextResponse.json({ error: "That code didn't match. Try again." }, { status: 400 });
  await previewDb().from("app_previews").update({ phone_verified_at: new Date().toISOString() }).eq("id", row.id);
  return NextResponse.json({ ok: true, verified: true });
}
