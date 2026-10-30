/**
 * POST /api/waivers/kiosk-sign — CP-142
 *
 * The only write path for the front-desk tablet. The browser is anonymous
 * here, so this route is the trust boundary:
 *   · rate limited per client, because a public write endpoint on a tablet
 *     in a lobby is exactly the thing that gets hammered;
 *   · the service role lives here, never in the page;
 *   · every field is validated AGAIN in sign_waiver_kiosk(), so a crafted
 *     request gets the same refusals the form gives.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  businessId?: string; waiverId?: string; versionId?: string;
  name?: string; dob?: string; email?: string; phone?: string;
  signatureDataUrl?: string | null; signatureTyped?: string | null;
  consentText?: string;
  minors?: Array<{ first?: string; last?: string; dob?: string }>;
};

export async function POST(req: Request) {
  // 20/hour: a busy Saturday at a batting cage is nowhere near this, and a
  // script is well past it.
  const rl = await rateLimit(clientKey(req, "kiosk-sign"), 20, 3600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }

  const { businessId, waiverId, versionId } = body;
  if (!businessId || !waiverId || !versionId) {
    return NextResponse.json({ error: "missing waiver" }, { status: 400 });
  }

  const minors = Array.isArray(body.minors)
    ? body.minors
        .map(m => ({
          first: (m.first ?? "").trim(),
          last: (m.last ?? "").trim(),
          dob: (m.dob ?? "").trim() || null,
        }))
        .filter(m => m.first.length > 0 || m.last.length > 0)
    : [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("sign_waiver_kiosk", {
    p_business_id: businessId,
    p_waiver_id: waiverId,
    p_version_id: versionId,
    p_signer_name: (body.name ?? "").trim(),
    p_signer_dob: (body.dob ?? "").trim() || null,
    p_signature_data_url: body.signatureDataUrl ?? null,
    p_signature_typed: (body.signatureTyped ?? "").trim() || null,
    p_consent_text: (body.consentText ?? "").trim(),
    p_signer_email: (body.email ?? "").trim() || null,
    p_signer_phone: (body.phone ?? "").trim() || null,
    p_minors: minors,
    p_user_agent: req.headers.get("user-agent"),
  });

  if (error) {
    // The database's messages are already written for a person to read
    // ("please enter your date of birth"), so pass them straight through.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, submissionId: data });
}
