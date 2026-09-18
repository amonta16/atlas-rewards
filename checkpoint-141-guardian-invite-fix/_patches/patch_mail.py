import io, sys
p = "lib/waiver-mail.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n"); orig = s

def sub(old, new, label):
    global s
    if old not in s: sys.exit("MISS: " + label)
    if s.count(old) != 1: sys.exit("AMBIGUOUS: " + label)
    s = s.replace(old, new)

sub(''' * Sent through Resend, the same path CP-100's lead notifications use.
 * With no RESEND_API_KEY set this logs and returns false — a missing key
 * must never cost someone their signature or their account.
 */''',
''' * Sent through Resend, the same path CP-100's lead notifications use.
 * With no RESEND_API_KEY set this logs and reports not-sent — a missing key
 * must never cost someone their signature or their account.
 *
 * CP-141: returns WHY it failed, not just that it did. The guardian invite
 * is load-bearing (a minor stays locked out until the parent signs), so
 * "we couldn't send it" has to be distinguishable from "we sent it", and
 * the reason has to reach the logs in a form you can act on.
 */''', "header")

sub('''export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
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
}''',
'''/** CP-141: `reason` is for logs and for deciding what to tell the member. */
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
}''', "sendMail")

assert s != orig
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n","\r\n") if CRLF else s)
print("patched", p)
