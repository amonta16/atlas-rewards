import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { clean, emailProspect } from "@/lib/landing/notify";
import { renderStep, SAMPLE_VALUES } from "@/lib/landing/lead-nurture";
import { OUTCOMES, type Channel } from "@/lib/landing/lead-sequence";
import { cancelSequence } from "@/lib/landing/lead-sequence-run";
import { previewDb } from "@/lib/preview/store";

/**
 * /api/agency/lead-sequence — lead-magnet audit, step 6 · Admin → Lead funnel (agency_admin only).
 *   PUT  { step, channel, name, delay_minutes, subject?, preheader?, body, enabled }   save one step
 *   POST { action: "test", subject, preheader, body }                                  email it to me (sample values)
 *   POST { action: "outcome", log_id, outcome, note? }                                 close a call task;
 *        "booked" / "not_a_fit" also end that lead's sequence
 *   POST { action: "stop", preview_id }                                                end a lead's sequence by hand
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f-]{36}$/i;

async function admin(): Promise<{ id: string; email: string | null } | null> {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await server.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  return data?.length ? { id: user.id, email: user.email ?? null } : null;
}

function parse(b: Record<string, unknown>) {
  const step = Number(b.step);
  const channel = (["email", "sms", "call"] as const).find((c) => c === b.channel) as Channel | undefined;
  const delay = Math.round(Number(b.delay_minutes));
  const body = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").slice(0, channel === "sms" ? 600 : 6000) : "";
  const row = {
    step, channel, name: clean(b.name, 60), delay_minutes: delay,
    subject: channel === "email" ? clean(b.subject, 160) : null,
    preheader: channel === "email" ? clean(b.preheader, 160) || null : null,
    body, enabled: b.enabled !== false,
  };
  if (!Number.isInteger(step) || step < 1 || step > 30) return { error: "Bad step." };
  if (!channel) return { error: "Pick email, text or call." };
  if (!row.name || !row.body.trim() || (channel === "email" && !row.subject)) return { error: channel === "email" ? "Name, subject and message are all needed." : "Name and message are both needed." };
  if (!Number.isFinite(delay) || delay < 1 || delay > 43_200) return { error: "Timing must be between 1 minute and 30 days." };
  if (channel === "sms" && !/stop/i.test(row.body)) return { error: "Texts need an opt-out line, e.g. \"Reply STOP to opt out.\"" };
  return { row };
}

export async function PUT(req: Request) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const p = parse((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const { error } = await previewDb().from("lead_sequence_steps").upsert({ ...p.row, updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: "step" });
  if (error) return NextResponse.json({ error: `Couldn't save: ${error.message}. Has the CP-243 SQL been applied?` }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = previewDb();

  if (b.action === "test") {
    if (!me.email) return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });
    const body = typeof b.body === "string" ? b.body.slice(0, 6000) : "";
    const subject = clean(b.subject, 160);
    if (!subject || !body.trim()) return NextResponse.json({ error: "Write a subject and message first." }, { status: 400 });
    const mail = renderStep({ subject: `[Test] ${subject}`, preheader: clean(b.preheader, 160) || null, body }, SAMPLE_VALUES, { unsubscribeUrl: "https://www.atlas-engine.app/api/landing/unsubscribe", postalAddress: process.env.MAIL_POSTAL_ADDRESS ?? null });
    const ok = await emailProspect(me.email, mail.subject, mail.text, mail.html);
    return ok ? NextResponse.json({ ok: true, to: me.email }) : NextResponse.json({ error: "The email service didn't take it (is RESEND_API_KEY set?)." }, { status: 502 });
  }

  if (b.action === "outcome") {
    const id = typeof b.log_id === "string" && UUID.test(b.log_id) ? b.log_id : null;
    const outcome = OUTCOMES.find((o) => o.id === b.outcome)?.id;
    if (!id || !outcome) return NextResponse.json({ error: "Pick an outcome." }, { status: 400 });
    const { data: row, error } = await db.from("lead_sequence_log")
      .update({ status: "task_done", outcome, note: clean(b.note, 1000) || null, done_at: new Date().toISOString(), done_by: me.id })
      .eq("id", id).eq("status", "task_open").select("preview_id").maybeSingle();
    if (error) return NextResponse.json({ error: `Couldn't save: ${error.message}` }, { status: 500 });
    if (!row) return NextResponse.json({ error: "That task is already closed." }, { status: 409 });
    if (outcome === "booked" || outcome === "not_a_fit") await cancelSequence(String(row.preview_id), outcome === "booked" ? "booked (on the call)" : "not a fit (on the call)");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "stop") {
    const id = typeof b.preview_id === "string" && UUID.test(b.preview_id) ? b.preview_id : null;
    if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    await cancelSequence(id, "stopped by admin");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
