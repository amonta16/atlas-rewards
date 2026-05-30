"use client";
/**
 * ConfirmDeleteModal — CP-40
 *
 * Generic "type DELETE to confirm" modal. Used by:
 *   • agency dashboard → delete a business
 *   • customer profile → delete own account
 *
 * Keep it boring on purpose. Destructive UI should feel deliberate.
 */
import { useState } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConfirmDeleteModal({
  title,
  description,
  detail,
  confirmWord = "DELETE",
  destructiveLabel = "Delete",
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  detail?: React.ReactNode;
  confirmWord?: string;
  destructiveLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const match = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  async function go() {
    if (!match) return;
    setBusy(true); setErr(null);
    try {
      await onConfirm();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 pt-5 pb-3 flex items-start justify-between border-b border-rose-100 bg-rose-50">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-rose-900">{title}</h2>
              <p className="text-sm text-rose-800 mt-1">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white hover:bg-zinc-100 flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        {detail && (
          <div className="px-5 py-3 text-sm text-zinc-700 border-b">
            {detail}
          </div>
        )}

        <div className="px-5 py-4 space-y-3">
          <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500">
            Type <span className="font-mono text-rose-600">{confirmWord}</span> to confirm
          </label>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmWord}
            className={"font-mono tracking-wider " + (match ? "ring-2 ring-rose-500" : "")}
          />
          {err && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
              {err}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3 bg-zinc-50">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2"
          >
            Cancel
          </button>
          <Button
            onClick={go}
            disabled={!match || busy}
            className="rounded-full px-5 text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting…</>
            ) : (
              destructiveLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
