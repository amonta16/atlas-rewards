"use client";
/**
 * Lead-magnet audit, step 3 · the gate, AFTER the app is on screen (/p/<slug>).
 *
 * Fires on scroll-past (the phone leaves the top of the screen) or after 45 s, whichever comes
 * first. "Your app is ready. Unlock it." Email and zip, nothing else: the zip is prefilled from
 * Google (via /api/preview/status) and they can correct it. Submitting saves the lead and emails
 * their front desk (POST /api/preview/unlock on the venue site, CORS locked to this origin).
 *
 * Never over the app before it has been seen, never blurring it (a light dim only). Closing it
 * is allowed and sticks for this visit; an unlocked preview never asks again (server flag +
 * this browser). If another sheet is open (the logo fix), it waits for that to close.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const AFTER_MS = 45_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Phase = "armed" | "open" | "done" | "off";

const key = (slug: string) => `pv-unlocked:${slug}`;
/** Unlocked (localStorage) or closed this visit (sessionStorage). Storage can be blocked: then it just asks again. */
function seen(k: string): boolean {
  try { return !!(window.localStorage.getItem(k) ?? window.sessionStorage.getItem(k)); } catch { return false; }
}
function remember(k: string, v: "unlocked" | "closed") {
  try { (v === "unlocked" ? window.localStorage : window.sessionStorage).setItem(k, v); } catch { /* fine */ }
}

export function PreviewGate({ slug, businessName, primary, apiOrigin }: { slug: string; businessName: string; primary: string; apiOrigin: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("off");
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [desk, setDesk] = useState<string | null>(null);
  const fired = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Already unlocked (this browser, or the server says so)? Otherwise arm the triggers.
  useEffect(() => {
    if (seen(key(slug))) return;
    let stop = false;
    (async () => {
      try {
        const r = await fetch(`${apiOrigin}/api/preview/status?slug=${encodeURIComponent(slug)}`, { mode: "cors", cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { zip?: string | null; unlocked?: boolean };
        if (stop) return;
        if (j.unlocked) { remember(key(slug), "unlocked"); return; }
        if (typeof j.zip === "string" && /^\d{5}$/.test(j.zip)) setZip(j.zip);
      } catch { /* no prefill; the gate still works */ }
      if (!stop) setPhase("armed");
    })();
    return () => { stop = true; };
  }, [slug, apiOrigin]);

  const fire = useCallback(() => {
    if (fired.current) return;
    // Another sheet is up (the logo fix): try again shortly.
    if (document.querySelector('[aria-modal="true"]')) { window.setTimeout(fire, 4000); return; }
    fired.current = true;
    setPhase("open");
  }, []);

  useEffect(() => {
    if (phase !== "armed") return;
    const t = window.setTimeout(fire, AFTER_MS);
    const phone = document.getElementById("pv-phone");
    let io: IntersectionObserver | null = null;
    if (phone && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => { if (e && !e.isIntersecting && e.boundingClientRect.bottom <= 0) fire(); }, { threshold: 0 });
      io.observe(phone);
    }
    return () => { window.clearTimeout(t); io?.disconnect(); };
  }, [phase, fire]);

  // Focus the email field on a keyboard/mouse device only (no surprise keyboard on a phone).
  useEffect(() => {
    if (phase === "open" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) emailRef.current?.focus();
  }, [phase]);

  const close = useCallback(() => {
    if (phase === "open") remember(key(slug), "closed");
    setPhase("off");
  }, [phase, slug]);

  useEffect(() => {
    if (phase !== "open" && phase !== "done") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const z = zip.replace(/\D/g, "");
    if (!EMAIL_RE.test(email.trim())) return setErr("Please enter a valid email.");
    if (z.length !== 5) return setErr("Please enter your 5-digit zip code.");
    setBusy(true);
    try {
      const r = await fetch(`${apiOrigin}/api/preview/unlock`, {
        method: "POST", mode: "cors", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email: email.trim(), zip: z, hp: (document.getElementById("pv-gate-hp") as HTMLInputElement | null)?.value || undefined }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; desk_url?: string };
      if (!r.ok) { setErr(j.error ?? "That didn't go through. Please try again."); return; }
      remember(key(slug), "unlocked");
      setDesk(typeof j.desk_url === "string" ? j.desk_url : null);
      setPhase("done");
      router.refresh(); // a corrected zip can change the territory (Book ↔ waitlist)
    } catch {
      setErr("We couldn't reach our server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (phase !== "open" && phase !== "done") return null;
  const field = "h-[52px] w-full rounded-2xl border border-line bg-white px-4 text-[16px] text-ink placeholder:text-sub focus:outline-none focus:ring-2 focus:ring-black/10";
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/30 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pv-gate-title" onClick={close}>
      <div className="relative w-full max-w-md rounded-t-[28px] bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-card sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-[22px] leading-none text-sub hover:bg-black/5">&times;</button>
        {phase === "open" ? (
          <form onSubmit={submit} noValidate>
            <h2 id="pv-gate-title" className="pr-8 text-[26px] font-semibold leading-[1.12] tracking-[-0.02em]">Your app is ready. Unlock it.</h2>
            <input id="pv-gate-hp" type="text" name="website_url_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            <label htmlFor="pv-gate-email" className="sr-only">Email</label>
            <input id="pv-gate-email" ref={emailRef} className={`${field} mt-5`} type="email" inputMode="email" autoComplete="email" enterKeyHint="next"
              placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="pv-gate-zip" className="sr-only">Zip code</label>
            <input id="pv-gate-zip" className={`${field} mt-2.5`} inputMode="numeric" autoComplete="postal-code" maxLength={10} enterKeyHint="done"
              placeholder="Zip code" value={zip} onChange={(e) => setZip(e.target.value)} />
            {err && <p role="alert" className="mt-3 text-[14px] font-medium text-red-700">{err}</p>}
            <button type="submit" disabled={busy} className="mt-4 h-[54px] w-full rounded-full text-[16.5px] font-semibold text-white disabled:opacity-50" style={{ background: primary }}>
              {busy ? "Unlocking…" : "Unlock my app"}
            </button>
          </form>
        ) : (
          <div role="status">
            <h2 id="pv-gate-title" className="pr-8 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em]">Unlocked. {businessName}&apos;s front desk is in your inbox.</h2>
            {desk && (
              <a href={desk} className="mt-5 flex h-[54px] w-full items-center justify-center rounded-full text-[16.5px] font-semibold text-white" style={{ background: primary }}>
                Open my front desk
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
