/**
 * lib/outreach/warmup.ts — CP-250e · mailbox warm-up: the pure pieces (safe on client and server).
 *
 * A new domain that suddenly emails strangers lands in spam. So for the first two weeks the engine
 * sends a few honest, personal emails a day from the outreach mailbox to people who know Andrew,
 * asking them to reply (and to rescue it from Spam/Promotions if needed). Replies are real engagement,
 * which is what mailbox providers learn from. Real spas wait (the Pause switch) until the readiness
 * checks below all pass and Andrew presses Go live.
 *
 * The server side (sending, reading replies, DNS checks) is in warmup-run.ts.
 */

export const WARMUP_DAYS = 14;
export const WARMUP_MIN_SENT = 40;
export const WARMUP_MIN_REPLIES = 8;
/** Warm-up emails go out in the sender's daytime, every day (lighter on weekends). */
export const WARMUP_TZ = "America/Los_Angeles";
export const WARMUP_START_HOUR = 8;
export const WARMUP_END_HOUR = 18;

export type WarmupContact = { email: string; name: string | null; is_me: boolean; active: boolean; created_at: string };
export type WarmupLog = {
  id: string; email: string; kind: "note" | "thanks" | "ready"; subject: string; message_id: string | null;
  status: "sent" | "failed" | "bounced"; error: string | null; sent_at: string; replied_at: string | null;
};

/** Day N of warm-up (1 on the first day). 0 before it starts. */
export function warmupDay(startedAt: string | null, now: number): number {
  if (!startedAt) return 0;
  return Math.max(1, Math.floor((now - Date.parse(startedAt)) / 86_400_000) + 1);
}

/**
 * How many warm-up emails to send today: a gentle ramp, half on weekends, and never more than two
 * per contact a day (friends shouldn't feel spammed).
 */
export function warmupTarget(day: number, weekend: boolean, contacts: number): number {
  if (contacts <= 0) return 0;
  const d = Math.max(1, day);
  const base = d <= 3 ? 3 : d <= 7 ? 5 : d <= 14 ? 8 : 10;
  return Math.min(weekend ? Math.ceil(base / 2) : base, contacts * 2);
}

/** Weekday/hour in a time zone, without importing server code (Intl only). */
export function localPartsSafe(at: number, tz: string): { hour: number; weekend: boolean } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(at));
  const wd = p.find((x) => x.type === "weekday")?.value ?? "";
  return { hour: Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24, weekend: wd === "Sat" || wd === "Sun" };
}

/* ───────── what the emails say: honest, short, and they ask for a reply ───────── */

type Note = { subject: string; body: string };
const NOTES: Note[] = [
  { subject: "testing my new work email", body: "Hey{name}!\n\nThis is my new email for Atlas Engine. Could you reply with anything, even just \"got it\", so I know it's landing in your inbox and not spam?\n\nThanks!" },
  { subject: "quick favor", body: "Hey{name},\n\nQuick favor: I'm setting up a new email address for work and need a few people to reply to it. Can you hit reply and tell me one thing you did this week?\n\nIf this landed in Spam or Promotions, moving it to your inbox helps a ton." },
  { subject: "did this go to spam?", body: "Hi{name},\n\nDid this end up in your inbox or in spam? Just reply with \"inbox\" or \"spam\" if you get a sec. I'm warming up my new work email.\n\nAppreciate it" },
  { subject: "new email, who dis", body: "Hey{name},\n\nNew email for the business. Save this one if you want. What are you up to this weekend?" },
  { subject: "checking in", body: "Hi{name},\n\nJust checking in from my new work email. How's your week going? Reply whenever you get a chance." },
  { subject: "lunch soon?", body: "Hey{name},\n\nWe should grab food soon. What day works for you next week? (Also testing my new email, so a reply helps.)" },
  { subject: "random question", body: "Hi{name},\n\nRandom question: what's the last show you watched that was actually good? Need something new.\n\nSent from my new work email, so reply here if you can." },
  { subject: "update on the app", body: "Hey{name},\n\nQuick update: the med spa app is coming along and I'm getting ready to reach out to more businesses. This is my new email for that. Mind replying so I know it works?" },
  { subject: "can you see this?", body: "Hi{name},\n\nCan you see this one okay? Testing a new address, so a quick reply helps. If it went to Promotions, dragging it to Primary helps me out too.\n\nThanks" },
  { subject: "weekend plans", body: "Hey{name},\n\nAny plans this weekend? Reply when you can, I'm making sure my new work email reaches people." },
  { subject: "one-word reply?", body: "Hi{name},\n\nCould you send me a one-word reply? Any word. I'm warming up my new email so it doesn't get flagged.\n\nThanks!" },
  { subject: "how's it going", body: "Hey{name},\n\nHow's everything going? Haven't caught up in a bit. Reply here, this is my new work email." },
];
const THANKS: string[] = [
  "Got it, thank you!",
  "Perfect, that helps. Thanks!",
  "Appreciate it!",
  "Thanks for replying, made it through.",
  "Awesome, thank you!",
];

/** Pick a note, never the same as the last one this contact got. `rand` is injectable for tests. */
export function pickNote(name: string | null, lastSubject: string | null, rand: () => number = Math.random): Note {
  const pool = NOTES.filter((n) => n.subject !== lastSubject);
  const n = pool[Math.floor(rand() * pool.length) % pool.length];
  const who = name?.trim() ? ` ${name.trim().split(/\s+/)[0]}` : "";
  return { subject: n.subject, body: n.body.replace("{name}", who) };
}
export function pickThanks(rand: () => number = Math.random): string {
  return THANKS[Math.floor(rand() * THANKS.length) % THANKS.length];
}

/* ───────── is the mailbox ready for real spas? ───────── */

export type DnsStatus = { domain: string | null; spf: boolean | null; dkim: boolean | null; dmarc: boolean | null };
export type WarmupStats = { sent: number; replies: number; bounces: number; failed: number; sentToday: number; repliedContacts: number };
export type Check = { label: string; ok: boolean; detail: string };
export type Readiness = { ready: boolean; day: number; checks: Check[] };

export function warmupReadiness(input: {
  startedAt: string | null; now: number; stats: WarmupStats; dns: DnsStatus; postal: boolean; contacts: number;
}): Readiness {
  const { stats, dns } = input;
  const day = warmupDay(input.startedAt, input.now);
  const dnsOk = (v: boolean | null) => v === true;
  const checks: Check[] = [
    { label: "SPF record", ok: dnsOk(dns.spf), detail: dns.spf ? "Google is allowed to send for the domain." : `Add TXT @ "v=spf1 include:_spf.google.com ~all" on ${dns.domain ?? "the domain"}.` },
    { label: "DKIM signing", ok: dnsOk(dns.dkim), detail: dns.dkim ? "google._domainkey is published." : "Google Admin → Apps → Gmail → Authenticate email → generate, add the TXT, Start authentication." },
    { label: "DMARC record", ok: dnsOk(dns.dmarc), detail: dns.dmarc ? "_dmarc is published." : `Add TXT _dmarc "v=DMARC1; p=none" on ${dns.domain ?? "the domain"}.` },
    { label: `${WARMUP_DAYS} days of warm-up`, ok: day >= WARMUP_DAYS, detail: day ? `Day ${Math.min(day, 99)} of ${WARMUP_DAYS}.` : "Starts with the first warm-up email." },
    { label: `${WARMUP_MIN_SENT}+ warm-up emails`, ok: stats.sent >= WARMUP_MIN_SENT, detail: `${stats.sent} sent so far.` },
    { label: `${WARMUP_MIN_REPLIES}+ replies`, ok: stats.replies >= WARMUP_MIN_REPLIES, detail: `${stats.replies} replies from ${stats.repliedContacts} ${stats.repliedContacts === 1 ? "person" : "people"}. Replies are what build trust.` },
    { label: "No bounces", ok: stats.bounces === 0, detail: stats.bounces ? `${stats.bounces} bounced: check the address list.` : "None." },
    { label: "Postal address set", ok: input.postal, detail: input.postal ? "In every spa email (CAN-SPAM)." : "Set MAIL_POSTAL_ADDRESS on Vercel." },
    { label: "Warm-up contacts", ok: input.contacts >= 3, detail: `${input.contacts} active (3 or more).` },
  ];
  return { ready: checks.every((c) => c.ok), day, checks };
}

export function warmupStats(log: WarmupLog[], now: number, tz = WARMUP_TZ): WarmupStats {
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: tz });
  const real = log.filter((l) => l.kind !== "ready");
  const sent = real.filter((l) => l.status !== "failed");
  return {
    sent: sent.length,
    replies: sent.filter((l) => l.replied_at).length,
    bounces: sent.filter((l) => l.status === "bounced").length,
    failed: real.filter((l) => l.status === "failed").length,
    sentToday: sent.filter((l) => new Date(l.sent_at).toLocaleDateString("en-CA", { timeZone: tz }) === today).length,
    repliedContacts: new Set(sent.filter((l) => l.replied_at).map((l) => l.email)).size,
  };
}
