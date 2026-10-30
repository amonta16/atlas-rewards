"use client";
/**
 * Forgot-password — CP-47
 *
 * Sustainable account recovery so members never lose their points because
 * they forgot a password. Sends a Supabase password-reset email that links
 * back to /<slug>/reset-password. Works for customers AND staff (same
 * auth.users table). Requires SMTP configured in Supabase (see README) —
 * until then Supabase's built-in low-volume sender is used.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MailCheck, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [base, setBase] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setBase(window.location.pathname.replace(/\/forgot-password\/?$/, ""));
    const pre = new URLSearchParams(window.location.search).get("email");
    if (pre) setEmail(pre);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("Enter a valid email address."); return;
    }
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}${base}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    // Always show success even if the email isn't on file — don't leak which
    // addresses have accounts.
    setSent(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <Link href={`${base}/login`} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>

        {sent ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <MailCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-emerald-900">Check your inbox</div>
              <p className="text-xs text-emerald-700 mt-0.5 leading-snug">
                If <strong>{email}</strong> has an account, we just sent a reset link. Open it to choose a new password. The link expires after a short while.
              </p>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your email and we'll send you a link to set a new password.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="pl-9" required autoFocus />
                </div>
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
