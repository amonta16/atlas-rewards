/**
 * POST /api/notifications/test — DEACTIVATED (CP-43)
 *
 * The test-notification feature was removed at Andrew's request. Real
 * automated notifications now fire through the same proven sendPush path
 * at their actual trigger points (reward unlocked, offer featured, manual
 * win-back) instead of needing a manual test surface.
 *
 * Left as a 410 Gone so any stale client fails loudly instead of hitting
 * dead code.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "The test-notification endpoint was removed in CP-43." },
    { status: 410 },
  );
}
