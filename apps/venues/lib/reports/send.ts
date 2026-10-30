/**
 * lib/reports/send.ts — CP-221 · one Resend call for the monthly report,
 * shared by the 1st-of-the-month cron and the "Email me a test" button.
 */
export const REPORTS_FROM = process.env.REPORTS_FROM_EMAIL ?? process.env.LANDING_FROM_EMAIL ?? "Atlas Engine <hello@atlas-engine.app>";

export async function sendReportEmail(to: string[], subject: string, html: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[reports] RESEND_API_KEY not set — would have emailed ${to.join(", ")}: ${subject}`);
    return { ok: false, error: "Email isn't configured on the server (RESEND_API_KEY)." };
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REPORTS_FROM, to, subject, html, text }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("[reports] resend failed", r.status, body);
    return { ok: false, error: `Email provider said ${r.status}` };
  }
  return { ok: true };
}
