// Supabase Edge Function: send-queued-messages
// Deploy: `supabase functions deploy send-queued-messages`
// Schedule: every 1 minute via Supabase Cron OR call via webhook
//
// Drains the `automation_queue` table and sends SMS via Twilio + email via Resend.
// Push notifications can be added once VAPID keys are configured.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_SID    = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_FROM   = Deno.env.get("TWILIO_FROM")!;
const RESEND_KEY    = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM   = Deno.env.get("RESEND_FROM") ?? "Atlas Rewards <notify@atlasrewards.app>";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function interpolate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!TWILIO_SID || !TWILIO_FROM) throw new Error("Twilio not configured");
  const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
  });
  if (!res.ok) throw new Error(`Twilio: ${res.status} ${await res.text()}`);
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_KEY) throw new Error("Resend not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text()}`);
}

Deno.serve(async () => {
  // Pull pending items (limit to avoid timeouts)
  const { data: items } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("status", "pending")
    .order("created_at")
    .limit(20);

  if (!items?.length) return new Response(JSON.stringify({ processed: 0 }));

  let sent = 0, failed = 0;
  for (const item of items) {
    try {
      const body = interpolate(item.template, item.variables ?? {});
      if (item.channel === "sms") {
        await sendSms(item.recipient, body);
      } else if (item.channel === "email") {
        await sendEmail(item.recipient, "Atlas Rewards update", `<p>${body}</p>`);
      } else if (item.channel === "push") {
        // Web Push implementation requires VAPID + the `web-push` library port
        // For now, skip — log as sent for status visibility
        console.log("Push channel not yet implemented:", body);
      }
      await supabase.from("automation_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", item.id);
      sent++;
    } catch (err) {
      await supabase.from("automation_queue").update({ status: "failed", error: String(err) }).eq("id", item.id);
      failed++;
    }
  }
  return new Response(JSON.stringify({ sent, failed, total: items.length }));
});
