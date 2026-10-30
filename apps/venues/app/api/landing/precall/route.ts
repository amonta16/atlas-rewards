import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, clean } from "@/lib/landing/notify";

/**
 * POST /api/landing/precall — CP-201 · the pre-call page (/medspa/confirm/<token>) reports back.
 *   { token, action: "view" }               first open of the page
 *   { token, action: "video", pct: 25..100 } how far they got in the video
 *   { token, action: "confirm" }            "Yes, I'll be there" (emails Andrew once)
 * The token is the only key; it's unguessable and only ever sent to the prospect.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "precall"), 30, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const token = clean(b.token, 64);
  const action = clean(b.action, 12);
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const db = createAdminClient();
  const { data: r } = await db.from("landing_demo_requests")
    .select("id, name, business, slot_start, confirmed_at, video_pct, precall_viewed_at")
    .eq("confirm_token", token).maybeSingle();
  if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const now = new Date().toISOString();
  if (action === "view") {
    if (!r.precall_viewed_at) await db.from("landing_demo_requests").update({ precall_viewed_at: now }).eq("id", r.id);
  } else if (action === "video") {
    const pct = Math.max(0, Math.min(100, Math.round(Number(b.pct) || 0)));
    if (pct > (r.video_pct ?? 0)) await db.from("landing_demo_requests").update({ video_pct: pct }).eq("id", r.id);
  } else if (action === "confirm") {
    if (!r.confirmed_at) {
      await db.from("landing_demo_requests").update({ confirmed_at: now }).eq("id", r.id);
      await notifyLead(`Confirmed: ${r.business} will be on the call`, [
        ["Who", r.name],
        ["When", r.slot_start ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(r.slot_start)) + " PT" : null],
        ["Watched the video", `${r.video_pct ?? 0}%`],
      ]);
    }
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
