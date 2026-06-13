"use client";
/**
 * FrontDeskKeypad — CP-49
 *
 * Full-screen branded PIN pad. Shows the business logo + name over a
 * gradient of the business's brand colors, a 4-dot PIN display, and a
 * 0–9 keypad. Entering the 4th digit auto-submits to /api/frontdesk/login;
 * on success we land in the front-desk view. Wrong PIN shakes + clears.
 *
 * Deliberately spare: this is an in-store device, tapped by staff who
 * just want to get to the desk. No email, no password, no "forgot" flow.
 */
import { useCallback, useEffect, useState } from "react";
import { Delete, Loader2, ShieldCheck } from "lucide-react";

const PIN_LENGTH = 4;

export function FrontDeskKeypad({
  slug, name, logoUrl, primary, secondary,
}: {
  slug: string;
  name: string;
  logoUrl: string | null;
  primary: string;
  secondary: string;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const submit = useCallback(async (code: string) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/frontdesk/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, pin: code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "That PIN didn't match. Try again.");
        setShake(true);
        setPin("");
        setBusy(false);
        setTimeout(() => setShake(false), 500);
        return;
      }
      // Hard navigation so the new session cookie is picked up everywhere.
      window.location.assign(json.redirect ?? `/${slug}/manage`);
    } catch {
      setErr("Network error — check your connection and try again.");
      setShake(true);
      setPin("");
      setBusy(false);
      setTimeout(() => setShake(false), 500);
    }
  }, [slug]);

  const press = useCallback((digit: string) => {
    if (busy) return;
    setErr(null);
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + digit;
      if (next.length === PIN_LENGTH) submit(next);
      return next;
    });
  }, [busy, submit]);

  const backspace = useCallback(() => {
    if (busy) return;
    setErr(null);
    setPin(prev => prev.slice(0, -1));
  }, [busy]);

  // Physical keyboard support (USB number pad at the desk).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") backspace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, backspace]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10 select-none"
      style={{ background: `linear-gradient(160deg, ${primary} 0%, ${secondary} 100%)` }}
    >
      {/* Brand header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="h-20 w-20 rounded-3xl bg-white/95 shadow-xl flex items-center justify-center overflow-hidden ring-4 ring-white/30">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoUrl} alt={name} className="h-full w-full object-contain p-2" />
          ) : (
            <span className="text-3xl font-black" style={{ color: primary }}>
              {name?.[0]?.toUpperCase() ?? "A"}
            </span>
          )}
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-white drop-shadow-sm">{name}</h1>
        <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-white/85">
          <ShieldCheck className="h-3.5 w-3.5" /> Front desk
        </div>
      </div>

      {/* PIN dots */}
      <div className={`flex items-center gap-4 mb-2 ${shake ? "animate-[shake_0.4s]" : ""}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className="h-4 w-4 rounded-full transition-all"
            style={{
              background: i < pin.length ? "#fff" : "rgba(255,255,255,0.25)",
              boxShadow: i < pin.length ? "0 0 12px rgba(255,255,255,0.8)" : "none",
              transform: i < pin.length ? "scale(1.1)" : "scale(1)",
            }}
          />
        ))}
      </div>

      <div className="h-6 mb-4 text-center">
        {busy ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/90">
            <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
          </span>
        ) : err ? (
          <span className="text-sm font-semibold text-white">{err}</span>
        ) : (
          <span className="text-sm text-white/70">Enter your PIN to start</span>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3.5 w-full max-w-[280px]">
        {keys.map(k => (
          <KeypadButton key={k} onClick={() => press(k)} disabled={busy}>
            {k}
          </KeypadButton>
        ))}
        <div /> {/* spacer */}
        <KeypadButton onClick={() => press("0")} disabled={busy}>0</KeypadButton>
        <KeypadButton onClick={backspace} disabled={busy} aria-label="Delete">
          <Delete className="h-6 w-6 mx-auto" />
        </KeypadButton>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </main>
  );
}

function KeypadButton({
  children, onClick, disabled, ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="aspect-square rounded-2xl bg-white/15 backdrop-blur-sm text-white text-2xl font-bold flex items-center justify-center ring-1 ring-white/20 transition active:scale-95 active:bg-white/30 disabled:opacity-50"
      {...rest}
    >
      {children}
    </button>
  );
}
