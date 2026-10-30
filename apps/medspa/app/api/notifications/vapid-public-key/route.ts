import { NextResponse } from "next/server";

/** VAPID public key for pushManager.subscribe(). Must be the SAME keys as the venue app (it sends the pushes). */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ key: process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "" });
}
