"use client";
/**
 * Reset-password — CP-47
 *
 * Landing page for the Supabase password-reset email link. The @supabase/ssr
 * browser client exchanges the recovery token in the URL for a session
 * automatically; we wait for that session (via onAuthStateChange + getSession),
 * then let the user set a new password with updateUser({ password }).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPassword() {
  const router = useRouter();
  const [base, setBase] = useState("");
  const [ready, setReady] = useState(false);   // recovery session established
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBase(window.location.pathname.replace(/\/reset-password\/?$/, ""));
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setReady(true); setChecking(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setReady(true); setChecking(false); }
      // Give the URL token exchange a moment before declaring the link bad.
      else setTimeout(() => setChecking(false), 2000);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
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
            <p className="text-sm text-muted-foreground mt-1">Pick something you'll remember — you can change it later from your profile.</p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="pl-9" required minLength={6} autoFocus />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Confirm new password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="pl-9" required minLength={6} />
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
