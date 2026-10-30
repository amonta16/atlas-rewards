/**
 * POST /api/frontdesk/login — CP-49
 *
 * Front-desk PIN sign-in. No email, no password — the staffer taps a
 * 4-digit PIN on the branded keypad at /<slug>/frontdesk and this route
 * turns that into a real Supabase session.
 *
 * How a PIN becomes a session WITHOUT storing/altering a password:
 *   1. verify_front_desk_pin (service-role RPC) matches the PIN against
 *      the bcrypt hashes for this business and returns the auth user_id.
 *      CP-141: lockout is throttled per (business, source IP), not per
 *      business — a stranger failing PINs can no longer lock out the shop's
 *      own device, which had been a one-request-per-5-minutes DoS.
 *   2. admin.generateLink({ type:'magiclink' }) mints a one-time token
 *      for that user — it does NOT email anything (Admin API).
 *   3. The cookie-bound server client verifyOtp()s that token, which
 *      writes the session cookies. The staffer is now signed in as the
 *      hidden business_staff auth user, so every existing RLS policy
 *      keeps working unchanged.
 *
 * Body:    { slug: string, pin: string }
 * Returns: { ok: true, redirect: "/<slug>/manage" }
 *          { error, locked? } on failure (401 wrong PIN, 429 locked).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { slug?: string; pin?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid request" }, { status: 400 }); }

  const slug = (body.slug ?? "").trim().toLowerCase();
  const pin  = (body.pin ?? "").trim();
  if (!slug) return NextResponse.json({ error: "missing business" }, { status: 400 });
  if (!/^[0-9]{4}$/.test(pin)) {
    return NextResponse.json({ error: "Enter your 4-digit PIN" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the business.
  const { data: biz } = await admin
    .from("businesses").select("id, slug").eq("slug", slug).maybeSingle();
  if (!biz?.id) return NextResponse.json({ error: "business not found" }, { status: 404 });

  // CP-141: the throttle is keyed on (business, source IP), so the RPC needs
  // the caller's address. On Vercel the client IP is the FIRST entry of
  // x-forwarded-for — later entries are proxy hops and are attacker-writable,
  // so never read the whole header. Falls back to req.ip, then null (the RPC
  // buckets a missing IP as 'unknown' and behaves as it did before CP-141).
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.ip ||
    null;

  // Match the PIN (throttled inside the RPC).
  const { data: vRows, error: vErr } = await admin.rpc("verify_front_desk_pin", {
    p_business_id: biz.id,
    p_pin: pin,
    p_ip: ip,
  });
  if (vErr) {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable" }, { status: 500 });
  }
  const v = Array.isArray(vRows) ? vRows[0] : vRows;
  if (v?.locked) {
    return NextResponse.json(
      { error: "Too many wrong PINs. Try again in a few minutes.", locked: true },
      { status: 429 },
    );
  }
  if (!v?.ok || !v?.user_id) {
    return NextResponse.json({ error: "That PIN didn't match. Try again." }, { status: 401 });
  }

  // Look up the auth user's email so we can mint a magic-link token.
  const { data: userRes, error: uErr } = await admin.auth.admin.getUserById(v.user_id);
  const email = userRes?.user?.email;
  if (uErr || !email) {
    return NextResponse.json({ error: "Account not found for this PIN" }, { status: 500 });
  }

  // Mint a one-time token (no email is sent — Admin API).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: "Could not start a session" }, { status: 500 });
  }

  // Exchange the token for a session on the cookie-bound client.
  const server = createServer();
  const { error: otpErr } = await server.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (otpErr) {
    return NextResponse.json({ error: "Could not start a session" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, redirect: `/${slug}/manage` });
}
