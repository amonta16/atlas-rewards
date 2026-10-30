/**
 * GET /api/notifications/vapid-public-key — CP-32
 *
 * Returns the VAPID public key the browser needs to call
 * pushManager.subscribe(). Sourced from process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
 * (also exposed to the browser via NEXT_PUBLIC_ prefix), but we serve
 * it from an endpoint so we can rotate keys without redeploying the
 * client.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key =
    process.env.VAPID_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    "";
  return NextResponse.json({ key });
}
