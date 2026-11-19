/**
 * lib/outreach/inbox.ts — CP-250 · read new mail in the outreach mailbox over IMAP (read-only).
 *
 * Only mail that arrives AFTER the first run is looked at: the first run just records where the
 * inbox is. Each new message is returned with what the engine needs to match it to a lead
 * (In-Reply-To / References, sender, failed recipient for bounces). Nothing is deleted or moved,
 * and the mailbox is opened read-only, so the messages stay unread in Gmail for Andrew.
 */
import { imapConfig } from "./config";

export type InboxItem = {
  uid: string;                 // "<uidvalidity>:<uid>"
  from: string | null;
  subject: string;
  text: string;
  date: string;
  inReplyTo: string[];         // In-Reply-To + References Message-IDs
  kind: "reply" | "bounce" | "auto";
  failedRecipients: string[];  // bounces only
};

export type InboxPoll = { items: InboxItem[]; uidvalidity: number; lastUid: number; note?: string };

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon|bounce)/i;
const BOUNCE_SUBJ = /(delivery status notification|undeliver|mail delivery (failed|subsystem)|returned mail|delivery failure|failure notice)/i;

export async function pollInbox(prev: { uidvalidity: number | null; lastUid: number }, max = 40): Promise<InboxPoll | null> {
  const cfg = imapConfig();
  if (!cfg) return null;
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({
    host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass },
    logger: false, socketTimeout: 30_000,
  });
  await client.connect();
  try {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const validity = Number(box.uidValidity);
    const top = Number(box.uidNext) - 1;
    // First run, or Gmail renumbered the box: start from "now" instead of reading old mail.
    if (!prev.uidvalidity || prev.uidvalidity !== validity) return { items: [], uidvalidity: validity, lastUid: top, note: "Inbox connected. Watching new mail from now on." };
    if (top <= prev.lastUid) return { items: [], uidvalidity: validity, lastUid: prev.lastUid };

    const items: InboxItem[] = [];
    let last = prev.lastUid;
    const range = `${prev.lastUid + 1}:${Math.min(top, prev.lastUid + max)}`;
    for await (const msg of client.fetch(range, { uid: true, source: { start: 0, maxLength: 256 * 1024 } }, { uid: true })) {
      last = Math.max(last, Number(msg.uid));
      if (!msg.source) continue;
      const p = await simpleParser(msg.source);
      const from = p.from?.value?.[0]?.address?.toLowerCase() ?? null;
      const subject = (p.subject ?? "").slice(0, 300);
      const text = (p.text ?? "").slice(0, 20_000);
      const refs = ([] as string[])
        .concat(p.inReplyTo ? [p.inReplyTo] : [])
        .concat(Array.isArray(p.references) ? p.references : p.references ? [p.references] : [])
        .map((s) => s.trim()).filter(Boolean);
      const auto = String(p.headers.get("auto-submitted") ?? "").toLowerCase();
      const ctype = String((p.headers.get("content-type") as { value?: string } | undefined)?.value ?? "");
      const isBounce = (!!from && BOUNCE_FROM.test(from)) || BOUNCE_SUBJ.test(subject) || /report/i.test(ctype);
      const failed = isBounce
        ? Array.from(new Set([
            ...String(p.headers.get("x-failed-recipients") ?? "").split(/[,\s]+/),
            ...Array.from(text.matchAll(/(?:final|original)-recipient:\s*rfc822;\s*([^\s<>]+@[^\s<>]+)/gi), (m) => m[1]),
            ...Array.from(text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi), (m) => m[0]),
          ].map((e) => e.toLowerCase().replace(/[.,;:>]+$/, "")).filter((e) => e.includes("@"))))
        : [];
      items.push({
        uid: `${validity}:${msg.uid}`, from, subject, text,
        date: (p.date ?? new Date()).toISOString(), inReplyTo: refs,
        kind: isBounce ? "bounce" : auto && auto !== "no" ? "auto" : "reply",
        failedRecipients: failed.slice(0, 20),
      });
    }
    return { items, uidvalidity: validity, lastUid: last };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Log in to IMAP and open the inbox (Settings → "Check mailbox"). */
export async function verifyImap(): Promise<string | null> {
  const cfg = imapConfig();
  if (!cfg) return "The outreach mailbox isn't set up.";
  try {
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: true, auth: { user: cfg.user, pass: cfg.pass }, logger: false, socketTimeout: 20_000 });
    await client.connect();
    await client.mailboxOpen("INBOX", { readOnly: true });
    await client.logout();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 200) : "IMAP check failed.";
  }
}

/** The new part of a reply: drop the quoted thread under "On … wrote:" and ">" lines. */
export function freshText(text: string): string {
  const cut = text.split(/\n\s*(On .{5,200}wrote:|-{2,}\s*Original Message|From: .+\n(Sent|Date): )/i)[0];
  return cut.split("\n").filter((l) => !l.trimStart().startsWith(">")).join("\n").trim().slice(0, 6000);
}
