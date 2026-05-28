import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAppointment, type GhlConfig } from "@/lib/ghl/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/ghl/book
 *
 * Body:
 *   {
 *     "business_id": "<uuid>",
 *     "tag_id":       "<uuid>" | null,
 *     "scheduled_at": "<iso>",
 *     "duration":     <minutes>,
 *     "name":         "...",
 *     "phone":        "...",
 *     "notes":        "..."
 *   }
 *
 * Two-step write:
 *   1. Create the appointment in GHL (source of truth for the calendar).
 *   2. Mirror it into our Supabase `bookings` table so manager dashboards,
 *      points triggers, and the customer's history still work.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as any;
  if (!body?.business_id || !body?.scheduled_at || !body?.duration) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }

  // 1) Resolve business + GHL config (service role, since the customer may
  //    not even be signed in for guest bookings).
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { data: biz, error: bizErr } = await admin
    .from("businesses")
    .select("id, name, ghl_location_id, ghl_calendar_id, ghl_api_key")
    .eq("id", body.business_id)
    .single();

  if (bizErr || !biz) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }
  if (!biz.ghl_api_key || !biz.ghl_calendar_id || !biz.ghl_location_id) {
    return NextResponse.json({ error: "ghl not configured" }, { status: 409 });
  }

  // 2) Resolve tag (for title + duration sanity).
  let tagName = "Booking";
  if (body.tag_id) {
    const { data: tag } = await admin
      .from("booking_tags")
      .select("name")
      .eq("id", body.tag_id)
      .eq("business_id", biz.id)
      .single();
    if (tag) tagName = tag.name;
  } else if (body.notes?.startsWith("Other:")) {
    tagName = "Other";
  }

  const cfg: GhlConfig = {
    apiKey:     biz.ghl_api_key,
    locationId: biz.ghl_location_id,
    calendarId: biz.ghl_calendar_id,
  };

  // 3) Push to GHL first — if GHL rejects (slot taken, validation), we
  //    haven't written anything locally yet.
  let ghlResult;
  try {
    ghlResult = await createAppointment(cfg, {
      startTimeIso:    body.scheduled_at,
      durationMinutes: body.duration,
      title:           `${tagName} · ${body.name ?? "Guest"}`,
      name:            body.name ?? null,
      phone:           body.phone ?? null,
      email:           null,
      notes:           body.notes ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "GHL booking failed" }, { status: 502 });
  }

  // 4) Mirror locally. The customer may be authed — use cookie-bound client
  //    so the booking is linked to their membership when possible.
  const cookieStore = cookies();
  const auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options?: any }[]) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch { /* server-component context — ok to ignore */ }
        },
      },
    },
  );

  const { data: mirrorId, error: mErr } = await admin.rpc("mirror_ghl_booking", {
    p_business_id:       biz.id,
    p_ghl_event_id:      ghlResult.id,
    p_tag_id:            body.tag_id ?? null,
    p_tag_name:          tagName,
    p_duration_minutes:  body.duration,
    p_scheduled_at:      body.scheduled_at,
    p_customer_name:     body.name ?? null,
    p_customer_phone:    body.phone ?? null,
    p_customer_email:    null,
    p_status:            "confirmed",
    p_notes:             body.notes ?? null,
  });

  if (mErr) {
    // GHL has the booking but mirror failed — log + still 200 so the customer
    // doesn't get a confusing "you're booked twice" experience. The webhook
    // path will reconcile on the next inbound.
    console.error("mirror_ghl_booking failed:", mErr.message);
  }

  // Confirm any authed session so we can link membership in a follow-up step.
  await auth.auth.getUser().catch(() => null);

  return NextResponse.json({
    ok: true,
    ghl_event_id: ghlResult.id,
    booking_id: mirrorId ?? null,
  });
}
