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
import { Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // CP-37.2 — magic-link state.
  const [linkSending, setLinkSending] = useState(false);
  const [linkSent, setLinkSent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const prefill = q.get("email");
    if (prefill) setEmail(prefill);
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
    router.push(next && next.startsWith("/") ? next : "/agency");
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
    const dest = next && next.startsWith("/") ? next : "/agency";
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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Agency login</CardTitle>
        <CardDescription>Sign in with the agency-admin account you created in Supabase.</CardDescription>
      </CardHeader>
      <CardContent>
        {linkSent && (
          <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-3 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-sky-900">Sign-in link sent</div>
              <p className="text-xs text-sky-700 mt-0.5 leading-snug">
                Check <strong>{linkSent}</strong> — tap the link in the email to sign in. You can close this tab.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        </form>

        {/* CP-37.2 — one-tap rescue for invited managers / forgot password. */}
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
            Forgot password, or signed in via invite? Tap above — we'll email you a one-time sign-in link.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
