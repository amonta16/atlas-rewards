/**
 * lib/booking-alerts.ts — CP-247 · "you have a new booking" email to the owner
 *
 * Built by /api/bookings/owner-alerts from a row claimed out of the
 * claim_booking_owner_alerts() queue. Branded HTML (the business's logo and
 * colour, same house style as lib/automations/email-template.ts) plus a
 * plain-text twin for clients that don't show HTML. Phone and email are
 * tap-to-call / tap-to-reply on a phone, and Reply-To is the customer when
 * they gave an email, so the owner can just hit Reply.
 * Pure function: no fetching, inline styles only (email clients strip <style>).
 */

export type OwnerAlertRow = {
  booking_id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  timezone: string | null;
  logo_url: string | null;
  brand_primary: string | null;
  emails: string[];
  resource_name: string;
  scheduled_at: string;
  duration_minutes: number | null;
  party_size: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  source: string | null;
  status: string | null;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.atlas-engine.app").replace(/\/$/, "");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeHex = (h: string | null) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h : "#2d7fc4");

function when(iso: string, tz: string | null): { day: string; dayLong: string; time: string; end: (min: number) => string } {
  const d = new Date(iso);
  const timeZone = tz || "America/Los_Angeles";
  const t = (x: Date) => x.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  try {
    return {
      day: d.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }),
      dayLong: d.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }),
      time: t(d),
      end: (min: number) => t(new Date(d.getTime() + min * 60_000)),
    };
  } catch {
    return { day: d.toDateString(), dayLong: d.toDateString(), time: d.toTimeString().slice(0, 5), end: () => "" };
  }
}

function length(min: number | null): string | null {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} hr${h > 1 ? "s" : ""}${m ? ` ${m} min` : ""}`;
}

/** "8055550199" / "+18055550199" → "(805) 555-0199"; anything else as typed. */
function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : raw;
}

const SOURCE_LABEL: Record<string, string> = { app: "the app", web: "your website" };

export function ownerAlertEmail(r: OwnerAlertRow): { subject: string; text: string; html: string; replyTo: string | null } {
  const w = when(r.scheduled_at, r.timezone);
  const biz = r.business_name.trim();
  const who = r.customer_name?.trim() || "A customer";
  const from = SOURCE_LABEL[r.source ?? ""] ?? "online";
  const len = length(r.duration_minutes);
  const party = r.party_size && r.party_size > 1 ? `${r.party_size} people` : r.party_size === 1 ? "1 person" : null;
  const pending = r.status === "pending";
  const deskUrl = `${SITE}/${r.business_slug}/frontdesk`;
  const email = r.customer_email && EMAIL_RE.test(r.customer_email) ? r.customer_email : null;
  const tel = (r.customer_phone ?? "").replace(/[^\d+]/g, "");
  const p = safeHex(r.brand_primary);

  const subject = `New booking: ${r.resource_name}, ${w.day} at ${w.time} (${who})`;

  /* ── plain text ── */
  const text = [
    `${who} just booked through ${from}.`,
    "",
    `What:   ${r.resource_name}`,
    `When:   ${w.dayLong}, ${w.time}${r.duration_minutes ? `–${w.end(r.duration_minutes)}` : ""}`,
    len ? `Length: ${len}` : null,
    party ? `Party:  ${party}` : null,
    "",
    `Name:   ${r.customer_name ?? "—"}`,
    `Phone:  ${r.customer_phone ? prettyPhone(r.customer_phone) : "—"}`,
    email ? `Email:  ${email}` : null,
    r.notes ? `Notes:  ${r.notes}` : null,
    "",
    pending ? "It's waiting for you to confirm on the front desk:" : "See it on the front desk:",
    deskUrl,
    "",
    `Sent by Atlas Engine for ${biz}.`,
  ].filter((l): l is string => l !== null).join("\n");

  /* ── HTML ── */
  const row = (label: string, value: string) => `
<tr>
  <td style="padding:10px 0;border-top:1px solid #eef0f2;font-size:13px;color:#8b909c;width:92px;vertical-align:top">${label}</td>
  <td style="padding:10px 0;border-top:1px solid #eef0f2;font-size:15px;color:#262b3d;font-weight:600">${value}</td>
</tr>`;
  const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:${p};text-decoration:none;font-weight:700">${esc(label)}</a>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#262b3d;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(`${who} · ${w.day} at ${w.time}${party ? ` · ${party}` : ""}`)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">

<tr><td style="height:6px;background:${p};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:22px 28px 18px;border-bottom:1px solid #eef0f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td>${r.logo_url
      ? `<img src="${esc(r.logo_url)}" alt="${esc(biz)}" height="40" style="height:40px;max-width:190px;object-fit:contain;display:block;border:0">`
      : `<div style="font-size:18px;font-weight:800;color:${p}">${esc(biz)}</div>`}</td>
    <td align="right"><span style="display:inline-block;background:${pending ? "#fff4e0" : "#e6f6ec"};color:${pending ? "#9a5b00" : "#1d7a3e"};font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;white-space:nowrap">${pending ? "Needs confirming" : "Confirmed"}</span></td>
  </tr></table>
</td></tr>

<tr><td style="padding:26px 28px 6px">
  <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${p}">New booking</div>
  <h1 style="margin:6px 0 4px;font-size:26px;line-height:1.2;font-weight:800;color:#262b3d">${esc(r.resource_name)}</h1>
  <div style="font-size:17px;line-height:1.4;color:#4a5060">${esc(w.dayLong)} · <b style="color:#262b3d;white-space:nowrap">${esc(w.time)}${r.duration_minutes ? `–${esc(w.end(r.duration_minutes))}` : ""}</b></div>
</td></tr>

<tr><td style="padding:16px 28px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${len ? row("Length", esc(len)) : ""}
    ${party ? row("Party", esc(party)) : ""}
    ${row("Booked via", esc(from.replace(/^the /, "").replace(/^your /, "").replace(/^\w/, c => c.toUpperCase())))}
  </table>
</td></tr>

<tr><td style="padding:18px 28px 0">
  <div style="background:${p}12;border-radius:14px;padding:16px 18px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8b909c;margin-bottom:6px">Customer</div>
    <div style="font-size:18px;font-weight:800;color:#262b3d;margin-bottom:6px">${esc(r.customer_name?.trim() || "No name given")}</div>
    ${r.customer_phone ? `<div style="font-size:15px;line-height:1.7">📞 ${tel ? link(`tel:${tel}`, prettyPhone(r.customer_phone)) : esc(r.customer_phone)}</div>` : ""}
    ${email ? `<div style="font-size:15px;line-height:1.7">✉️ ${link(`mailto:${email}`, email)}</div>` : ""}
    ${r.notes ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${p}26;font-size:15px;line-height:1.5;color:#4a5060">“${esc(r.notes)}”</div>` : ""}
  </div>
</td></tr>

<tr><td style="padding:24px 28px 6px" align="left">
  <a href="${esc(deskUrl)}" style="display:inline-block;background:${p};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px">${pending ? "Confirm on the front desk" : "Open the front desk"}</a>
  ${email ? `<div style="margin-top:12px;font-size:13px;color:#8b909c">Hit Reply to email ${esc(who.split(" ")[0])} directly.</div>` : ""}
</td></tr>

<tr><td style="padding:22px 28px 24px;font-size:12px;line-height:1.6;color:#8b909c;border-top:1px solid #eef0f2">
  Sent by Atlas Engine to ${esc(r.emails.join(", "))} for ${esc(biz)}.<br>
  Change who gets these in the app builder → Bookings → Booking emails &amp; same-day.
</td></tr>

</table></td></tr></table></body></html>`;

  return { subject, text, html, replyTo: email };
}
