"use client";
/**
 * Reset-password — CP-47, fixed in CP-139.
 *
 * THE BUG (reported Sep 2026: "they got the email, the link didn't work").
 * ---------------------------------------------------------------------
 * This page used to assume the Supabase browser client would pick the
 * recovery token out of the URL by itself, and simply waited two seconds
 * for a session to appear:
 *
 *     supabase.auth.getSession().then(...)          // nothing to find
 *     else setTimeout(() => setChecking(false), 2000)
 *     → "This reset link has expired"
 *
 * It doesn't. `createBrowserClient` from @supabase/ssr runs the PKCE flow,
 * where the emailed link lands here carrying `?code=<auth code>` — and that
 * code has to be handed to `exchangeCodeForSession()` explicitly. Nothing in
 * this codebase ever called it (grep: zero hits), so the code sat unread in
 * the query string, no session was ever created, and EVERY reset link
 * reported itself expired. The email was never the problem.
 *
 * THE FIX. Consume the link, whichever of the three shapes Supabase sends —
 * which one you get depends on the project's email template, so all three
 * are handled rather than guessed at:
 *
 *   ?code=…                        → exchangeCodeForSession   (PKCE, current)
 *   ?token_hash=…&type=recovery    → verifyOtp                ({{ .TokenHash }})
 *   #access_token=…&refresh_token= → setSession               (legacy implicit)
 *
 * The URL is scrubbed afterwards so a shoulder-surfer or a shared browser
 * history can't replay the token.
 *
 * KNOWN LIMIT of the `?code=` shape: PKCE stores its verifier in the browser
 * that ASKED for the reset. Request it on your phone, open the mail on a
 * laptop, and the exchange cannot succeed — that is the flow working as
 * designed, not a bug here. We detect it and say so in plain words instead
 * of blaming the link. Moving the email template to {{ .TokenHash }} removes
 * the limitation entirely; see the CP-139 README.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Failure = "expired" | "wrong_device" | null;

export default function ResetPassword() {
  const router = useRouter();
  const [base, setBase] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [failure, setFailure] = useState<Failure>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBase(window.location.pathname.replace(/\/reset-password\/?$/, ""));
    const supabase = createClient();
    let cancelled = false;

    /** Drop the token from the address bar once it has been used. */
    function scrubUrl() {
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch { /* non-fatal */ }
    }

    (async () => {
      // Already signed in from a previous step? Nothing to exchange.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) { setReady(true); setChecking(false); }
        return;
      }

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: (type as "recovery") || "recovery",
          });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          // No token of any shape — they navigated here directly.
          if (!cancelled) { setFailure("expired"); setChecking(false); }
          return;
        }
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? "";
        // The PKCE verifier lives in the browser that requested the reset.
        if (!cancelled) {
          setFailure(/verifier|code challenge|both auth code and code verifier/i.test(msg)
            ? "wrong_device"
            : "expired");
          setChecking(false);
        }
        scrubUrl();
        return;
      }

      scrubUrl();
      const { data: after } = await supabase.auth.getSession();
      if (cancelled) return;
      if (after.session) { setReady(true); setChecking(false); }
      else { setFailure("expired"); setChecking(false); }
    })();

    return () => { cancelled = true; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setErr("Use at least 8 characters."); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setSaving(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(() => router.push(`${base}/login`), 1900);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-bold mt-3">Password updated</h1>
            <p className="text-sm text-muted-foreground mt-1">Taking you to sign in…</p>
          </div>
        ) : checking ? (
          <div className="text-center py-6 text-sm text-muted-foreground">Verifying your reset link…</div>
        ) : !ready && failure === "wrong_device" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <Smartphone className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900">Open the link on the same device</div>
              <p className="text-xs text-amber-700 mt-0.5 leading-snug">
                For security, a reset link only works in the browser that asked for it. Open this email on the
                phone or computer where you requested the reset — or{" "}
                <Link href={`${base}/forgot-password`} className="font-semibold underline">request a new link</Link>{" "}
                from the device you&apos;re on now.
              </p>
            </div>
          </div>
        ) : !ready ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-amber-900">This reset link has expired</div>
              <p className="text-xs text-amber-700 mt-0.5 leading-snug">
                Reset links are single-use and time-limited. Request a fresh one from the{" "}
                <Link href={`${base}/forgot-password`} className="font-semibold underline">forgot-password page</Link>.
              </p>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
            <p className="text-sm text-muted-foreground mt-1">Pick something you&apos;ll remember — you can change it later from your profile.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="pl-9" required minLength={8} autoFocus autoComplete="new-password" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="pl-9" required minLength={8} autoComplete="new-password" />
                </div>
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Update password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
