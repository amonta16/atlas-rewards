import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, hashIp, EMAIL_RE, clean } from "@/lib/landing/notify";

/**
 * POST /api/landing/demo-request — CP-100
 * Stores a demo request (landing_demo_requests) and emails CONTACT_EMAIL.
 * Public, rate-limited (5 / 10 min per IP), honeypot-guarded.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "demo-request"), 5, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true }); // honeypot → pretend success

  const name = clean(body.name, 120);
  const business = clean(body.business, 160);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  if (!name || !business || !phone || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please fill in your name, business, email and phone." }, { status: 400 });
  }

  const row = {
    name,
    business,
    email,
    phone,
    industry: clean(body.industry, 80) || null,
    preferred_time: clean(body.preferred_time, 120) || null,
    notes: clean(body.notes, 1000) || null,
    source: clean(body.source, 60) || null,
    path: clean(body.path, 200) || null,
    slot_start: (() => { const v = clean(body.slot_start, 40); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; })(),
    timezone: clean(body.timezone, 64) || null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    ip_hash: await hashIp(req),
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("landing_demo_requests").insert(row).select("id").single();
  if (error) {
    console.error("[landing] demo-request insert failed", error);
    return NextResponse.json({ error: "Couldn't save your request — please email us directly." }, { status: 500 });
  }

  const sent = await notifyLead(`Demo booked — ${business}`, [
    ["Name", name],
    ["Business", business],
    ["Email", email],
    ["Phone", phone],
    ["Industry", row.industry],
    ["Requested slot", row.slot_start ? `${row.slot_start} (${row.timezone ?? "UTC"})` : null],
    ["Best time", row.preferred_time],
    ["Notes", row.notes],
    ["Source", row.source],
  ]);
  if (sent) await supabase.from("landing_demo_requests").update({ notified_at: new Date().toISOString() }).eq("id", data.id);

  return NextResponse.json({ ok: true });
}
