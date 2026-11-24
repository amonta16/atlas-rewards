/**
 * lib/outreach/warmup-run.ts — CP-250e · mailbox warm-up, the server side. Called from runTick every
 * 5 minutes (warmupTick) and from runInbox for each new message (warmupInbox).
 *
 * Each tick sends at most ONE warm-up email, only between 8:00 and 18:00 Pacific, spread over the day
 * (adaptive gap), up to the day's ramp target (warmup.ts). It picks the contact who has had the
 * fewest today. If a contact replied to their last one, the next email to them is a short "thanks"
 * reply in the same thread, which reads like a real conversation. Warm-up runs while real spas are
 * paused, and keeps running (lightly) after Go live. It needs OUTREACH_SEND=1 like any send.
 * When every readiness check passes for the first time, Andrew's own address gets one "ready" email.
 */
import dns from "node:dns";
import { previewDb } from "@/lib/preview/store";
import { fromAddress, postalAddress, sendLive, smtpConfig } from "./config";
import { newMessageId, sendMail } from "./mailer";
import type { InboxItem } from "./inbox";
import { localParts } from "./time";
import {
  WARMUP_END_HOUR, WARMUP_START_HOUR, WARMUP_TZ, pickNote, pickThanks, warmupDay, warmupReadiness, warmupStats, warmupTarget,
  type DnsStatus, type WarmupContact, type WarmupLog,
} from "./warmup";
import type { Settings } from "./shared";

const db = () => previewDb();
const MIN = 60_000;

/** The outreach mailbox's domain (from OUTREACH_SMTP_USER). */
export const mailboxDomain = (): string | null => fromAddress()?.split("@")[1] ?? null;

async function txt(name: string): Promise<string[] | null> {
  try {
    const rows = await Promise.race([
      dns.promises.resolveTxt(name),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    return rows.map((r) => r.join(""));
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? [] : null;
  }
}

/** SPF, DKIM (Google's default selector) and DMARC for the mailbox's domain. null = couldn't check. */
export async function dnsStatus(domain = mailboxDomain()): Promise<DnsStatus> {
  if (!domain) return { domain: null, spf: null, dkim: null, dmarc: null };
  const [root, dkim, dmarc] = await Promise.all([txt(domain), txt(`google._domainkey.${domain}`), txt(`_dmarc.${domain}`)]);
  return {
    domain,
    spf: root === null ? null : root.some((r) => /^v=spf1\b/i.test(r) && /_spf\.google\.com/i.test(r)),
    dkim: dkim === null ? null : dkim.some((r) => /v=DKIM1/i.test(r) || /\bp=/.test(r)),
    dmarc: dmarc === null ? null : dmarc.some((r) => /^v=DMARC1/i.test(r)),
  };
}

export async function loadWarmup(limit = 2000): Promise<{ contacts: WarmupContact[]; log: WarmupLog[] }> {
  const [c, l] = await Promise.all([
    db().from("outreach_warmup_contacts").select("*").order("created_at"),
    db().from("outreach_warmup_log").select("*").order("sent_at", { ascending: false }).limit(limit),
  ]);
  return { contacts: (c.data ?? []) as WarmupContact[], log: (l.data ?? []) as WarmupLog[] };
}

/** One warm-up step per tick. Returns a short note for the engine's run summary, or null. */
export async function warmupTick(settings: Settings, now: number): Promise<string | null> {
  if (settings.warmup_enabled === false || !sendLive() || !smtpConfig()) return null;
  const local = localParts(now, WARMUP_TZ);
  if (local.hour < WARMUP_START_HOUR || local.hour >= WARMUP_END_HOUR) return null;
  if (settings.next_warmup_after && Date.parse(settings.next_warmup_after) > now) return null;

  const { contacts, log } = await loadWarmup();
  const active = contacts.filter((c) => c.active);
  if (!active.length) return null;

  const stats = warmupStats(log, now);
  const startedAt = settings.warmup_started_at ?? new Date(now).toISOString();
  const day = warmupDay(startedAt, now);
  const weekend = local.day === 0 || local.day === 6;
  const target = warmupTarget(day, weekend, active.length);

  // The "ready" notice, once, when every check first passes.
  if (!settings.warmup_ready_notified_at) {
    const r = warmupReadiness({ startedAt: settings.warmup_started_at, now, stats, dns: await dnsStatus(), postal: !!postalAddress(), contacts: active.length });
    const me = active.find((c) => c.is_me);
    if (r.ready && me) {
      await sendOne({ to: me.email, kind: "ready", subject: "Outreach mailbox: ready for real spas",
        text: `The outreach mailbox finished warm-up (day ${r.day}, ${stats.sent} warm-up emails, ${stats.replies} replies, no bounces, SPF/DKIM/DMARC in place).\n\nOpen Admin → Outreach → Overview and press Go live when you want real spas to start getting emails. Start at 5 a day.`,
        fromName: settings.from_name, inReplyTo: null });
      await db().from("outreach_settings").update({ warmup_ready_notified_at: new Date(now).toISOString() }).eq("id", 1);
      return "warm-up ready: sent you a notice";
    }
  }

  if (stats.sentToday >= target) return null;

  // Who: fewest today, then longest since their last one.
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: WARMUP_TZ });
  const last = new Map<string, WarmupLog>();
  for (const l of log) if (!last.has(l.email) && l.kind !== "ready") last.set(l.email, l);
  const countToday = (e: string) => log.filter((l) => l.email === e && l.kind !== "ready" && new Date(l.sent_at).toLocaleDateString("en-CA", { timeZone: WARMUP_TZ }) === today).length;
  const pick = [...active].sort((a, b) =>
    countToday(a.email) - countToday(b.email)
    || (last.get(a.email) ? Date.parse(last.get(a.email)!.sent_at) : 0) - (last.get(b.email) ? Date.parse(last.get(b.email)!.sent_at) : 0))[0];
  if (countToday(pick.email) >= 2) return null;

  const prev = last.get(pick.email) ?? null;
  const ok = prev && prev.replied_at && prev.kind === "note" && prev.message_id;
  const sent = ok
    ? await sendOne({ to: pick.email, kind: "thanks", subject: `Re: ${prev!.subject}`, text: pickThanks(), fromName: settings.from_name, inReplyTo: prev!.message_id })
    : await (() => { const n = pickNote(pick.name, prev?.subject ?? null); return sendOne({ to: pick.email, kind: "note", subject: n.subject, text: `${n.body}\n\n${settings.from_name.split(/\s+/)[0] || "Andrew"}`, fromName: settings.from_name, inReplyTo: null }); })();

  // Spread the rest of today's target over what's left of the window.
  const endOfWindow = (WARMUP_END_HOUR - local.hour) * 60 * MIN;
  const left = Math.max(1, target - stats.sentToday - 1);
  const gap = Math.min(Math.max((endOfWindow / left) * (0.6 + Math.random() * 0.7), 20 * MIN), 150 * MIN);
  await db().from("outreach_settings").update({
    next_warmup_after: new Date(now + gap).toISOString(),
    ...(settings.warmup_started_at ? {} : { warmup_started_at: startedAt }),
  }).eq("id", 1);
  return sent ? `warm-up email to ${pick.email.split("@")[0]}…` : "warm-up send failed";
}

async function sendOne(m: { to: string; kind: WarmupLog["kind"]; subject: string; text: string; fromName: string; inReplyTo: string | null }): Promise<boolean> {
  const messageId = newMessageId();
  try {
    await sendMail({ to: m.to, subject: m.subject, text: m.text, fromName: m.fromName, inReplyTo: m.inReplyTo, unsubscribeUrl: null }, messageId);
    await db().from("outreach_warmup_log").insert({ email: m.to, kind: m.kind, subject: m.subject.slice(0, 200), message_id: messageId, status: "sent" });
    return true;
  } catch (e) {
    await db().from("outreach_warmup_log").insert({ email: m.to, kind: m.kind, subject: m.subject.slice(0, 200), status: "failed", error: (e instanceof Error ? e.message : "send failed").slice(0, 300) });
    return false;
  }
}

/**
 * Called for each new inbox message before lead matching. A reply or bounce from a warm-up contact is
 * recorded on the warm-up log and NOT treated as a lead reply. Returns true when it was warm-up mail.
 */
export async function warmupInbox(item: InboxItem): Promise<boolean> {
  const d = db();
  const addrs = item.kind === "bounce" ? item.failedRecipients : item.from ? [item.from] : [];
  let row: { id: string } | null = null;
  if (item.inReplyTo.length) {
    const { data } = await d.from("outreach_warmup_log").select("id").in("message_id", item.inReplyTo.slice(0, 20)).order("sent_at", { ascending: false }).limit(1);
    row = (data?.[0] as { id: string } | undefined) ?? null;
  }
  if (!row && addrs.length) {
    const { data: known } = await d.from("outreach_warmup_contacts").select("email").in("email", addrs.map((a) => a.toLowerCase()));
    if (!known?.length) return false;
    const { data } = await d.from("outreach_warmup_log").select("id").eq("email", known[0].email).neq("kind", "ready").order("sent_at", { ascending: false }).limit(1);
    row = (data?.[0] as { id: string } | undefined) ?? null;
    if (!row) return true; // a contact wrote first: still warm-up mail, nothing to mark
  }
  if (!row) return false;
  if (item.kind === "bounce") await d.from("outreach_warmup_log").update({ status: "bounced" }).eq("id", row.id);
  else if (item.kind === "reply") await d.from("outreach_warmup_log").update({ replied_at: item.date }).eq("id", row.id).is("replied_at", null);
  return true;
}
