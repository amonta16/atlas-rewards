/**
 * lib/landing/lead-nurture.ts — CP-238 · the follow-up emails for owners who opt in
 * on the lead magnet (atlas-engine.app/medspa/app → app_previews.contact_at).
 *
 * The sequence lives in public.lead_email_steps (edited in Admin → Lead funnel →
 * Follow-up emails). DEFAULT_STEPS is the same starting copy, used when the table
 * isn't there yet and as the "reset" text. Tone follows the Sabri Suby "KONG"
 * emails: the product talks, short lines, one link, one ask.
 *
 * Timing is hours after opt-in. The cron (/api/landing/reminders, every 15 min)
 * sends step n+1 once it's due, and stops for good when the owner books a
 * walkthrough, pays, unsubscribes or the preview is gone. Sending is off until
 * LEAD_NURTURE_SEND=1.
 */
import { SITE_ORIGIN } from "./medspa-funnel";

export type EmailStep = {
  step: number;
  name: string;
  delay_hours: number;
  subject: string;
  preheader: string | null;
  body: string;
  enabled: boolean;
  updated_at?: string | null;
};

export const MERGE_TAGS: Array<{ tag: string; what: string }> = [
  { tag: "{first_name}", what: "Owner's first name" },
  { tag: "{spa_name}", what: "Their practice" },
  { tag: "{app_link}", what: "Their preview app" },
  { tag: "{desk_link}", what: "Their front desk" },
  { tag: "{walkthrough_link}", what: "Book the walkthrough" },
  { tag: "{expires_on}", what: "Preview delete date" },
  { tag: "{avg_ticket}", what: "Their average ticket, from their own menu prices" },
  { tag: "{ten_rebooks}", what: "10 visits at their average ticket" },
];

/**
 * Audit step 5 · the money math uses THEIR prices. The average ticket is the median price on the
 * treatment menu we read from their website (member prices and $0 items left out). With no real
 * menu (example treatments, or fewer than 3 prices) it falls back to DEFAULT_TICKET_CENTS, a typical
 * med spa visit, and `fromMenu` is false.
 */
export const DEFAULT_TICKET_CENTS = 45_000;
export function avgTicket(treatments: Array<{ price_cents?: number | null }> | null | undefined, examples = false): { cents: number; fromMenu: boolean } {
  const prices = examples ? [] : (treatments ?? []).map((t) => Number(t.price_cents)).filter((c) => Number.isFinite(c) && c >= 2_500 && c <= 2_000_000).sort((a, b) => a - b);
  if (prices.length < 3) return { cents: DEFAULT_TICKET_CENTS, fromMenu: false };
  const mid = prices.length >> 1;
  const median = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
  return { cents: Math.round(median / 500) * 500, fromMenu: true }; // to the nearest $5
}
export const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export const DEFAULT_STEPS: EmailStep[] = [
  {
    step: 1, name: "Saw you clicking around", delay_hours: 24, enabled: true,
    subject: "{first_name}, saw you clicking around",
    preheader: "Like what you see? This is just the start.",
    body: [
      "Hey {first_name},", "",
      "It's {spa_name}'s app. Yes, the one we built you.", "",
      "Saw you've been clicking around my front desk.", "",
      "Like what you see?", "",
      "I bet you do...", "",
      "But right now I'm only a preview. I can't save anything, and your patients can't join me yet.", "",
      "Switch me on and I start doing the work:",
      "- Reminding patients before their treatment wears off",
      "- Selling memberships that bill every month",
      "- Sending birthday and win-back gifts on my own", "",
      "It takes one 15-minute call. Andrew switches me on with you, live:",
      "{walkthrough_link}", "",
      "Talk soon,",
      "{spa_name}'s app",
      "(sent by Andrew at Atlas Engine)",
    ].join("\n"),
  },
  {
    step: 2, name: "Why not switch me on?", delay_hours: 72, enabled: true,
    subject: "{spa_name}'s app here. Did you forget about me?",
    preheader: "You built me, then left me in preview.",
    body: [
      "Oh, hi {first_name}!", "",
      "Just checking in. I noticed you built me, {spa_name}'s own patient app, but I'm still sitting in preview.", "",
      "That's weird.", "",
      "Why wouldn't you want me?", "",
      "I'd be reminding every patient who's due for a touch-up...",
      "Turning one-time visits into monthly members...",
      "And getting you more Google reviews while you're busy with patients.", "",
      "Maybe you're waiting for the perfect moment. Smart.", "",
      "But a gentle reminder: the patients who are due right now only come back if someone reminds them. That's my whole job.", "",
      "Quick math. Your average treatment is about {avg_ticket}. If I bring back just 10 patients a month who were due, that's {ten_rebooks}. Every month.", "",
      "When you're ready, book 15 minutes and we switch me on together:",
      "{walkthrough_link}", "",
      "Yours,",
      "{spa_name}'s app",
    ].join("\n"),
  },
  {
    step: 3, name: "Last chance", delay_hours: 288, enabled: true,
    subject: "Last chance: I'm deleted on {expires_on}",
    preheader: "You saw what I can do. Don't let me go.",
    body: [
      "{first_name},", "",
      "You saw what I can do.", "",
      "Your logo. Your treatments. Your patients' app, on their phones.", "",
      "And I know you liked it.", "",
      "But you haven't switched me on yet, and on {expires_on} your preview gets deleted.", "",
      "You won't let me go without a fight, will you?", "",
      "Didn't think so.", "",
      "Book 15 minutes here and I'm live for {spa_name}:",
      "{walkthrough_link}", "",
      "Sincerely yours,",
      "{spa_name}'s app",
    ].join("\n"),
  },
];

export type MergeValues = {
  first_name: string; spa_name: string; app_link: string; desk_link: string; walkthrough_link: string; expires_on: string;
  avg_ticket: string; ten_rebooks: string;
};

/** Sample values for the admin preview. */
export const SAMPLE_VALUES: MergeValues = {
  first_name: "Amanda",
  spa_name: "Amanda Rose Esthetics",
  app_link: "https://med.atlas-engine.app/p/pv-amanda-rose",
  desk_link: "https://med.atlas-engine.app/pv-amanda-rose/desk",
  walkthrough_link: `${SITE_ORIGIN}/medspa/walkthrough/pv-amanda-rose`,
  expires_on: new Date(Date.now() + 12 * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric" }),
  avg_ticket: "$425",
  ten_rebooks: "$4,250",
};

export function fill(text: string, v: MergeValues): string {
  return text.replace(/\{(first_name|spa_name|app_link|desk_link|walkthrough_link|expires_on|avg_ticket|ten_rebooks)\}/g, (_, k: keyof MergeValues) => v[k] ?? "");
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const BUTTON: Record<string, string> = { walkthrough_link: "Book my 15-min walkthrough", app_link: "Open my app", desk_link: "Open my front desk" };

/**
 * Render one step for sending (or for the admin preview). Plain-letter look on
 * purpose: these read like a note from a person, not a newsletter. A line that is
 * only a link tag becomes a button; every other line is escaped text.
 */
export function renderStep(step: Pick<EmailStep, "subject" | "preheader" | "body">, v: MergeValues, opts: { unsubscribeUrl: string; postalAddress: string | null }) {
  const subject = fill(step.subject, v);
  const preheader = step.preheader ? fill(step.preheader, v) : "";
  const lines = step.body.split("\n");
  const linkLine = (l: string) => /^\{(walkthrough_link|app_link|desk_link)\}$/.exec(l.trim());

  const text = [
    fill(step.body, v), "",
    "—",
    `Don't want these? Unsubscribe: ${opts.unsubscribeUrl}`,
    ...(opts.postalAddress ? [`Atlas Engine · ${opts.postalAddress}`] : ["Atlas Engine"]),
  ].join("\n");

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171B26;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;"><tr><td style="font-size:16px;line-height:1.6;">
${lines.map((l) => {
    const m = linkLine(l);
    if (m) {
      const href = esc(v[m[1] as keyof MergeValues]);
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;"><tr><td bgcolor="#0B5FD6" style="border-radius:999px;"><a href="${href}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${BUTTON[m[1]]} &rarr;</a></td></tr></table>`;
    }
    return l.trim() === "" ? `<div style="height:12px;line-height:12px;">&nbsp;</div>` : `<div>${esc(fill(l, v))}</div>`;
  }).join("\n")}
</td></tr>
<tr><td style="padding-top:28px;font-size:12px;line-height:1.6;color:#8A8F99;">
Atlas Engine${opts.postalAddress ? ` &middot; ${esc(opts.postalAddress)}` : ""}<br>
You're getting this because you built a free app preview at atlas-engine.app. <a href="${esc(opts.unsubscribeUrl)}" style="color:#8A8F99;">Unsubscribe</a>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, preheader, text, html };
}

/** "24" → "1 day after opt-in", "36" → "36 hours after opt-in". */
export function describeDelay(h: number): string {
  if (h % 24 === 0) { const d = h / 24; return `${d} day${d === 1 ? "" : "s"} after opt-in`; }
  return `${h} hour${h === 1 ? "" : "s"} after opt-in`;
}
