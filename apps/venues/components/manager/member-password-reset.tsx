"use client";
/**
 * MemberPasswordReset — CP-48
 *
 * Front-desk account recovery inside the member panel. A staff member can
 * set a NEW password for this member and share it. The CURRENT password is
 * never shown — Supabase stores a one-way hash, so it's unrecoverable; we
 * say so plainly rather than pretend otherwise.
 */
import { useState } from "react";
import { KeyRound, RefreshCw, Copy, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MemberPasswordReset({
  userId, email, primary,
}: { userId: string; email: string | null; primary: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function reset() {
    if (password && password.trim().length < 8) {
      setErr("Password must be at least 8 characters."); return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/team/reset-member-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, password: password.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "could not reset password");
      setResult(json.password as string);
    } catch (e: any) {
      setErr(e?.message ?? "Could not reset password");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  }

  return (
    <div className="mt-4 rounded-2xl border bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        <KeyRound className="h-4 w-4" style={{ color: primary }} />
        <span className="font-semibold text-sm">Account access</span>
        <span className="ml-auto text-[11px] text-zinc-400">{open ? "Hide" : "Reset password"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {result ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[11px] uppercase tracking-widest font-bold text-emerald-700">New password</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 font-mono text-sm text-emerald-900 select-all break-all">{result}</code>
                <button onClick={copy} className="h-8 w-8 rounded-md hover:bg-emerald-100 flex items-center justify-center text-emerald-700" aria-label="Copy">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-emerald-700 mt-2 leading-snug">
                Share this with {email ?? "the member"}. They sign in with their email + this password and can change it later. Shown once.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-800 leading-snug">
                  The current password can't be shown — it's stored encrypted (hashed), so no one can read it back. You can set a new one here.
                </p>
              </div>
              <div className="relative">
                <Input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                  className="pr-10 h-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setPassword(`Atlas-${Math.random().toString(36).slice(2, 4)}${Math.floor(100 + Math.random() * 900)}${Math.random().toString(36).slice(2, 4)}`)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-500"
                  aria-label="Generate"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button onClick={reset} disabled={busy} className="w-full" style={{ background: primary }}>
                {busy ? "Setting…" : "Set new password"}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
