import { NextResponse } from "next/server";
import { calendarConfigured, getBusy } from "@/lib/google-calendar";
import { BOOKING_WINDOW_DAYS, CALL_MINUTES, HOST_TZ, openSlots } from "@/lib/landing/availability";

/**
 * GET /api/landing/availability — CP-189
 * Open demo slots for the next BOOKING_WINDOW_DAYS: WEEKLY_HOURS minus
 * Andrew's Google Calendar free/busy. `live: false` means the calendar
 * isn't configured yet (slots are WEEKLY_HOURS only, nothing subtracted) —
 * bookings still save and email him, but nothing lands on his calendar.
 * Cached 60s at the edge so an ad spike doesn't hammer Google.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  let live = false;
  let busy: { start: number; end: number }[] = [];
  if (calendarConfigured()) {
    try {
      busy = await getBusy(now, new Date(now.getTime() + (BOOKING_WINDOW_DAYS + 1) * 86400000));
      live = true;
    } catch (e) {
      console.error("[availability] freeBusy failed", e);
    }
  }
  const slots = openSlots(busy, now).map((d) => d.toISOString());
  return NextResponse.json({ live, tz: HOST_TZ, minutes: CALL_MINUTES, slots }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } });
}
