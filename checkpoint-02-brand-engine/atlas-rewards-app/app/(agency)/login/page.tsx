"use client";
/**
 * Agency login — CP-37.2 revision.
 *
 * Adds the same magic-link rescue + smarter error mapping that the
 * customer login got in CP-37.1, scoped for the agency surface.
 * Resolves the "admin/manager/front-desk all get Invalid login
 * credentials" wave Andrew reported. Root causes covered here:
 *
 *   • Invited team members where Supabase has Confirm-email on:
 *     signUp ran, password was set, but the user never tapped the
 *     confirmation link → signInWithPassword fails with the same
 *     generic error as a wrong password. The magic-link button
 *     auto-confirms the email AND signs them in in one tap.
 *
 *   • Anyone who forgot their password — same button works.
 *
 *   • Andrew's own account if the password he's typing is just
 *     wrong: at least the error now says "if you signed up via
 *     invite or forgot your password, tap below" instead of a
 *     dead-end "Invalid login credentials".
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/utils";
import { interClass } from "@/lib/landing/font";
import { AuthGrain } from "@/components/auth/auth-grain";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // CP-37.2 — magic-link state.
  const [linkSending, setLinkSending] = useState(false);
  const [linkSent, setLinkSent] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const prefill = q.get("email");
    if (prefill) setEmail(prefill);
    // CP-142: /auth/confirm sends people back here with a reason when a
    // sign-in link can't be used. Say which, in plain words — "wrong
    // browser" in particular is not something anyone guesses.
    const reason = q.get("error");
    if (reason === "link-expired") {
      setErr("That sign-in link has expired or was already used. Tap the button below for a fresh one.");
    } else if (reason === "wrong-browser") {
      setErr("That link has to be opened in the same browser you requested it from. Request a new one here and open it on this device.");
    } else if (reason === "missing-token") {
      setErr("That link was incomplete. Tap the button below to send a new one.");
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("email not confirmed")) {
        setErr("Email not confirmed yet. Check your inbox for the confirmation link, or tap \"Send me a sign-in link\" below.");
      } else if (msg.includes("invalid login")) {
        setErr("Wrong email or password. If you signed up via invite or forgot your password, tap \"Send me a sign-in link\" below.");
      } else {
        setErr(error.message);
      }
      setLoading(false);
      return;
    }
    let next: string | null = null;
    if (typeof window !== "undefined") {
      next = new URLSearchParams(window.location.search).get("next");
    }
    router.push(safeRedirect(next, "/agency"));
    router.refresh();
  }

  async function sendMagicLink() {
    if (!email) {
      setErr("Enter your email first, then tap the sign-in link button.");
      return;
    }
    setLinkSending(true);
    setErr(null);
    const supabase = createClient();
    // Pass through any ?next so the magic-link redirect lands on
    // /agency (or the deep-link the user originally tried to reach).
    let next: string | null = null;
    if (typeof window !== "undefined") {
      next = new URLSearchParams(window.location.search).get("next");
    }
    const dest = safeRedirect(next, "/agency");
    // CP-142: land on /auth/confirm, NOT on dest directly. dest is behind a
    // server-rendered gate that redirects before any browser code runs, so
    // pointing the link there meant the token was never exchanged and the
    // redirect dropped it — the button could never work. /auth/confirm
    // exchanges the token server-side first, then forwards to dest.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm?next=${encodeURIComponent(dest)}`
            : undefined,
      },
    });
    setLinkSending(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setLinkSent(email);
  }

  // CP-178: Atlas-branded dark sign-in (deep ocean + champagne).
  const field =
    "h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-11 pr-4 text-[15px] text-white placeholder:text-slate-500 outline-none transition focus:border-sky-400/70 focus:bg-white/[0.06] focus:ring-4 focus:ring-sky-400/15";
  return (
    <div className="w-full max-w-[400px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="mx-auto h-10 w-auto lg:hidden" />
      <h1 className="mt-6 text-center text-[2.1rem] font-medium tracking-[-0.03em] text-white lg:mt-0">Welcome back</h1>
      <p className="mt-2 text-center text-[15px] text-slate-400">Sign in to Atlas Command</p>

      {linkSent && (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3.5">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <div className="text-sm">
            <div className="font-semibold text-sky-100">Sign-in link sent</div>
            <p className="mt-0.5 text-xs leading-snug text-sky-200/80">
              Check <strong>{linkSent}</strong> and tap the link in the email to sign in. You can close this tab.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-9 space-y-5">
        <div>
          <label htmlFor="email" className="text-sm font-semibold text-slate-200">Email</label>
          <div className="relative mt-2">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input id="email" type="email" autoComplete="email" placeholder="you@atlas-engine.app" value={email} onChange={e => setEmail(e.target.value)} required className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-semibold text-slate-200">Password</label>
          <div className="relative mt-2">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input id="password" type={showPw ? "text" : "password"} autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className={`${field} pr-12`} />
            <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 transition-colors hover:text-slate-200">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {err && <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}
        <button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-b from-[#f3e6c4] via-[#e8d5a8] to-[#d6bd85] text-[15px] font-semibold text-[#0a1424] shadow-[0_1px_0_rgba(255,255,255,.6)_inset,0_18px_40px_-16px_rgba(232,213,168,.55)] transition hover:brightness-105 active:translate-y-px disabled:opacity-60">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {/* CP-37.2 — one-tap rescue for invited managers / forgot password. */}
      <div className="mt-8 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-xs text-slate-500">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <button
        type="button"
        onClick={sendMagicLink}
        disabled={linkSending || !email}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-50"
      >
        <Mail className="h-4 w-4" />
        {linkSending ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="mt-3 text-center text-xs leading-snug text-slate-500">
        Forgot your password, or joined from an invite? Enter your email and we&apos;ll send a one-time link.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className={`${interClass} min-h-[100dvh] bg-[#0b111c] antialiased lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]`}>
      <aside
        className="relative isolate hidden overflow-hidden lg:flex"
        style={{
          background: [
            "radial-gradient(60% 45% at 15% 90%, rgba(14,116,233,0.75), transparent 65%)",
            "radial-gradient(50% 40% at 85% 15%, rgba(28,111,159,0.6), transparent 60%)",
            "radial-gradient(40% 30% at 70% 70%, rgba(232,213,168,0.16), transparent 70%)",
            "linear-gradient(170deg, #020a16 0%, #041427 40%, #062a44 75%, #0a3d62 100%)",
          ].join(", "),
        }}
      >
        <svg aria-hidden className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <line x1="-10" y1="62" x2="85" y2="20" stroke="white" strokeOpacity="0.14" strokeWidth="0.12" />
          <line x1="-10" y1="80" x2="95" y2="34" stroke="white" strokeOpacity="0.1" strokeWidth="0.12" />
        </svg>
        <AuthGrain opacity={0.12} />
        <div className="relative z-10 flex w-full flex-col justify-center px-16">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-11 w-auto" />
            <span className="text-[2.4rem] font-medium tracking-[-0.03em] text-white">Atlas Engine</span>
          </div>
          <div className="mt-7 h-0.5 w-11 rounded-full bg-[#e8d5a8]" />
          <p className="mt-7 max-w-sm text-lg leading-relaxed text-slate-300">The repeat-visit engine for entertainment venues.</p>
          <p className="absolute bottom-8 left-16 text-xs tracking-wide text-slate-500">Agency, VA and manager access</p>
        </div>
      </aside>
      <section className="relative flex min-h-[100dvh] items-center justify-center px-5 py-12 sm:px-8">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_0%,rgba(28,111,159,0.25),transparent_70%)] lg:hidden" />
        <div className="relative w-full flex justify-center">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
