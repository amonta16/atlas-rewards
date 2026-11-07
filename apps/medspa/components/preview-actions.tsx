"use client";
/**
 * PreviewActions — CP-232 · "Text me my app" and "Go live" on /p/<slug>.
 *
 * Phones: an sms: link to our GHL number, prefilled "Send my app for {name} ({slug})".
 *   iOS reads the body after "&", Android after "?".
 * Computers: a QR code that opens that same text on their phone, plus one phone
 *   field as a fallback (POSTed to atlas-engine.app/api/preview/text-me, never in a URL).
 * Go live: the Stripe founding checkout link (client_reference_id = the slug).
 *   If another practice already holds their area, it becomes the waitlist instead.
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
  return `Send my app for ${name.replace(/[\r\n]+/g, " ").trim().slice(0, 80)} (${slug})`;
}

function smsHref(num: string, body: string, p: Platform) {
  return `sms:${num}${p === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

export function PreviewActions({ slug, businessName, primary, smsNumber, checkoutUrl, apiOrigin, areaOpen }: {
  slug: string; businessName: string; primary: string; smsNumber: string | null; checkoutUrl: string | null; apiOrigin: string; areaOpen: boolean | null;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [showDesktop, setShowDesktop] = useState(false);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; msg?: string }>({ kind: "idle" });
  useEffect(() => setPlatform(detectPlatform()), []);

  const number = e164(smsNumber);
  const body = smsBody(businessName, slug);
  const taken = areaOpen === false;

  const beacon = (action: "sms_tap" | "go_live") => {
    try {
      fetch(`${apiOrigin}/api/preview/text-me`, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, action }) }).catch(() => {});
    } catch { /* never block the tap */ }
  };

  async function sendPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!e164(phone)) { setState({ kind: "error", msg: "Please enter a US mobile number." }); return; }
    setState({ kind: "sending" });
    try {
      const r = await fetch(`${apiOrigin}/api/preview/text-me`, {
        method: "POST", mode: "cors", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "phone", phone }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setState({ kind: "error", msg: j.error ?? "That didn't go through. Please try again." });
      else setState({ kind: "sent" });
    } catch {
      setState({ kind: "error", msg: navigator.onLine ? "We couldn't reach our server. Please try again." : "You seem to be offline. Check your connection." });
    }
  }

  const goLiveHref = taken
    ? `${apiOrigin}/medspa`
    : checkoutUrl
      ? `${checkoutUrl}${checkoutUrl.includes("?") ? "&" : "?"}client_reference_id=${encodeURIComponent(slug)}`
      : null;

  const mobile = platform === "ios" || platform === "android";
  const btn = "inline-flex h-[52px] items-center justify-center rounded-full px-6 text-[16px] font-semibold transition active:scale-[.98]";

  return (
    <div className="mt-8">
      {taken && (
        <p className="mb-4 max-w-[34rem] rounded-2xl bg-white p-4 text-[14.5px] text-sub shadow-soft">
          Heads up: another practice near you already works with Atlas, and we only take one per area. Text us and we&apos;ll put you first on the waitlist.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        {mobile && number ? (
          <a href={smsHref(number, body, platform!)} onClick={() => beacon("sms_tap")} className={`${btn} text-white`} style={{ background: primary }}>
            Text me my app
          </a>
        ) : (
          <button type="button" onClick={() => setShowDesktop((v) => !v)} aria-expanded={showDesktop} className={`${btn} text-white`} style={{ background: primary }}>
            Text me my app
          </button>
        )}
        {goLiveHref && (
          <a href={goLiveHref} onClick={() => beacon("go_live")} className={`${btn} bg-ink text-white`}>
            {taken ? "Join the waitlist" : "Go live"}
          </a>
        )}
      </div>

      {(!mobile || !number) && showDesktop && (
        <div className="mt-5 max-w-[34rem] rounded-[24px] bg-white p-5 shadow-soft">
          {number && (
            <div className="flex items-center gap-5">
              <div className="rounded-xl bg-white p-2 ring-1 ring-line">
                <QRCode value={`SMSTO:${number}:${body}`} size={120} level="M" />
              </div>
              <p className="text-[14.5px] text-sub">Scan with your phone&apos;s camera. It opens a text to us with your app&apos;s code filled in. Just hit send.</p>
            </div>
          )}
          <form onSubmit={sendPhone} className={number ? "mt-5 border-t border-line pt-5" : ""}>
            <label htmlFor="pv-phone" className="text-[14px] font-semibold">{number ? "Or we'll text you" : "We'll text you your app"}</label>
            <div className="mt-2 flex gap-2">
              <input id="pv-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 555-0123" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="h-12 min-w-0 flex-1 rounded-full border border-line bg-page px-4 text-[16px] focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: primary }} />
              <button disabled={state.kind === "sending" || state.kind === "sent"} className="h-12 shrink-0 rounded-full bg-ink px-5 text-[15px] font-semibold text-white disabled:opacity-60">
                {state.kind === "sending" ? "Sending…" : state.kind === "sent" ? "Sent" : "Text me"}
              </button>
            </div>
            <p className="mt-2 text-[12px] text-faint">By submitting, you agree to receive texts from Atlas Engine about your app. Msg &amp; data rates may apply. Reply STOP to opt out.</p>
            {state.kind === "sent" && <p role="status" className="mt-2 text-[14px] font-medium text-emerald-700">On its way. Check your texts in a minute.</p>}
            {state.kind === "error" && <p role="alert" className="mt-2 text-[14px] font-medium text-red-700">{state.msg}</p>}
          </form>
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
