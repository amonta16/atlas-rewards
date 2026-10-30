/**
 * POST/GET /api/admin-app/daily-nudge — CP-63 Phase 2
 *
 * Delivers the day's motivational nudge to the door-sales crew:
 *   • inserts an admin_notifications row for every agency_admin (their bell)
 *   • fires a best-effort phone push to their subscribed devices
 *
 * Two callers:
 *   1. Vercel Cron (each morning) — authenticated by `Authorization: Bearer
 *      ${CRON_SECRET}`. Sends to the WHOLE team; respects nudges_enabled.
 *   2. The owner's "Send test to me" button (session cookie) — pass ?test=1
 *      to send only to yourself, ignoring the enabled flag.
 *
 * Picks the message for today's weekday (America/Los_Angeles) from
 * admin_app_config.nudge_<dow>.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOW = ["nudge_sun", "nudge_mon", "nudge_tue", "nudge_wed", "nudge_thu", "nudge_fri", "nudge_sat"] as const;

function weekdayKeyFor(tz = "America/Los_Angeles"): typeof DOW[number] {
  // Map the current date (in tz) to a weekday index 0=Sun..6=Sat.
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(new Date());
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return DOW[idx < 0 ? 0 : idx];
}

async function handle(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "1";

  const admin = createAdminClient();

  // ── Auth: cron secret, OR a signed-in owner/admin for the test button. ──
  const auth = req.headers.get("authorization") ?? "";
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;

  let testUserId: string | null = null;
  if (!cronOk) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    const { data: adminRows } = await supabase
      .from("business_users").select("role")
      .eq("user_id", user.id).eq("role", "agency_admin").limit(1);
    if (!adminRows || adminRows.length === 0) {
      return NextResponse.json({ error: "agency admins only" }, { status: 403 });
    }
    testUserId = user.id;
  }

  // ── Load config + today's message. ──
  const { data: cfg } = await admin
    .from("admin_app_config")
    .select("nudges_enabled, nudge_tz, nudge_hours, nudge_mon, nudge_tue, nudge_wed, nudge_thu, nudge_fri, nudge_sat, nudge_sun")
    .eq("id", 1)
    .maybeSingle();

  if (!cfg) return NextResponse.json({ error: "config missing" }, { status: 400 });

  const tz = (cfg as any).nudge_tz || "America/Los_Angeles";

  // The two Vercel crons (16:00 & 20:00 UTC ≈ 9am & 1pm PT) each fire once a
  // day, so we send on every cron invocation — no hour-gate needed. We just
  // respect the on/off switch. The test button bypasses that too.
  if (cronOk && !isTest && cfg.nudges_enabled === false) {
    return NextResponse.json({ ok: true, skipped: "nudges disabled" });
  }

  const key = weekdayKeyFor(tz);
  const message = ((cfg as any)[key] as string | null)?.trim();
  if (!message) return NextResponse.json({ ok: true, skipped: "no message for today" });

  // ── Recipients: just me (test) or every agency_admin (cron). ──
  let userIds: string[];
  if (isTest && testUserId) {
    userIds = [testUserId];
  } else {
    const { data: admins } = await admin
      .from("business_users").select("user_id").eq("role", "agency_admin");
    userIds = Array.from(new Set((admins ?? []).map((r: any) => r.user_id as string)));
  }
  if (userIds.length === 0) return NextResponse.json({ ok: true, recipients: 0, push_sent: 0 });

  // ── In-app bell rows. ──
  const rows = userIds.map(uid => ({
    user_id: uid,
    title: "Atlas Command",
    body: message,
    kind: "nudge",
    link_path: "/field",
  }));
  await admin.from("admin_notifications").insert(rows);

  // ── Phone push (best effort; null business tag = agency/global). ──
  let pushSent = 0;
  try {
    const res = await sendPushToUsers(
      userIds,
      { title: "Atlas Command", body: message, link_path: "/field", kind: "generic" },
      null,
    );
    pushSent = res.sent;
  } catch (e) {
    console.warn("[daily-nudge] push skipped:", (e as any)?.message);
  }

  return NextResponse.json({ ok: true, recipients: userIds.length, push_sent: pushSent, test: isTest });
}

export async function POST(req: Request) { return handle(req); }
export async function GET(req: Request)  { return handle(req); } // Vercel Cron uses GET
