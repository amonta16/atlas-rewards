import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getFreeSlots, getBookedAppointments, type GhlConfig } from "@/lib/ghl/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/ghl/slots?business=<uuid>&day=YYYY-MM-DD&duration=<min>&tag=<uuid?>
 *
 * Returns: { open: string[], reserved: string[] }
 *   - open:     ISO timestamps the customer can pick
 *   - reserved: ISO timestamps where someone else is booked (shown greyed out)
 *
 * Why a server route instead of calling GHL from the browser:
 *   1. The GHL API key is private — we never expose it to the client.
 *   2. Mixing in the Supabase-side `bookings` table for additional reservations
 *      that haven't synced to GHL yet.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const businessId = params.get("business");
  const day        = params.get("day");
  const duration   = parseInt(params.get("duration") ?? "30", 10);
  // const tagId   = params.get("tag");  // reserved for future per-service GHL calendar mapping

  if (!businessId || !day) {
    return NextResponse.json({ error: "business + day required" }, { status: 400 });
  }

  // Service-role client — bypasses RLS to read ghl_api_key.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { data: biz, error } = await supabase
    .from("businesses")
    .select("id, ghl_location_id, ghl_calendar_id, ghl_api_key, booking_hours")
    .eq("id", businessId)
    .single();

  if (error || !biz) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  // If GHL isn't configured we shouldn't be here — but degrade gracefully.
  if (!biz.ghl_api_key || !biz.ghl_calendar_id || !biz.ghl_location_id) {
    return NextResponse.json({ error: "ghl not configured" }, { status: 409 });
  }

  const cfg: GhlConfig = {
    apiKey:     biz.ghl_api_key,
    locationId: biz.ghl_location_id,
    calendarId: biz.ghl_calendar_id,
  };

  try {
    const [openSlots, booked] = await Promise.all([
      getFreeSlots(cfg, day, duration),
      getBookedAppointments(cfg, day),
    ]);

    // Also include any in-flight reservations from our Supabase mirror that
    // haven't propagated to GHL yet (rare but possible during webhook lag).
    const { data: localBusy } = await supabase.rpc("list_busy_slots", {
      p_business_id: businessId, p_day: day,
    });

    const reservedSet = new Set<string>();
    for (const e of booked) reservedSet.add(new Date(e.startTime).toISOString());
    for (const r of (localBusy ?? []) as { slot_start: string }[]) {
      reservedSet.add(new Date(r.slot_start).toISOString());
    }

    // Open slots minus anything already booked (defensive).
    const openIso = openSlots
      .map(s => new Date(s).toISOString())
      .filter(s => !reservedSet.has(s));

    return NextResponse.json({
      open: openIso,
      reserved: Array.from(reservedSet),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "GHL request failed" }, { status: 502 });
  }
}
