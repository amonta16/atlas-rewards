/**
 * lib/outreach/config.ts — CP-250 · Outreach v1 (Atlas's own cold email to med spas), server only.
 *
 * Cold email does NOT go through Resend: Resend's Acceptable Use Policy only allows mail to people
 * who opted in, and a suspension there would stop patient and lead emails too. It goes out from a
 * separate mailbox on a separate domain (Google Workspace recommended) over SMTP, and replies and
 * bounces are read back from the same mailbox over IMAP.
 *
 * Env (atlas-rewards on Vercel):
 *   OUTREACH_SEND=1         the only switch that lets real emails go out. Off by default: the engine
 *                           still drafts, queues and reports what it WOULD send.
 *   OUTREACH_SMTP_USER      the mailbox, e.g. andrew@getatlasengine.com
 *   OUTREACH_SMTP_PASS      its app password (Google: 2-Step Verification on → App passwords)
 *   OUTREACH_FROM           optional display From, e.g. "Andrew Montano <andrew@getatlasengine.com>"
 *   OUTREACH_SMTP_HOST/PORT optional (default smtp.gmail.com:465)
 *   OUTREACH_IMAP_HOST/PORT optional (default imap.gmail.com:993); same user + password
 *   MAIL_POSTAL_ADDRESS     the physical address CAN-SPAM needs in every email (already used by CP-238)
 */
import { sign, verify } from "@/lib/landing/funnel-sign";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";

export const sendLive = (): boolean => process.env.OUTREACH_SEND === "1";

export function smtpConfig() {
  const user = process.env.OUTREACH_SMTP_USER?.trim();
  const pass = process.env.OUTREACH_SMTP_PASS?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return {
    host: process.env.OUTREACH_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.OUTREACH_SMTP_PORT || 465),
    user, pass,
    from: process.env.OUTREACH_FROM?.trim() || user,
  };
}

export function imapConfig() {
  const s = smtpConfig();
  if (!s) return null;
  return { host: process.env.OUTREACH_IMAP_HOST || "imap.gmail.com", port: Number(process.env.OUTREACH_IMAP_PORT || 993), user: s.user, pass: s.pass };
}

/** The bare address we send from (for mailto: unsubscribe and to spot our own mail in the inbox). */
export function fromAddress(): string | null {
  const s = smtpConfig();
  if (!s) return null;
  return (s.from.match(/<([^>]+)>/)?.[1] ?? s.from).trim().toLowerCase();
}

export const postalAddress = (): string | null => process.env.MAIL_POSTAL_ADDRESS?.trim() || null;

export const PREVIEW_LINK = `${SITE_ORIGIN}/medspa/app?utm_source=outreach&utm_medium=email&utm_campaign=cold_email`;
export const BOOK_LINK = `${SITE_ORIGIN}/book-demo?utm_source=outreach&utm_medium=email&utm_campaign=cold_email`;

export function unsubscribeUrl(leadId: string): string {
  return `${SITE_ORIGIN}/api/outreach/unsubscribe?l=${leadId}&s=${sign(leadId, "outreach-unsub")}`;
}
export function verifyUnsubscribe(leadId: string, sig: string | null): boolean {
  return verify(sig, leadId, "outreach-unsub");
}

/** What the Settings tab shows as the setup checklist. */
export function setupStatus() {
  return {
    smtp: !!smtpConfig(),
    imap: !!imapConfig(),
    live: sendLive(),
    postal: !!postalAddress(),
    places: !!process.env.GOOGLE_PLACES_API_KEY,
    ai: !!process.env.ANTHROPIC_API_KEY,
    from: smtpConfig()?.from ?? null,
  };
}
export type SetupStatus = ReturnType<typeof setupStatus>;
