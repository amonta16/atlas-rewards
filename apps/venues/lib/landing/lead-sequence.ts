/**
 * lib/landing/lead-sequence.ts — lead-magnet audit, step 6 · the follow-up sequence, all channels.
 *
 * One clock from the moment the owner unlocks their preview (app_previews.contact_at):
 *   0:45 text · 3 h email · 5 h call · 24 h text · day 2 email · day 3 call · day 4 text ·
 *   day 6 email · day 8 break-up email · day 14 nurture email
 * Stored in public.lead_sequence_steps (CP-243) and edited in Admin → Lead funnel → Sequence;
 * DEFAULT_SEQUENCE is the starting copy (same as the SQL seed) and the "Starting copy" button.
 *
 * planStep() is the whole decision for one lead at one moment (pure, tested): which step is due,
 * which earlier ones are passed over, and whether the due one sends, becomes a call task, or is
 * skipped and why. lead-sequence-run.ts does the I/O.
 *
 * Rules: texts only with SMS consent on file and never after the owner replied to one; emails stop
 * on unsubscribe; booking or paying cancels everything left (open call tasks too).
 */
import { avgTicket, dollars, fill as fillEmail, type MergeValues } from "./lead-nurture";

export type Channel = "email" | "sms" | "call";
export type SeqStep = {
  step: number; channel: Channel; name: string; delay_minutes: number;
  subject: string | null; preheader: string | null; body: string; enabled: boolean; updated_at?: string | null;
};
export type LogStatus = "sent" | "would_send" | "skipped" | "failed" | "task_open" | "task_done" | "cancelled";
export type Outcome = "talked" | "no_answer" | "voicemail" | "booked" | "not_a_fit";
export const OUTCOMES: Array<{ id: Outcome; label: string }> = [
  { id: "talked", label: "Talked" }, { id: "voicemail", label: "Voicemail" }, { id: "no_answer", label: "No answer" },
  { id: "booked", label: "Booked" }, { id: "not_a_fit", label: "Not a fit" },
];

const M = 1, H = 60, D = 1440;
const STOP = " Reply STOP to opt out.";

export const DEFAULT_SEQUENCE: SeqStep[] = [
  { step: 1, channel: "sms", name: "First text", delay_minutes: 45 * M, subject: null, preheader: null, enabled: true,
    body: `Atlas Engine: {spa_name}'s app is built and waiting for you: {app_link} Want me to switch it on with you? Book 15 min: {walkthrough_link}${STOP}` },
  { step: 2, channel: "email", name: "Saw you clicking around", delay_minutes: 3 * H, enabled: true,
    subject: "{first_name}, saw you clicking around", preheader: "Like what you see? This is just the start.",
    body: [
      "Hey {first_name},", "",
      "It's {spa_name}'s app. Yes, the one we built you.", "",
      "Saw you've been clicking around.", "",
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
    ].join("\n") },
  { step: 3, channel: "call", name: "First call", delay_minutes: 5 * H, subject: null, preheader: null, enabled: true,
    body: [
      "Hi, is this the owner of {spa_name}? It's Andrew from Atlas Engine. You built your patient app on our site earlier today. Did it pull your logo and treatments right?", "",
      "If yes: the next step is a 15-minute walkthrough where we switch it on together. Does tomorrow or the day after work?",
      "If no answer: leave a 20-second voicemail (who you are, their app, the link is in their email) and mark \"Voicemail\".",
    ].join("\n") },
  { step: 4, channel: "sms", name: "Next-day text", delay_minutes: 24 * H, subject: null, preheader: null, enabled: true,
    body: `Atlas Engine: did {spa_name}'s app look right? If the logo or color is off, fix it in one tap on your preview: {app_link}${STOP}` },
  { step: 5, channel: "email", name: "Why not switch me on?", delay_minutes: 2 * D, enabled: true,
    subject: "{spa_name}'s app here. Did you forget about me?", preheader: "You built me, then left me in preview.",
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
    ].join("\n") },
  { step: 6, channel: "call", name: "Second call", delay_minutes: 3 * D, subject: null, preheader: null, enabled: true,
    body: [
      "Second try. Lead with their numbers: \"At {avg_ticket} a visit, ten patients coming back on time is {ten_rebooks} a month. Can I show you how it does that in 15 minutes?\"", "",
      "Book it on the call if they say yes. No answer: no voicemail this time, mark \"No answer\".",
    ].join("\n") },
  { step: 7, channel: "sms", name: "Day 4 text", delay_minutes: 4 * D, subject: null, preheader: null, enabled: true,
    body: `Atlas Engine: quick one. At {avg_ticket} a visit, 10 patients coming back on time is {ten_rebooks}/mo for {spa_name}. 15 min to switch it on: {walkthrough_link}${STOP}` },
  { step: 8, channel: "email", name: "What the front desk does", delay_minutes: 6 * D, enabled: true,
    subject: "What {spa_name}'s front desk would do this week", preheader: "Three things, on its own, every week.",
    body: [
      "{first_name},", "",
      "Here's what {spa_name}'s front desk would have done this week if it were switched on:", "",
      "- Texted every patient whose Botox or filler is wearing off, before they book somewhere else",
      "- Asked your happiest patients for a Google review, with points as the thank-you",
      "- Sent a birthday gift to everyone with a birthday this week", "",
      "None of it needs your team to remember anything.", "",
      "See it in your desk:",
      "{desk_link}", "",
      "{spa_name}'s app",
    ].join("\n") },
  { step: 9, channel: "email", name: "Break-up", delay_minutes: 8 * D, enabled: true,
    subject: "Last chance: I'm deleted on {expires_on}", preheader: "You saw what I can do. Don't let me go.",
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
    ].join("\n") },
  { step: 10, channel: "email", name: "Nurture", delay_minutes: 14 * D, enabled: true,
    subject: "{spa_name}: one idea for your slow days", preheader: "No pitch. Just the one thing that works.",
    body: [
      "{first_name},", "",
      "One idea, no pitch.", "",
      "The fastest way to fill a slow week at a med spa isn't a discount. It's the patients who are already due: their Botox wore off three weeks ago and nobody asked them back.", "",
      "Pull a list of everyone whose last neurotoxin visit was 13 to 16 weeks ago and text them today. Most practices get a few bookings the same afternoon.", "",
      "When you want that to happen on its own, every week, it's 15 minutes to set up:",
      "{walkthrough_link}", "",
      "Andrew, Atlas Engine",
    ].join("\n") },
];

export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", sms: "Text", call: "Call task" };

/** "0:45", "3 h", "day 2"… as the schedule is written. */
export function whenLabel(min: number): string {
  if (min < 60) return `0:${String(min).padStart(2, "0")}`;
  if (min % D === 0 && min >= 2 * D) return `day ${min / D}`;
  if (min % H === 0) return `${min / H} h`;
  return `${Math.floor(min / H)}:${String(min % H).padStart(2, "0")}`;
}

/** SMS segments: GSM-7 is 160 (153 per part), anything else is UCS-2: 70 (67). */
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const unicode = /[^\n\r\x20-\x7E£¥èéùìòÇØøÅå_ÆæßÉ¡ÄÖÑÜ§¿äöñüà€^{}\\[~\]|]/.test(text);
  const per = unicode ? [70, 67] : [160, 153];
  const chars = text.length;
  return { chars, unicode, segments: chars <= per[0] ? 1 : Math.ceil(chars / per[1]) };
}

export type SeqValues = MergeValues;
export const fill = fillEmail;

/** The merge values for one lead (the same tags as the CP-238 emails). */
export function valuesFor(r: {
  slug: string; business_name: string; contact_name: string | null; expires_at: string;
  treatments: Array<{ price_cents?: number | null }> | null; treatments_are_examples: boolean;
}, links: { app: string; desk: string; walkthrough: string }): SeqValues {
  const ticket = avgTicket(r.treatments, r.treatments_are_examples);
  return {
    first_name: (r.contact_name ?? "").trim().split(/\s+/)[0] || r.business_name,
    spa_name: r.business_name,
    app_link: links.app, desk_link: links.desk, walkthrough_link: links.walkthrough,
    expires_on: new Date(r.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" }),
    avg_ticket: ticket.fromMenu ? dollars(ticket.cents) : `${dollars(ticket.cents)} (a typical med spa visit)`,
    ten_rebooks: dollars(ticket.cents * 10),
  };
}

/* ───────────────────────── the plan for one lead ───────────────────────── */

export type LeadState = {
  optedInAt: number;            // contact_at
  next: number;                 // seq_step: index of the next step not yet handled
  email: boolean;               // has an email and isn't unsubscribed
  smsOk: boolean;               // phone + SMS consent on file
  smsStopped: boolean;          // replied to a text, or STOP
  callPhone: boolean;           // owner's mobile or the business phone
  stoppedReason: string | null; // booked / paid / unsubscribed / admin
};

export type Plan =
  | { kind: "wait" }
  | { kind: "stop"; reason: string }
  | { kind: "do"; index: number; passed: number[]; action: "send" | "task" | "skip"; reason?: string };

/**
 * What to do now. Only the LATEST due step acts: steps that came due earlier and were never handled
 * (sending was off, the cron was down) are logged as passed over, so a lead never gets a burst.
 * Switched-off steps are passed over too.
 */
export function planStep(steps: SeqStep[], s: LeadState, now: number): Plan {
  if (s.stoppedReason) return { kind: "stop", reason: s.stoppedReason };
  if (s.next >= steps.length) return { kind: "wait" };
  const due = (i: number) => i < steps.length && now >= s.optedInAt + steps[i].delay_minutes * 60_000;
  if (!due(s.next)) return { kind: "wait" };
  let last = s.next;
  while (due(last + 1)) last++;
  let pick = -1;
  for (let i = last; i >= s.next; i--) if (steps[i].enabled) { pick = i; break; }
  const passed: number[] = [];
  for (let i = s.next; i <= last; i++) if (i !== pick) passed.push(i);
  if (pick < 0) return { kind: "do", index: last, passed: passed.filter((i) => i !== last), action: "skip", reason: "switched off" };
  const st = steps[pick];
  const skip = (reason: string): Plan => ({ kind: "do", index: pick, passed, action: "skip", reason });
  if (st.channel === "email") return s.email ? { kind: "do", index: pick, passed, action: "send" } : skip("no email, or unsubscribed");
  if (st.channel === "sms") {
    if (s.smsStopped) return skip("texts stopped: they replied or opted out");
    return s.smsOk ? { kind: "do", index: pick, passed, action: "send" } : skip("no SMS consent on file");
  }
  return s.callPhone ? { kind: "do", index: pick, passed, action: "task" } : skip("no phone number to call");
}
