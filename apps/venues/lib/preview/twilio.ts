/**
 * lib/preview/twilio.ts — CP-234 · the 6-digit texted code (Twilio Verify).
 *
 * Off until PREVIEW_VERIFY_PHONE=1 AND the three Twilio values are set, so the
 * funnel skips the step today and turns it on the day your number is approved.
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
 * (Twilio Console → Verify → Services → your service).
 */

export function phoneVerifyEnabled(): boolean {
  return process.env.PREVIEW_VERIFY_PHONE === "1"
    && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_VERIFY_SERVICE_SID;
}

async function verifyCall(path: string, form: Record<string, string>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${path}`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: ac.signal,
      cache: "no-store",
    });
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

/** Texts a code to an E.164 number. */
export async function sendCode(to: string): Promise<boolean> {
  try {
    const r = await verifyCall("Verifications", { To: to, Channel: "sms" });
    if (!r.ok) console.error("[verify] send rejected", r.status, String(r.json.message ?? "").slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error("[verify] send failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** true when the code is right. */
export async function checkCode(to: string, code: string): Promise<boolean> {
  if (!/^\d{4,10}$/.test(code)) return false;
  try {
    const r = await verifyCall("VerificationCheck", { To: to, Code: code });
    return r.ok && r.json.status === "approved";
  } catch (e) {
    console.error("[verify] check failed", e instanceof Error ? e.message : e);
    return false;
  }
}
