import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, hashIp, EMAIL_RE, clean } from "@/lib/landing/notify";
import { WAITLIST } from "@/lib/landing/config";

/**
 * /api/landing/waitlist — CP-100
 *   GET  → { count }            live, real count (landing_waitlist_count RPC)
 *   POST → { ok, count }        join; enforces WAITLIST.cap; dedupes by email
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function count(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("landing_waitlist_count");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function GET() {
  try {
    return NextResponse.json({ count: await count(), cap: WAITLIST.cap }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[landing] waitlist count failed", e);
    return NextResponse.json({ count: 0, cap: WAITLIST.cap, degraded: true });
  }
}

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "waitlist"), 5, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true });

  const email = clean(body.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });

  const supabase = createAdminClient();
  try {
    const current = await count();
    if (current >= WAITLIST.cap) {
      return NextResponse.json({ error: "The first group is full — email us and we'll add you to the next one.", count: current }, { status: 409 });
    }
    const { error } = await supabase.from("landing_waitlist").insert({
      email,
      agency: clean(body.agency, 160) || null,
      clients: clean(body.clients, 20) || null,
      ip_hash: await hashIp(req),
    });
    if (error && error.code !== "23505") throw error; // 23505 = already on the list → treat as success
    if (!error) {
      await notifyLead(`Agency waitlist signup — ${email}`, [
        ["Email", email],
        ["Agency", clean(body.agency, 160)],
        ["Clients", clean(body.clients, 20)],
      ]);
    }
    return NextResponse.json({ ok: true, count: await count() });
  } catch (e) {
    console.error("[landing] waitlist insert failed", e);
    return NextResponse.json({ error: "Couldn't save that — please try again." }, { status: 500 });
  }
}
