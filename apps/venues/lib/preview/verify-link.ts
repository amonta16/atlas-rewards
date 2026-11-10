/**
 * lib/preview/verify-link.ts — lead-magnet audit, step 4 · "verified".
 *
 * The front desk link in our emails carries ?v=<HMAC of slug + email>. Opening the desk from it
 * proves the owner reads that inbox; the desk reports it to /api/preview/progress, which checks
 * the signature against the email on the preview row. The token holds no personal data.
 */
import { sign, verify } from "@/lib/landing/funnel-sign";
import { deskUrl } from "./store";

const part = (email: string) => email.trim().toLowerCase();

export function verifyToken(slug: string, email: string): string {
  return sign("pv-verify", slug, part(email));
}

export function checkVerifyToken(slug: string, email: string | null | undefined, token: string | null | undefined): boolean {
  if (!email || !token) return false;
  try { return verify(token, "pv-verify", slug, part(email)); } catch { return false; }
}

/** The desk link for our emails: signed when we know their email. */
export function verifiedDeskUrl(slug: string, email: string | null | undefined): string {
  const base = deskUrl(slug);
  if (!email) return base;
  try { return `${base}?v=${verifyToken(slug, email)}`; } catch { return base; }
}
