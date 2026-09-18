/**
 * Waiver emails — CP-137.
 *
 * Two messages, both plain text on purpose: the signer's own copy (E-SIGN
 * expects them to be able to keep one) and the guardian's signing link.
 * Sent through Resend, the same path CP-100's lead notifications use.
 * With no RESEND_API_KEY set this logs and returns false — a missing key
 * must never cost someone their signature or their account.
 */
const FROM = process.env.WAIVER_FROM_EMAIL
  ?? process.env.LANDING_FROM_EMAIL
  ?? "Atlas Engine <hello@atlas-engine.app>";

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[waiver] RESEND_API_KEY not set — would have emailed ${to}: ${subject}`);
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    if (!r.ok) console.error("[waiver] resend rejected", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) {
    console.error("[waiver] email failed", e);
    return false;
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
