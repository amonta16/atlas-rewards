"use client";
/**
 * PreviewActions — CP-232/234 · the quieter options lower on /p/<slug>. Since the lead-magnet
 * audit (step 2), "Book" lives in CtaBar (components/preview-stage), the only call to action
 * at the top; this keeps "Text me my app" and the env-gated "Go live" as secondary options.
 *
 *   1. "Text me my app" (main) — opens Messages with a text to our number already
 *      written ("Hi! Send me my Glow Aesthetics app (pv-…)"). The owner sends the
 *      first text, so we have an opt-in thread to close in (US version of
 *      Dermis's WhatsApp step). iOS reads the body after "&", Android after "?".
 *      On a computer: a QR code that opens that same text on their phone.
 *      No number configured yet (Twilio pending) → this button is hidden.
 *   2. "Book a walkthrough" — the existing /medspa calendar for the lead their
 *      quiz created (atlas-engine.app/medspa/walkthrough/<slug> redirects there).
 *      Area already taken → "Join the waitlist".
 *   3. "Go live" (Stripe) — only when PREVIEW_SHOW_CHECKOUT=1 (a monthly price is set).
 * The message carries the spa name and preview code only: no personal data.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

function e164(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export function smsBody(name: string, slug: string) {
  return `Hi! Send me my ${name.replace(/[\r\n]+/g, " ").trim().slice(0, 80)} app (${slug})`;
}

function smsHref(num: string, body: string, p: Platform) {
  return `sms:${num}${p === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/**
 * Audit step 5 · one ask per screen: the page's ask is the bar (Book, or the waitlist). This is
 * only "Text me my app", a give. "Go live" moved to the portal (step 4, gated), and the "another
 * practice holds your area" line is gone (no scarcity talk on a taken area).
 */
export function PreviewActions({ slug, businessName, primary, smsNumber, apiOrigin }: {
  slug: string; businessName: string; primary: string; smsNumber: string | null; apiOrigin: string;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => setPlatform(detectPlatform()), []);

  const number = e164(smsNumber);
  const body = smsBody(businessName, slug);
  const mobile = platform === "ios" || platform === "android";

  const beacon = (action: "sms_tap") => {
    try {
      fetch(`${apiOrigin}/api/preview/text-me`, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, action }) }).catch(() => {});
    } catch { /* never block the tap */ }
  };

  const btn = "inline-flex h-12 items-center justify-center rounded-full px-6 text-[15px] font-semibold transition active:scale-[.98]";

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {number && (mobile ? (
          <a href={smsHref(number, body, platform!)} onClick={() => beacon("sms_tap")} className={`${btn} bg-white text-ink ring-1 ring-line`}>
            Text me my app
          </a>
        ) : (
          <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr} className={`${btn} bg-white text-ink ring-1 ring-line`}>
            Text me my app
          </button>
        ))}
      </div>

      {number && !mobile && showQr && (
        <div className="mt-5 flex max-w-[34rem] items-center gap-5 rounded-[24px] bg-white p-5 shadow-soft">
          <div className="rounded-xl bg-white p-2 ring-1 ring-line">
            <QRCode value={`SMSTO:${number}:${body}`} size={120} level="M" />
          </div>
          <p className="text-[14.5px] text-sub">Scan with your phone&apos;s camera. It opens a text to us with your app&apos;s code filled in. Just hit send and we&apos;ll text your app right back.</p>
        </div>
      )}
    </div>
  );
}

/** Reloads the page every few seconds while a preview is still building. */
export function AutoRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
