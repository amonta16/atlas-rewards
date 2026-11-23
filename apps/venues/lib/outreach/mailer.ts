/**
 * lib/outreach/mailer.ts — CP-250 · send one plain-text email from the outreach mailbox over SMTP.
 *
 * Plain text, no tracking pixel, no link rewriting: it reads (and is filtered) like a person's email.
 * Follow-ups thread under email 1 (In-Reply-To / References), which is honest: they ARE replies
 * to our own earlier email. Unsubscribe headers (one-click + mailto) go on only when the email carries
 * an unsubscribe link (CP-250d opt-out style 'link'); in the default 'reply' style there are none,
 * because they mark the email as bulk mail.
 */
import { randomUUID } from "node:crypto";
import { fromAddress, smtpConfig } from "./config";

export type OutgoingMail = {
  to: string; subject: string; text: string; fromName?: string;
  inReplyTo?: string | null;
  /** Set only in opt-out style 'link': adds List-Unsubscribe + one-click headers. */
  unsubscribeUrl?: string | null;
};

/** The List-Unsubscribe headers for an email with a link; none for a reply-only opt-out. */
export function unsubscribeHeaders(url: string | null | undefined, mailbox: string): Record<string, string> {
  if (!url) return {};
  return {
    "List-Unsubscribe": `<${url}>, <mailto:${mailbox}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function transport() {
  const cfg = smtpConfig();
  if (!cfg) throw new Error("The outreach mailbox isn't set up (OUTREACH_SMTP_USER / OUTREACH_SMTP_PASS).");
  const nodemailer = (await import("nodemailer")).default;
  return {
    cfg,
    t: nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    }),
  };
}

export function newMessageId(): string {
  const host = fromAddress()?.split("@")[1] ?? "outreach.local";
  return `<${randomUUID()}@${host}>`;
}

/** Returns the Message-ID we sent with (stored to match replies). Throws on failure. */
export async function sendMail(m: OutgoingMail, messageId = newMessageId()): Promise<string> {
  const { cfg, t } = await transport();
  const addr = fromAddress()!;
  const from = m.fromName ? { name: m.fromName, address: addr } : cfg.from;
  await t.sendMail({
    from, to: m.to, subject: m.subject, text: m.text, messageId,
    ...(m.inReplyTo ? { inReplyTo: m.inReplyTo, references: [m.inReplyTo] } : {}),
    headers: unsubscribeHeaders(m.unsubscribeUrl, addr),
  });
  return messageId;
}

/** Log in to SMTP without sending anything (Settings → "Check mailbox"). */
export async function verifySmtp(): Promise<string | null> {
  try {
    const { t } = await transport();
    await t.verify();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 200) : "SMTP check failed.";
  }
}
