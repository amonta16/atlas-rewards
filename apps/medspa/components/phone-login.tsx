"use client";
/**
 * Phone + texted code, Dermis style. Three short steps:
 *   1. phone number  →  Supabase sends a 6-digit code by SMS (Twilio)
 *   2. the code      →  verifyOtp signs the patient in
 *   3. their name    →  only the first time (profiles.full_name is empty)
 * The example clinic fakes steps 1–2 so a sales demo works without SMS.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@atlas/core/supabase/client";
import { Wordmark } from "./chrome";

type Step = "phone" | "code" | "name";
const RESEND_SECONDS = 60; // Supabase allows one code per number per minute.

export function PhoneLogin({ slug, clinicName, logoUrl, next, demo }: { slug: string; clinicName: string; logoUrl: string | null; next: string; demo: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [digits, setDigits] = useState("");
  const [code, setCode] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const e164 = `+1${digits}`;

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode() {
    setBusy(true); setError(null);
    if (!demo) {
      const { error } = await createClient().auth.signInWithOtp({ phone: e164, options: { channel: "sms" } });
      if (error) { setBusy(false); setError(friendly(error.message)); return; }
    }
    setBusy(false); setStep("code"); setCode(""); setWait(RESEND_SECONDS);
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function verify(token: string) {
    setBusy(true); setError(null);
    if (demo) { setBusy(false); setStep("name"); return; }
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({ phone: e164, token, type: "sms" });
    if (error || !data.user) { setBusy(false); setError(friendly(error?.message ?? "That code didn't work.")); setCode(""); return; }
    const { data: p } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
    if ((p as { full_name?: string | null } | null)?.full_name?.trim()) return done();
    setBusy(false); setStep("name");
  }

  async function saveName() {
    setBusy(true); setError(null);
    const full = `${first.trim()} ${last.trim()}`.trim();
    if (demo) {
      await fetch("/api/demo-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: full, phone: e164 }) });
      return done();
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").upsert({ id: user.id, full_name: full, phone: e164 });
    done();
  }

  function done() {
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-6" style={{ paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}>
      {step === "phone" && (
        <div className="flex flex-1 flex-col animate-rise">
          <div className="mt-[18vh] text-center"><Wordmark name={clinicName} logoUrl={logoUrl} size="lg" /></div>
          <p className="mt-8 text-center text-[16px] text-faint">Welcome to {clinicName}</p>
          <h1 className="mt-1.5 text-center text-[30px] font-semibold leading-[1.15] tracking-[-0.02em]">Sign up or log in using your phone number</h1>
          <form className="mt-8" onSubmit={(e) => { e.preventDefault(); if (digits.length === 10) sendCode(); }}>
            <label className="flex h-[62px] items-center gap-3 rounded-[18px] bg-white px-5 ring-1 ring-line focus-within:ring-2 focus-within:ring-ink/80">
              <span className="text-[22px]" aria-hidden>🇺🇸</span>
              <span className="text-[18px]">+1</span>
              <input
                inputMode="numeric" autoComplete="tel-national" aria-label="Phone number" placeholder="Phone number"
                value={formatNational(digits)} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^1(?=\d{10})/, "").slice(0, 10))}
                className="h-full flex-1 bg-transparent text-[18px] outline-none placeholder:text-faint"
              />
            </label>
            {error && <p className="mt-3 text-center text-[14px] text-red-600">{error}</p>}
            <button type="submit" disabled={digits.length !== 10 || busy} className="btn-ink mt-4">{busy ? "Sending…" : "Continue"}</button>
          </form>
          <Terms />
          <Link href={`/${slug}`} className="mt-auto pt-10 text-center text-[16px] underline underline-offset-4">Continue as guest</Link>
        </div>
      )}

      {step === "code" && (
        <div className="flex flex-1 flex-col animate-rise">
          <h1 className="mt-[16vh] text-center text-[30px] font-semibold tracking-[-0.02em]">Enter the code we texted you</h1>
          <p className="mt-2 text-center text-[15.5px] text-faint">We sent it to {e164.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3")}</p>
          <form className="mt-8" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) verify(code); }}>
            <div className="relative rounded-[18px] bg-white py-5 ring-1 ring-line" onClick={() => codeRef.current?.focus()}>
              <div className="flex justify-center gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className={`grid h-9 w-8 place-items-end justify-center border-b-2 pb-1 text-[24px] tabular-nums ${i === code.length ? "border-ink" : "border-line"}`}>{code[i] ?? ""}</span>
                ))}
              </div>
              <input
                ref={codeRef} inputMode="numeric" autoComplete="one-time-code" aria-label="Code" value={code}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) verify(v); }}
                className="absolute inset-0 h-full w-full opacity-0"
              />
            </div>
            {demo && <p className="mt-3 text-center text-[13px] text-faint">Demo clinic: any 6 digits work.</p>}
            {error && <p className="mt-3 text-center text-[14px] text-red-600">{error}</p>}
            <button type="submit" disabled={code.length !== 6 || busy} className="btn-ink mt-4">{busy ? "Checking…" : "Continue"}</button>
          </form>
          <Terms />
          <div className="mt-10 flex items-center justify-between">
            <button type="button" disabled={wait > 0 || busy} onClick={sendCode}
              className="h-11 rounded-full bg-tint px-5 text-[15px] font-medium text-brand disabled:opacity-60">Resend code</button>
            {wait > 0 && <Countdown left={wait} />}
          </div>
          <button type="button" onClick={() => { setStep("phone"); setError(null); }} className="mt-6 text-center text-[14.5px] text-sub">Use a different number</button>
        </div>
      )}

      {step === "name" && (
        <form className="flex flex-1 flex-col animate-rise" onSubmit={(e) => { e.preventDefault(); if (first.trim()) saveName(); }}>
          <h1 className="mt-[14vh] text-center text-[30px] font-semibold tracking-[-0.02em]">What&apos;s your name?</h1>
          <p className="mt-2 text-center text-[15.5px] text-faint">So {clinicName} knows who&apos;s coming in.</p>
          <input className="field mt-8" placeholder="First name" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
          <input className="field mt-3" placeholder="Last name" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
          <button type="submit" disabled={!first.trim() || busy} className="btn-ink mt-5">{busy ? "Saving…" : "Continue"}</button>
        </form>
      )}
    </div>
  );
}

function Terms() {
  return (
    <p className="mt-5 text-center text-[14px] text-faint">
      I agree to <a className="text-ink" href="https://www.atlas-engine.app/legal/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> &amp; <a className="text-ink" href="https://www.atlas-engine.app/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
    </p>
  );
}

function Countdown({ left }: { left: number }) {
  const r = 11, c = 2 * Math.PI * r;
  return (
    <span className="flex items-center gap-2.5 text-[16px] tabular-nums">
      <svg viewBox="0 0 28 28" className="h-7 w-7 -rotate-90" aria-hidden>
        <circle cx="14" cy="14" r={r} fill="none" stroke="#E6E8EA" strokeWidth="3" />
        <circle cx="14" cy="14" r={r} fill="none" stroke="#171B26" strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - left / RESEND_SECONDS)} strokeLinecap="round" />
      </svg>
      00:{String(left).padStart(2, "0")}
    </span>
  );
}

function formatNational(d: string) {
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("expired") || m.includes("invalid")) return "That code didn't work. Check it, or tap Resend code.";
  if (m.includes("rate") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  if (m.includes("phone") && m.includes("provider")) return "Text sign-in isn't switched on yet. Please ask the clinic.";
  return msg;
}
