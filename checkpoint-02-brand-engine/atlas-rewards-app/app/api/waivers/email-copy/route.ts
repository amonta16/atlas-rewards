/**
 * POST /api/waivers/email-copy — CP-137
 *
 * Emails the signer their own copy of what they just signed. Called by the
 * signing screen, best effort: a failure here is logged and swallowed so it
 * can never cost someone a signature they already gave.
 *
 * Body: { submissionId: uuid }
 * The submission is read AS THE CALLER, so RLS ("the signer or staff") is
 * what decides whether they may have it — this route adds no new access.
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { sendMail, signedCopyText } from "@/lib/waiver-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "waiver-copy"), 10, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: { submissionId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const id = (body.submissionId ?? "").trim();
  if (!id) return NextResponse.json({ error: "submissionId required" }, { status: 400 });

  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("waiver_submissions")
    .select("signer_name, signer_email, consent_text, body_sha256, signed_at, minors, business_id, version_id")
    .eq("id", id)
    .single();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const to = (data.signer_email ?? user.email ?? "").trim();
  if (!to) return NextResponse.json({ ok: false, reason: "no address on file" });

  const [{ data: biz }, { data: version }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", data.business_id).single(),
    supabase.from("waiver_versions").select("version_no, body_text, waiver_id").eq("id", data.version_id).single(),
  ]);
  const { data: waiver } = version
    ? await supabase.from("business_waivers").select("title").eq("id", version.waiver_id).single()
    : { data: null as { title: string } | null };

  const sent = await sendMail(
    to,
    `Your signed waiver — ${biz?.name ?? "Atlas"}`,
    signedCopyText({
      businessName: biz?.name ?? "the business",
      waiverTitle: waiver?.title ?? "Waiver",
      versionNo: version?.version_no ?? 1,
      signerName: data.signer_name,
      signedAt: new Date(data.signed_at).toLocaleString("en-US"),
      consent: data.consent_text,
      minors: Array.isArray(data.minors) ? data.minors : [],
      bodyText: version?.body_text ?? "",
      sha256: data.body_sha256,
    }),
  );
  return NextResponse.json({ ok: sent });
}
