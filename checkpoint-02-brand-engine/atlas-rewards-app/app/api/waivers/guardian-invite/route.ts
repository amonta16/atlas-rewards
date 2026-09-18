/**
 * POST /api/waivers/guardian-invite — CP-137
 *
 * Emails a parent or guardian the link that lets them sign for a minor.
 * The caller supplies only the token they just minted via
 * request_guardian_signature(); the destination address comes from the
 * stored row, never from the request body, so this cannot be used to mail
 * an arbitrary address.
 *
 * Body: { token: string }
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { sendMail, guardianInviteText } from "@/lib/waiver-mail";
import { businessUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "guardian-invite"), 5, 3600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: { token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const token = (body.token ?? "").trim();
  if (token.length < 16) return NextResponse.json({ error: "token required" }, { status: 400 });

  // Must be a signed-in member — the token alone is not a licence to send mail.
  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const admin = createAdminClient();
  const { data: reqRow, error } = await admin
    .from("waiver_guardian_requests")
    .select("guardian_email, minor_name, business_id, waiver_id, status, membership_id")
    .eq("token", token)
    .single();
  if (error || !reqRow) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (reqRow.status !== "pending") return NextResponse.json({ error: "already used" }, { status: 409 });

  // The request must belong to the caller.
  const { data: mem } = await admin
    .from("business_memberships")
    .select("user_id")
    .eq("id", reqRow.membership_id)
    .single();
  if (!mem || mem.user_id !== user.id) return NextResponse.json({ error: "not yours" }, { status: 403 });

  const [{ data: biz }, { data: waiver }] = await Promise.all([
    admin.from("businesses").select("name, slug").eq("id", reqRow.business_id).single(),
    admin.from("business_waivers").select("title").eq("id", reqRow.waiver_id).single(),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const link = businessUrl(rootDomain, { path: `/g/${token}` });

  const sent = await sendMail(
    reqRow.guardian_email,
    `Please sign ${biz?.name ?? "the"} waiver for ${reqRow.minor_name}`,
    guardianInviteText({
      businessName: biz?.name ?? "the business",
      minorName: reqRow.minor_name,
      waiverTitle: waiver?.title ?? "Waiver",
      link,
    }),
  );
  return NextResponse.json({ ok: sent });
}
