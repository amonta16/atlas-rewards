"use client";
/**
 * RequestDeleteModal — CP-62
 *
 * Shown to a VA (agency_va) in place of the hard-delete confirm dialog. A VA
 * can't delete a business directly; they file a request with a REQUIRED
 * reason note that an agency_admin reviews on the Apps page. The note is
 * enforced both here (client) and in request_business_delete (server).
 */
import { useState } from "react";
import { X, AlertTriangle, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

export function RequestDeleteModal({
  business,
  rootDomain,
  alreadyPending,
  onClose,
  onConfirm,
}: {
  business: Business;
  rootDomain: string;
  /** True if this business already has a pending request from this VA. */
  alreadyPending?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < 3;

  async function submit() {
    if (tooShort || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Request deletion
          </h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-600">
            You don't have permission to delete a business. This sends a request
            to an admin, who can approve or decline it.
          </p>

          <div className="rounded-lg bg-zinc-50 border p-3 text-xs space-y-1">
            <div><strong>Business:</strong> {business.name}</div>
            <div><strong>Slug:</strong> <code>{business.slug}.{rootDomain}</code></div>
          </div>

          {alreadyPending && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              There's already a pending request for this business. Submitting
              again will update it with your new reason.
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Reason for deleting <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Client cancelled their contract on July 1 — offboarding."
              rows={4}
              autoFocus
              className="mt-1 w-full rounded-lg border p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="text-[11px] text-zinc-400 mt-1">
              Required — the admin sees this when reviewing your request.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button
            onClick={submit}
            disabled={tooShort || busy}
            className="rounded-full px-5 bg-amber-500 hover:bg-amber-600 text-white"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" /> Send request</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
