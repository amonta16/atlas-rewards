/**
 * Waiver emails — CP-137.
 *
 * Two messages, both plain text on purpose: the signer's own copy (E-SIGN
 * expects them to be able to keep one) and the guardian's signing link.
 * Sent through Resend, the same path CP-100's lead notifications use.
 * With no RESEND_API_KEY set this logs and reports not-sent — a missing key
 * must never cost someone their signature or their account.
 *
 * CP-141: returns WHY it failed, not just that it did. The guardian invite
 * is load-bearing (a minor stays locked out until the parent signs), so
 * "we couldn't send it" has to be distinguishable from "we sent it", and
 * the reason has to reach the logs in a form you can act on.
 */
const FROM = process.env.WAIVER_FROM_EMAIL
  ?? process.env.LANDING_FROM_EMAIL
  ?? "Atlas Engine <hello@atlas-engine.app>";

/** CP-141: `reason` is for logs and for deciding what to tell the member. */
export type MailResult = { ok: boolean; reason?: string };

export async function sendMail(to: string, subject: string, text: string): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error(`[waiver] RESEND_API_KEY not set — did NOT email ${to}: ${subject}`);
    return { ok: false, reason: "not_configured" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      // The usual causes: the FROM domain isn't verified in Resend, or the
      // key is for a different Resend account. Both show up here with the
      // provider's own message, so log it verbatim.
      console.error(`[waiver] resend rejected ${r.status} from=${FROM} to=${to}`, detail);
      return { ok: false, reason: `provider_${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[waiver] email failed", e);
    return { ok: false, reason: "network" };
  }
}

export function signedCopyText(opts: {
  businessName: string; waiverTitle: string; versionNo: number;
  signerName: string; signedAt: string; consent: string;
  minors: Array<{ first?: string; last?: string; dob?: string | null }>;
  bodyText: string; sha256: string;
}): string {
  const minorLines = opts.minors.length
    ? "\nMinors covered by this signature:\n" +
      opts.minors.map(m => `  · ${[m.first, m.last].filter(Boolean).join(" ")}${m.dob ? ` (born ${m.dob})` : ""}`).join("\n") + "\n"
    : "";
  return [
    `Here is your copy of the waiver you signed for ${opts.businessName}.`,
    "",
    `Document: ${opts.waiverTitle} (version ${opts.versionNo})`,
    `Signed by: ${opts.signerName}`,
    `Signed at: ${opts.signedAt}`,
    minorLines,
    `You agreed to: "${opts.consent}"`,
    "",
    "───────────────────────────────────────────",
    opts.bodyText,
    "───────────────────────────────────────────",
    "",
    `Document fingerprint (SHA-256): ${opts.sha256}`,
    "Keep this email — it is your record of exactly what you agreed to.",
  ].join("\n");
}

export function guardianInviteText(opts: {
  businessName: string; minorName: string; waiverTitle: string; link: string;
}): string {
  return [
    `${opts.minorName} is setting up an account with ${opts.businessName} and needs a parent or guardian to sign the waiver.`,
    "",
    `Open this link to read and sign "${opts.waiverTitle}":`,
    opts.link,
    "",
    "The link works once and expires in 14 days.",
    `If you weren't expecting this, you can ignore it — nothing happens until you sign, and ${opts.minorName}'s account stays locked.`,
  ].join("\n");
}
