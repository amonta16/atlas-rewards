import { NextResponse } from "next/server";
import { runTick } from "@/lib/outreach/engine";

/**
 * GET /api/outreach/tick — CP-250 · Vercel Cron, every 5 minutes (vercel.json).
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel adds it to cron calls).
 * Reads the outreach inbox, reads new leads' sites, schedules follow-ups and sends at most one
 * email per run (lib/outreach/engine.ts). Nothing is sent unless OUTREACH_SEND=1.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runTick());
  } catch (e) {
    console.error("[outreach] tick failed", e);
    return NextResponse.json({ error: "tick failed" }, { status: 500 });
  }
}
