/**
 * lib/landing/lead-nurture-send.ts — CP-238 · sends the lead-magnet follow-up emails
 * (server only). Called by /api/landing/reminders every 15 minutes.
 *
 * Who: app_previews with a contact email, opted in within the last 30 days, not
 * unsubscribed, not claimed. For each, the next step (nurture_step + 1) goes out once
 * contact_at + delay_hours has passed. A step switched off in the admin is skipped
 * (the owner moves on to the next one). An owner who is behind gets only the latest
 * email that's due, so turning sending on never sends a burst.
 *
 * Stops for good (nurture_stopped_at) when the owner booked a walkthrough or paid
 * (their landing_leads row), or the preview has expired. Stamps the row before
 * sending, like the rest of the funnel, so a retry can never double-send.
 * Sending only happens with LEAD_NURTURE_SEND=1; otherwise it reports what it would do.
 */
import { emailProspect } from "./notify";
import { SITE_ORIGIN } from "./medspa-funnel";
import { sign } from "./funnel-sign";
import { renderStep, type EmailStep } from "./lead-nurture";
import { deskUrl, previewDb, previewUrl } from "@/lib/preview/store";

const H = 3600_000;

export function unsubscribeUrl(previewId: string): string {
  return `${SITE_ORIGIN}/api/landing/unsubscribe?p=${previewId}&s=${sign(previewId, "unsubscribe")}`;
}

export async function loadSteps(): Promise<EmailStep[] | null> {
  const { data, error } = await previewDb().from("lead_email_steps").select("step, name, delay_hours, subject, preheader, body, enabled, updated_at").order("step");
  if (error) return null;
  return (data ?? []) as EmailStep[];
}

export async function runLeadNurture(now = Date.now()) {
  const out = { sent: 0, skipped: 0, stopped: 0, wouldSend: 0, live: process.env.LEAD_NURTURE_SEND === "1" };
  const steps = await loadSteps();
  if (!steps?.length) return out;
  const db = previewDb();
  const { data: rows, error } = await db.from("app_previews")
    .select("id, slug, business_name, contact_name, contact_email, contact_at, expires_at, status, nurture_step, landing_lead_id")
    .not("contact_at", "is", null).not("contact_email", "is", null)
    .is("nurture_unsubscribed_at", null).is("nurture_stopped_at", null).is("claimed_at", null)
    .lt("nurture_step", steps.length)
    .gte("contact_at", new Date(now - 30 * 24 * H).toISOString())
    .limit(200);
  if (error) { console.error("[nurture] query failed", error.message); return out; }
  if (!rows?.length) return out;

  // Who already booked or paid: their landing lead says so.
  const leadIds = rows.map((r) => r.landing_lead_id).filter(Boolean) as string[];
  const booked = new Set<string>();
  if (leadIds.length) {
    const { data: leads } = await db.from("landing_leads").select("id, demo_request_id, status").in("id", leadIds);
    for (const l of leads ?? []) if (l.demo_request_id || ["booked", "showed", "paid"].includes(String(l.status))) booked.add(String(l.id));
  }

  for (const r of rows) {
    const stopNow = (r.landing_lead_id && booked.has(String(r.landing_lead_id))) || Date.parse(r.expires_at as string) < now || r.status === "claimed";
    if (stopNow) {
      await db.from("app_previews").update({ nurture_stopped_at: new Date(now).toISOString() }).eq("id", r.id);
      out.stopped++;
      continue;
    }
    const n = Number(r.nurture_step ?? 0);
    const optedIn = Date.parse(r.contact_at as string);
    const due = (i: number) => !!steps[i] && now >= optedIn + steps[i].delay_hours * H;
    if (!due(n)) continue;
    // Catch-up: an owner who is behind (sending was off, or opted in before CP-238) gets only
    // the latest email that's due, never a burst of 2–3 in a row. Switched-off steps are passed over.
    let last = n;
    while (due(last + 1)) last++;
    let pick = -1;
    for (let i = last; i >= n; i--) if (steps[i].enabled) { pick = i; break; }
    if (pick < 0) { await db.from("app_previews").update({ nurture_step: last + 1 }).eq("id", r.id).eq("nurture_step", n); out.skipped += last + 1 - n; continue; }
    const step = steps[pick];
    out.skipped += last - n;
    if (!out.live) { out.wouldSend++; continue; }

    // Stamp first (only if nobody else did), then send.
    const { data: claimed } = await db.from("app_previews").update({ nurture_step: last + 1, nurture_last_at: new Date(now).toISOString() }).eq("id", r.id).eq("nurture_step", n).select("id");
    if (!claimed?.length) continue;
    const unsub = unsubscribeUrl(String(r.id));
    const mail = renderStep(step, {
      // Audit step 3: the gate asks email + zip only, so most owners have no name. Their spa's name
      // reads better than "there" ("Glow Aesthetics, saw you clicking around").
      first_name: String(r.contact_name ?? "").trim().split(/\s+/)[0] || String(r.business_name),
      spa_name: String(r.business_name),
      app_link: previewUrl(String(r.slug)),
      desk_link: deskUrl(String(r.slug)),
      walkthrough_link: `${SITE_ORIGIN}/medspa/walkthrough/${r.slug}`,
      expires_on: new Date(r.expires_at as string).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" }),
    }, { unsubscribeUrl: unsub, postalAddress: process.env.MAIL_POSTAL_ADDRESS ?? null });
    await emailProspect(String(r.contact_email), mail.subject, mail.text, mail.html, {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    out.sent++;
  }
  return out;
}
