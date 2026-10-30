"use client";
/**
 * DeleteRequestsPanel — CP-62
 *
 * Admin-only panel pinned to the top of the Apps deck. Lists pending
 * business-deletion requests filed by VAs. Approving runs the real delete
 * (approve_business_delete → cascade) and tells the parent to drop the tile;
 * rejecting closes the request with an optional note.
 */
import { useState } from "react";
import { AlertTriangle, Trash2, X, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

export type DeleteRequest = {
  id: string;
  business_id: string | null;
  business_name: string;
  business_slug: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_by: string | null;
  requested_by_email: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

export function DeleteRequestsPanel({
  requests,
  onResolved,
}: {
  requests: DeleteRequest[];
  /** Called after approve (deleted=true → remove tile) or reject. */
  onResolved: (requestId: string, businessId: string | null, deleted: boolean) => void;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = requests.filter(r => r.status === "pending");
  if (pending.length === 0) return null;

  async function approve(r: DeleteRequest) {
    if (!confirm(`Approve deletion of "${r.business_name}"? This permanently removes the business and all its data.`)) return;
    setBusyId(r.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_business_delete", { p_request_id: r.id });
    setBusyId(null);
    if (error) { toast.error("Approve failed: " + error.message); return; }
    toast.success(`${r.business_name} deleted`);
    onResolved(r.id, r.business_id, true);
  }

  async function reject(r: DeleteRequest) {
    const note = window.prompt(`Decline the request to delete "${r.business_name}"?\nOptional note back to the requester:`, "");
    if (note === null) return; // cancelled
    setBusyId(r.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_business_delete", { p_request_id: r.id, p_note: note || null });
    setBusyId(null);
    if (error) { toast.error("Reject failed: " + error.message); return; }
    toast.success(`Request for ${r.business_name} declined`);
    onResolved(r.id, r.business_id, false);
  }

  return (
    <div className="mb-8 rounded-2xl overflow-hidden ring-1 ring-amber-300/30"
      style={{ background: "rgba(251, 191, 36, 0.08)" }}>
      <div className="px-5 py-3 flex items-center gap-2 border-b border-amber-300/20">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-bold text-amber-100">
          Delete requests waiting on you
        </h2>
        <span className="ml-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-slate-900">
          {pending.length}
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {pending.map(r => (
          <div key={r.id} className="px-5 py-4 flex items-start gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white">{r.business_name}</span>
                {r.business_slug && (
                  <code className="text-[11px] text-amber-200/60">{r.business_slug}</code>
                )}
                <span className="text-[11px] text-amber-200/40 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                </span>
              </div>
              <p className="text-sm text-amber-50/80 mt-1 whitespace-pre-wrap">"{r.reason}"</p>
              <p className="text-[11px] text-amber-200/50 mt-1">
                Requested by {r.requested_by_email ?? "a VA"}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => reject(r)}
                disabled={busyId === r.id}
                className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-sm font-medium flex items-center gap-1.5"
              >
                <X className="h-4 w-4" /> Decline
              </button>
              <button
                onClick={() => approve(r)}
                disabled={busyId === r.id}
                className="h-9 px-3 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold flex items-center gap-1.5"
              >
                {busyId === r.id
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
                Approve delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
