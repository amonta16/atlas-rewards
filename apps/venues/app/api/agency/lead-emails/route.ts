import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { clean, emailProspect } from "@/lib/landing/notify";
import { renderStep, SAMPLE_VALUES } from "@/lib/landing/lead-nurture";
import { previewDb } from "@/lib/preview/store";

/**
 * /api/agency/lead-emails — CP-238 · edit the lead-magnet follow-up emails (agency_admin only).
 *   PUT  { step, name, delay_hours, subject, preheader, body, enabled }  → saves one step
 *   POST { action: "test", subject, preheader, body }                    → sends it to me, with sample values
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function admin(): Promise<{ id: string; email: string | null } | null> {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return null;
  const { data } = await server.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  return data?.length ? { id: user.id, email: user.email ?? null } : null;
}

function parse(b: Record<string, unknown>) {
  const step = Number(b.step);
  const delay = Math.round(Number(b.delay_hours));
  const out = {
    step, name: clean(b.name, 60), delay_hours: delay, subject: clean(b.subject, 160),
    preheader: clean(b.preheader, 160) || null, body: typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").slice(0, 6000) : "",
    enabled: b.enabled !== false,
  };
  if (!Number.isInteger(step) || step < 1 || step > 10) return { error: "Bad step." };
  if (!out.name || !out.subject || !out.body.trim()) return { error: "Name, subject and message are all needed." };
  if (!Number.isFinite(delay) || delay < 1 || delay > 2160) return { error: "Timing must be between 1 hour and 90 days." };
  return { row: out };
}

export async function PUT(req: Request) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const p = parse((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const { error } = await previewDb().from("lead_email_steps").upsert({ ...p.row, updated_at: new Date().toISOString(), updated_by: me.id }, { onConflict: "step" });
  if (error) return NextResponse.json({ error: `Couldn't save: ${error.message}. Has the CP-238 SQL been applied?` }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (!me.email) return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action !== "test") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const body = typeof b.body === "string" ? b.body.slice(0, 6000) : "";
  const subject = clean(b.subject, 160);
  if (!subject || !body.trim()) return NextResponse.json({ error: "Write a subject and message first." }, { status: 400 });
  const mail = renderStep({ subject: `[Test] ${subject}`, preheader: clean(b.preheader, 160) || null, body }, SAMPLE_VALUES, { unsubscribeUrl: "https://www.atlas-engine.app/api/landing/unsubscribe", postalAddress: process.env.MAIL_POSTAL_ADDRESS ?? null });
  const ok = await emailProspect(me.email, mail.subject, mail.text, mail.html);
  return ok ? NextResponse.json({ ok: true, to: me.email }) : NextResponse.json({ error: "The email service didn't take it (is RESEND_API_KEY set?)." }, { status: 502 });
}
