/**
 * lib/landing/lead-sequence-run.ts — lead-magnet audit, step 6 · runs the follow-up sequence
 * (server only). Called by /api/landing/reminders every 5 minutes.
 *
 * Who: previews unlocked (contact_at) in the last 30 days that aren't stopped. For each, planStep()
 * decides; this does the I/O and writes one lead_sequence_log row per step, so Admin → Lead funnel
 * shows every lead's follow-through: sent, would send (sending off), skipped and why, call tasks and
 * their outcomes, cancelled.
 *
 * Sending switches (both off by default, so deploying sends nothing):
 *   LEAD_NURTURE_SEND=1   emails (same switch as CP-238)
 *   PREVIEW_SMS_SEND=1    texts (+ the Twilio settings in lib/preview/twilio-sms.ts)
 * Call tasks are always created: they're for Andrew, not the owner.
 *
 * Returns null when CP-243 isn't applied, and the caller runs the old email-only sequence instead.
 */
import { emailProspect, notifyLead } from "./notify";
import { SITE_ORIGIN } from "./medspa-funnel";
import { renderStep } from "./lead-nurture";
import { unsubscribeUrl } from "./lead-nurture-send";
import { CHANNEL_LABEL, fill, planStep, valuesFor, type SeqStep } from "./lead-sequence";
import { previewDb, previewUrl } from "@/lib/preview/store";
import { verifiedDeskUrl } from "@/lib/preview/verify-link";
import { sendSms, smsSendEnabled } from "@/lib/preview/twilio-sms";

const DAY = 86_400_000;
const STEP_COLS = "step, channel, name, delay_minutes, subject, preheader, body, enabled, updated_at";

export async function loadSequence(): Promise<SeqStep[] | null> {
  const { data, error } = await previewDb().from("lead_sequence_steps").select(STEP_COLS).order("step");
  if (error) return null;
  return (data ?? []) as SeqStep[];
}

type Row = {
  id: string; slug: string; business_name: string; phone: string | null; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; contact_marketing_consent_at: string | null; contact_at: string; expires_at: string; status: string;
  seq_step: number; sms_stopped_at: string | null; nurture_unsubscribed_at: string | null; landing_lead_id: string | null;
  treatments: Array<{ price_cents?: number | null }> | null; treatments_are_examples: boolean;
};
const ROW_COLS = "id, slug, business_name, phone, contact_name, contact_email, contact_phone, contact_marketing_consent_at, contact_at, expires_at, status, seq_step, sms_stopped_at, nurture_unsubscribed_at, landing_lead_id, treatments, treatments_are_examples";

/** Booking or paying (or Andrew) ends a lead's sequence: every step left is logged as cancelled, open call tasks too. */
export async function cancelSequence(previewId: string, reason: string, steps?: SeqStep[] | null): Promise<void> {
  const db = previewDb();
  const all = steps ?? (await loadSequence());
  const { data: row } = await db.from("app_previews").select("seq_step, contact_at").eq("id", previewId).maybeSingle();
  const nowIso = new Date().toISOString();
  await db.from("app_previews").update({ nurture_stopped_at: nowIso, seq_stopped_reason: reason.slice(0, 60) }).eq("id", previewId).is("nurture_stopped_at", null);
  await db.from("lead_sequence_log").update({ status: "cancelled", reason: `cancelled: ${reason}`, done_at: nowIso }).eq("preview_id", previewId).eq("status", "task_open");
  if (!all?.length || !row) return;
  const from = Number((row as { seq_step: number }).seq_step ?? 0);
  const t0 = Date.parse(String((row as { contact_at: string }).contact_at));
  const rest = all.slice(from).map((s) => ({ preview_id: previewId, step: s.step, channel: s.channel, status: "cancelled", reason: `cancelled: ${reason}`, due_at: new Date(t0 + s.delay_minutes * 60_000).toISOString() }));
  if (rest.length) await db.from("lead_sequence_log").upsert(rest, { onConflict: "preview_id,step", ignoreDuplicates: true });
  await db.from("app_previews").update({ seq_step: all.length }).eq("id", previewId);
}

export async function runLeadSequence(now = Date.now()) {
  const steps = await loadSequence();
  if (steps === null) return null;
  const out = { sent: 0, wouldSend: 0, tasks: 0, skipped: 0, cancelled: 0, failed: 0, emailLive: process.env.LEAD_NURTURE_SEND === "1", smsLive: smsSendEnabled() };
  if (!steps.length) return out;
  const db = previewDb();
  const { data, error } = await db.from("app_previews").select(ROW_COLS)
    .not("contact_at", "is", null).is("nurture_stopped_at", null)
    .lt("seq_step", steps.length)
    .gte("contact_at", new Date(now - 30 * DAY).toISOString())
    .limit(300);
  if (error) { console.error("[sequence] query failed", error.message); return out; }
  const rows = (data ?? []) as Row[];
  if (!rows.length) return out;

  // Booked a walkthrough, paid, or marked not a fit: their landing lead says so.
  const leadIds = rows.map((r) => r.landing_lead_id).filter(Boolean) as string[];
  const ended = new Map<string, string>();
  for (let i = 0; i < leadIds.length; i += 300) {
    const { data: leads } = await db.from("landing_leads").select("id, demo_request_id, status").in("id", leadIds.slice(i, i + 300));
    for (const l of (leads ?? []) as { id: string; demo_request_id: string | null; status: string }[]) {
      const why = l.status === "paid" ? "paid" : l.demo_request_id || ["booked", "showed", "no_show"].includes(l.status) ? "booked" : l.status === "lost" ? "not a fit" : null;
      if (why) ended.set(l.id, why);
    }
  }

  for (const r of rows) {
    const stoppedReason = (r.landing_lead_id && ended.get(r.landing_lead_id)) || null;
    const plan = planStep(steps, {
      optedInAt: Date.parse(r.contact_at), next: Number(r.seq_step ?? 0),
      email: !!r.contact_email && !r.nurture_unsubscribed_at,
      smsOk: !!r.contact_phone && !!r.contact_marketing_consent_at,
      smsStopped: !!r.sms_stopped_at,
      callPhone: !!(r.contact_phone || r.phone),
      stoppedReason,
    }, now);
    if (plan.kind === "wait") continue;
    if (plan.kind === "stop") { await cancelSequence(r.id, plan.reason, steps); out.cancelled++; continue; }

    // Claim this run of steps first (only if nobody else did), so a retry can never double-send.
    const n = Number(r.seq_step ?? 0);
    const { data: claimed } = await db.from("app_previews").update({ seq_step: plan.index + 1, nurture_last_at: new Date(now).toISOString() }).eq("id", r.id).eq("seq_step", n).select("id");
    if (!claimed?.length) continue;

    const dueAt = (i: number) => new Date(Date.parse(r.contact_at) + steps[i].delay_minutes * 60_000).toISOString();
    const log = (i: number, status: string, extra: Record<string, unknown> = {}) =>
      db.from("lead_sequence_log").upsert({ preview_id: r.id, step: steps[i].step, channel: steps[i].channel, status, due_at: dueAt(i), ...extra }, { onConflict: "preview_id,step", ignoreDuplicates: true });

    for (const i of plan.passed) {
      await log(i, "skipped", { reason: steps[i].enabled ? "passed over: a later step was already due" : "switched off" });
      out.skipped++;
    }
    const st = steps[plan.index];
    if (plan.action === "skip") { await log(plan.index, "skipped", { reason: plan.reason ?? null }); out.skipped++; continue; }

    const v = valuesFor(r, {
      app: previewUrl(r.slug),
      desk: verifiedDeskUrl(r.slug, r.contact_email),
      walkthrough: `${SITE_ORIGIN}/medspa/walkthrough/${r.slug}`,
    });

    if (plan.action === "task") {
      const phone = r.contact_phone ?? r.phone;
      await log(plan.index, "task_open", { reason: r.contact_phone ? "owner's mobile" : "business phone (from Google)" });
      await notifyLead(`Call task: ${r.business_name} (${st.name})`, [
        ["Call", phone ? `tel:${phone}` : null],
        ["Whose number", r.contact_phone ? "the owner's mobile" : "the business line (from Google)"],
        ["Script", fill(st.body, v)],
        ["Their app", previewUrl(r.slug)],
        ["Log the outcome", `${SITE_ORIGIN}/agency/lead-funnel?tab=follow`],
      ]).catch(() => false);
      out.tasks++;
      continue;
    }

    if (st.channel === "email") {
      if (!out.emailLive) { await log(plan.index, "would_send", { reason: "emails are off (LEAD_NURTURE_SEND)" }); out.wouldSend++; continue; }
      const unsub = unsubscribeUrl(r.id);
      const mail = renderStep({ subject: st.subject ?? st.name, preheader: st.preheader, body: st.body }, v, { unsubscribeUrl: unsub, postalAddress: process.env.MAIL_POSTAL_ADDRESS ?? null });
      const ok = await emailProspect(String(r.contact_email), mail.subject, mail.text, mail.html, { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
      await log(plan.index, ok ? "sent" : "failed", ok ? {} : { reason: "the email service didn't take it" });
      if (ok) out.sent++; else out.failed++;
      continue;
    }

    // sms
    if (!out.smsLive) { await log(plan.index, "would_send", { reason: "texts are off (PREVIEW_SMS_SEND)" }); out.wouldSend++; continue; }
    const ok = await sendSms(String(r.contact_phone), fill(st.body, v));
    await log(plan.index, ok ? "sent" : "failed", ok ? {} : { reason: "Twilio didn't take it" });
    if (ok) out.sent++; else out.failed++;
  }
  return out;
}

/** For the admin: "Text · First text" etc. */
export const stepLabel = (s: Pick<SeqStep, "channel" | "name">) => `${CHANNEL_LABEL[s.channel]} · ${s.name}`;
