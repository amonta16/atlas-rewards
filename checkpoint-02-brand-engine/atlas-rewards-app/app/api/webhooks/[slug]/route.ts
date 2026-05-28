import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

/**
 * Inbound webhook endpoint.
 * URL: /api/webhooks/<business-slug>
 * Method: POST
 *
 * Headers:
 *   Content-Type: application/json
 *   X-Atlas-Signature: hmac-sha256(business.webhook_secret, raw_body) — hex encoded
 *
 * Body:
 *   {
 *     "event_type": "purchase" | "review" | "referral" | "visit" | "birthday" | ...
 *     "member": { "email": "...", "phone": "...", "code": "ABC123" },
 *     "amount_cents": 4250,           // optional, for purchase
 *     "idempotency_key": "..."        // optional, prevents double-award on retries
 *   }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-atlas-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }

  // Server-side Supabase client using the service role key (bypasses RLS for lookups)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  // Look up the business + its secret
  const { data: biz, error: bizErr } = await supabase
    .from("businesses")
    .select("id, slug, webhook_secret")
    .eq("slug", params.slug)
    .single();
  if (bizErr || !biz) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  // Verify HMAC
  const expected = crypto
    .createHmac("sha256", biz.webhook_secret)
    .update(rawBody)
    .digest("hex");

  // Constant-time compare
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Parse payload
  let body: any;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const eventType = String(body.event_type ?? "");
  const member    = body.member ?? {};

  if (!eventType) {
    return NextResponse.json({ error: "event_type required" }, { status: 400 });
  }
  if (!member.email && !member.code) {
    return NextResponse.json({ error: "member.email or member.code required" }, { status: 400 });
  }

  // Dispatch to the SQL function
  const { data, error } = await supabase.rpc("inbound_webhook_award", {
    p_business_id:     biz.id,
    p_member_email:    member.email   ?? null,
    p_member_code:     member.code    ?? null,
    p_rule_type:       eventType,
    p_amount_cents:    body.amount_cents ?? null,
    p_idempotency_key: body.idempotency_key ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function GET() {
  return NextResponse.json({
    error: "Use POST. See documentation for body format.",
  }, { status: 405 });
}
