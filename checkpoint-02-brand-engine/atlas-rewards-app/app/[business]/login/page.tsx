"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Customer login — CP-37.1 revision.
 *
 * Two new affordances on top of the original password-only form:
 *
 *   1. ?confirm=1 banner. The signup page now redirects here with
 *      ?confirm=1 when Supabase is configured to require email
 *      confirmation. Customers used to be silently dropped at /app
 *      with a half-built account; now they see a clear "Check your
 *      inbox" banner so they know to confirm before signing in.
 *
 *   2. "Send me a sign-in link" button. Anyone who can't remember
 *      their password — or who was created via invite / magic-link
 *      and never set one — can tap this and Supabase will email
 *      them a one-time sign-in link.  Resolves the wave of "I
 *      created an account but can't log in" reports.
 */
export default function CustomerLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // CP-37.1 — confirm-email banner shown when ?confirm=1 is set.
  const [showConfirmBanner, setShowConfirmBanner] = useState(false);
  // CP-37.1 — magic-link flow state.
  const [linkSending, setLinkSending] = useState(false);
  const [linkSent, setLinkSent] = useState<string | null>(null);

  // Pre-fill email + read ?confirm=1 from the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const prefill = sp.get("email");
    if (prefill) setEmail(prefill);
    if (sp.get("confirm") === "1") setShowConfirmBanner(true);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // CP-37.1 — surface the most common Supabase auth errors in
      // language a customer can actually act on, instead of "Invalid
      // login credentials" for every failure mode.
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("email not confirmed")) {
        setErr("Your email hasn't been confirmed yet. Check your inbox for the confirmation link, or tap \"Send me a sign-in link\" below.");
      } else if (msg.includes("invalid login")) {
        setErr("Wrong email or password. If you signed up via an invite, you may not have a password yet — tap \"Send me a sign-in link\" below.");
      } else {
        setErr(error.message);
      }
      setLoading(false);
      return;
    }
    // CP-37.5: honor ?next=/<path> so manager / front-desk invite links
    // (which always include ?next=/<slug>/manage) land on the right
    // surface. Customer signups arrive without ?next= and still get
    // /app as the default.
    let next: string | null = null;
    if (typeof window !== "undefined") {
      next = new URLSearchParams(window.location.search).get("next");
    }
    router.push(next && next.startsWith("/") ? next : "/app");
    router.refresh();
  }

  // CP-37.1 — magic-link fallback. Works whether or not the user has
  // a password set, AND auto-confirms the email if Supabase Auth has
  // confirmation enabled — so this is a one-button rescue for every
  // common signup-broke-mid-way failure mode.
  async function sendMagicLink() {
    if (!email) {
      setErr("Enter your email first, then tap the sign-in link button.");
      return;
    }
    setLinkSending(true);
    setErr(null);
    const supabase = createClient();
    // CP-37.5: pass ?next through to the magic-link redirect so the
    // post-confirm landing is /<slug>/manage for managers / front-desk.
    let next: string | null = null;
    if (typeof window !== "undefined") {
      next = new URLSearchParams(window.location.search).get("next");
    }
    const dest = next && next.startsWith("/") ? next : "/app";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}${dest}`
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

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-1">Sign in to check your points and rewards.</p>

        {showConfirmBanner && !linkSent && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-emerald-900">Almost there — check your inbox</div>
              <p className="text-xs text-emerald-700 mt-0.5 leading-snug">
                We sent you a confirmation link. Tap it to finish creating your account, then come back here to sign in.
              </p>
            </div>
          </div>
        )}

        {linkSent && (
          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-sky-900">Sign-in link sent</div>
              <p className="text-xs text-sky-700 mt-0.5 leading-snug">
                Check <strong>{linkSent}</strong> — tap the link in the email to sign in. You can close this tab.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        </form>

        {/* CP-37.1: one-tap rescue. */}
        <div className="mt-4 pt-4 border-t">
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={linkSending || !email}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-zinc-700 hover:text-zinc-900 disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            {linkSending ? "Sending…" : "Send me a sign-in link instead"}
          </button>
          <p className="text-[11px] text-zinc-500 text-center mt-1.5 leading-snug">
            Forgot your password, or signed up via invite? Tap above — we'll email you a one-time sign-in link.
          </p>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-4">
          New here? <Link href="/signup" className="font-semibold text-brand-primary">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
