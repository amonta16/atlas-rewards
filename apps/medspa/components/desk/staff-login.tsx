"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@atlas/core/supabase/client";
import { Wordmark } from "../chrome";

/** Staff sign-in: the same email + password as the manager portal. */
export function StaffLogin({ slug, clinicName, logoUrl }: { slug: string; clinicName: string; logoUrl: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setError(/invalid/i.test(error.message) ? "That email and password don't match." : error.message); return; }
    router.replace(`/${slug}/desk`); router.refresh();
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#F4F5F7] px-6">
      <form onSubmit={submit} className="w-full max-w-[400px] rounded-[28px] bg-white p-8 shadow-[0_24px_60px_-30px_rgba(23,27,38,.35)]">
        <div className="text-center"><Wordmark name={clinicName} logoUrl={logoUrl} size="lg" /></div>
        <p className="mt-6 text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-faint">Front desk</p>
        <h1 className="mt-1 text-center text-[24px] font-semibold tracking-[-0.02em]">Staff sign in</h1>
        <input className="field mt-7" type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="field mt-3" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="mt-3 text-center text-[14px] text-red-600">{error}</p>}
        <button type="submit" className="btn-ink mt-5" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="mt-5 text-center text-[13px] text-sub">Use the same login as your manager portal.</p>
      </form>
    </div>
  );
}
