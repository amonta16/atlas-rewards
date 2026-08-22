/**
 * Lead notifications — CP-100.
 * Sends a plain email to CONTACT_EMAIL via Resend's REST API when
 * RESEND_API_KEY is set (see checkpoint-83-custom-smtp/README.md — the
 * domain is already verified there). With no key it logs and returns false;
 * the lead is still stored in Supabase, so nothing is lost.
 *
 * Env: RESEND_API_KEY, optional LANDING_FROM_EMAIL (default below).
 */
import { CONTACT_EMAIL } from "./config";

const FROM = process.env.LANDING_FROM_EMAIL ?? "Atlas Engine <hello@atlas-engine.app>";

export async function notifyLead(subject: string, lines: Array<[string, string | null | undefined]>): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const text = lines
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  if (!key) {
    console.info(`[landing] RESEND_API_KEY not set — would have emailed ${CONTACT_EMAIL}:\n${subject}\n${text}`);
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [CONTACT_EMAIL], subject, text }),
    });
    return r.ok;
  } catch (e) {
    console.error("[landing] notify failed", e);
    return false;
  }
}

export function hashIp(req: Request): Promise<string> {
  const xff = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const ip = xff.split(",")[0].trim() || "unknown";
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)).then((b) =>
    Array.from(new Uint8Array(b))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32),
  );
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
