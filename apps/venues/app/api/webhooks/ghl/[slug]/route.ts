import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/ghl/<business-slug>
 *
 * Inbound from GHL — fires when an appointment is created / updated / cancelled
 * directly inside GHL (e.g. a manager moves it on the GHL calendar). Keeps
 * the Supabase mirror in sync.
 *
 * Auth: HMAC-SHA256 of the raw body using business.webhook_secret, sent
 * as X-Atlas-Signature (we reuse the existing per-business secret so the
 * agency can configure one secret across all webhook traffic). If you'd
 * rather use GHL's native signature header, swap the header name + secret
 * source below — the verification math is identical.
 *
 * Event types we handle:
 *   • AppointmentCreate
 *   • AppointmentUpdate
 *   • AppointmentDelete
 *
 * Status normalization:
 *   GHL "confirmed" -> "confirmed"
 *   GHL "cancelled" -> "cancelled"
 *   GHL "noshow"    -> "no_show"
 *   GHL "showed"    -> "completed"
 *   anything else   -> "pending"
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const rawBody  = await req.text();
  const signature = req.headers.get("x-atlas-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }

  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  // Look up the business + secret
  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, slug, webhook_secret")
    .eq("slug", params.slug)
    .single();

  if (bizErr || !biz) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  // Verify HMAC
  const expected = crypto.createHmac("sha256", biz.webhook_secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Parse body
  let body: any;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const ghlEventType = String(body.type ?? body.event ?? "");
  const appt = body.appointment ?? body;

  if (!appt?.id) {
    return NextResponse.json({ error: "appointment.id required" }, { status: 400 });
  }

  // Resolve duration in minutes from start/end if present, else fall back to 30.
  const startIso = appt.startTime ?? appt.start_time ?? appt.scheduled_at;
  const endIso   = appt.endTime   ?? appt.end_time;
  let duration = appt.duration ?? appt.duration_minutes;
  if (!duration && startIso && endIso) {
    duration = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000));
  }
  duration = duration ?? 30;

  // Normalize status
  const rawStatus = String(appt.appointmentStatus ?? appt.status ?? "").toLowerCase();
  let status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show" = "pending";
  if (ghlEventType.toLowerCase().includes("delete")) {
    status = "cancelled";
  } else if (rawStatus === "confirmed") {
    status = "confirmed";
  } else if (rawStatus === "cancelled") {
    status = "cancelled";
  } else if (rawStatus === "noshow" || rawStatus === "no_show") {
    status = "no_show";
  } else if (rawStatus === "showed" || rawStatus === "completed") {
    status = "completed";
  }

  // Try to map back to our tag by name (best-effort).
  let tagId: string | null = null;
  let tagName = appt.title ?? "Booking";
  if (appt.title) {
    const titleService = String(appt.title).split("·")[0].trim();
    if (titleService) {
      tagName = titleService;
      const { data: tag } = await admin
        .from("booking_tags")
        .select("id")
        .eq("business_id", biz.id)
        .eq("name", titleService)
        .maybeSingle();
      if (tag?.id) tagId = tag.id;
    }
  }

  // Contact info
  const contact = appt.contact ?? {};
  const customerName =
    contact.name ??
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ??
    null;

  const { error: mErr } = await admin.rpc("mirror_ghl_booking", {
    p_business_id:       biz.id,
    p_ghl_event_id:      String(appt.id),
    p_tag_id:            tagId,
    p_tag_name:          tagName,
    p_duration_minutes:  duration,
    p_scheduled_at:      startIso,
    p_customer_name:     customerName,
    p_customer_phone:    contact.phone ?? null,
    p_customer_email:    contact.email ?? null,
    p_status:            status,
    p_notes:             appt.notes ?? null,
  });

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ error: "POST only" }, { status: 405 });
}
