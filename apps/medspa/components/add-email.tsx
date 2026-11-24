"use client";
/**
 * components/add-email.tsx — CP-272 · "Add your email" on the Profile tab, for patients who joined before the
 * sign-up step asked for it (or signed in by phone on another clinic's app). Saves to profiles.email, which
 * is where the clinic's email automations send receipts, rewards and offers. The patient's own row only
 * (RLS profiles_self); the demo clinic keeps it in its demo cookie instead.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@atlas/core/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AddEmail({ clinicName, demo }: { clinicName: string; demo: boolean }) {
  const router = useRouter();
  const [mail, setMail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const address = mail.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) { setError("Please enter a valid email address."); return; }
    setBusy(true); setError(null);
    try {
      if (demo) {
        await fetch("/api/demo-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: address }) });
      } else {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Please sign in again.");
        const { error: err } = await supabase.from("profiles").update({ email: address }).eq("id", user.id);
        if (err) throw new Error("We couldn't save that just now. Please try again.");
      }
      router.refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-4 mt-3 rounded-card bg-white p-5 shadow-card">
      <p className="text-[17px] font-semibold leading-tight">Add your email</p>
      <p className="mt-1 text-[14px] leading-snug text-sub">Get your receipts, rewards and offers from {clinicName}. Unsubscribe anytime.</p>
      <div className="mt-3.5 flex gap-2">
        <input className="field min-w-0 flex-1" type="email" inputMode="email" autoComplete="email" placeholder="you@email.com"
          value={mail} onChange={(e) => { setMail(e.target.value); setError(null); }} aria-label="Email" />
        <button type="submit" disabled={busy || !mail.trim()} className="btn-ink !w-auto shrink-0 px-5">{busy ? "Saving…" : "Save"}</button>
      </div>
      {error && <p className="mt-2 text-[13.5px] text-red-600">{error}</p>}
    </form>
  );
}
