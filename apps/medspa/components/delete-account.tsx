"use client";
/** Profile row: delete the account inside the app (Apple 5.1.1(v), Google Play). The example clinic only resets its demo sign-in. */
import { useState } from "react";
import { forgetNativePush } from "@/lib/push-client";
import { IcTrash } from "./icons";
import { Portal } from "./portal";

export function DeleteAccountRow({ demo }: { demo: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === "DELETE";

  function close() {
    if (busy) return;
    setOpen(false); setTyped(""); setError(null);
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      if (!demo) {
        const res = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "We couldn't delete your account just now. Please try again.");
        forgetNativePush();
      }
      setDone(true);
    } catch (x) {
      setError(x instanceof TypeError ? "No connection. Please try again." : (x as Error).message);
    }
    setBusy(false);
  }

  return (
    <li>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 px-4 py-4 text-left text-red-600">
        <IcTrash className="h-5 w-5" />
        <span className="flex-1 text-[15.5px] font-medium">Delete account</span>
      </button>
      {open && (
        <Portal>
          <div className="fixed inset-0 z-[70] grid animate-fade place-items-center overflow-y-auto bg-black/45 px-6 py-8" onClick={done ? undefined : close}>
            <div role="dialog" aria-modal aria-labelledby="delete-title" className="w-full max-w-sm animate-rise rounded-[22px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              {done ? (
                <>
                  <h2 id="delete-title" className="text-[22px] font-semibold tracking-[-0.015em]">Account deleted</h2>
                  <p className="mt-2 text-[15px] leading-snug text-sub">{demo ? "Demo clinic: your demo sign-in has been reset." : "Your account has been permanently deleted."}</p>
                  <button type="button" className="btn-ink mt-5" onClick={() => window.location.replace("/auth/signout")}>Done</button>
                </>
              ) : (
                <form onSubmit={remove}>
                  <h2 id="delete-title" className="text-[22px] font-semibold tracking-[-0.015em]">Delete account</h2>
                  <p className="mt-2 text-[15px] leading-snug text-sub">This permanently deletes your account, including your memberships and points at every clinic and at any AE Rewards business. It can&apos;t be undone.</p>
                  <p className="mt-2 text-[13.5px] leading-snug text-faint">Your clinic may keep records it&apos;s required to by law.</p>
                  <label className="mt-4 block text-[14px] text-sub" htmlFor="delete-confirm">Type DELETE to confirm</label>
                  <input id="delete-confirm" className="field mt-2" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} value={typed} onChange={(e) => { setTyped(e.target.value); setError(null); }} />
                  {error && <p role="alert" className="mt-3 text-[14px] text-red-600">{error}</p>}
                  <button type="submit" disabled={!ready || busy} className="btn-ink mt-4 !bg-red-600 disabled:!bg-[#B4B8C2]">{busy ? "Deleting…" : "Delete my account"}</button>
                  <button type="button" disabled={busy} onClick={close} className="mt-2 h-11 w-full text-[16px] text-sub">Cancel</button>
                </form>
              )}
            </div>
          </div>
        </Portal>
      )}
    </li>
  );
}
