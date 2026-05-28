"use client";
import { useEffect, useState } from "react";
import { Star, Clock, ExternalLink, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { Business } from "@/lib/types/database";

type PendingReview = {
  id: string;
  member_name: string;
  member_email: string;
  verification_method: string;
  verification_data: { review_link?: string; screenshot_url?: string } | null;
  submitted_at: string;
};

export function ReviewQueue({ business }: { business: Business }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // CP-32: surface RPC errors instead of swallowing them — the bug
  // Andrew flagged ("can't accept/reject at front desk") manifested as
  // the button doing nothing silently. Now we toast + show inline error.
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data, error } = await supabase.rpc("pending_reviews_for_business", { p_business_id: business.id });
      if (error) { setLastError(error.message); return; }
      setPending((data ?? []) as PendingReview[]);
    };
    load();
    const ch = supabase
      .channel(`reviews-mgr-${business.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "reviews", filter: `business_id=eq.${business.id}` },
        load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [business.id]);

  async function approve(id: string) {
    setBusyId(id); setLastError(null);
    const supabase = createClient();
    // CP-32: front-desk (business_staff) is permitted via the staffs_business()
    // check in the RPC. If they still see "permission denied" it means the
    // CP-32 SQL hasn't been applied yet — surface the message clearly.
    const { error } = await supabase.rpc("approve_review", { p_review_id: id });
    setBusyId(null);
    if (error) {
      setLastError(error.message);
      toast.error("Approve failed: " + error.message);
      return;
    }
    toast.success("Review approved + points awarded ✨");
    setPending(p => p.filter(r => r.id !== id));
  }

  async function reject(id: string) {
    setBusyId(id); setLastError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_review", { p_review_id: id, p_reason: null });
    setBusyId(null);
    if (error) {
      setLastError(error.message);
      toast.error("Reject failed: " + error.message);
      return;
    }
    toast.success("Review rejected");
    setPending(p => p.filter(r => r.id !== id));
  }

  if (pending.length === 0 && !lastError) return null;

  return (
    <div className="rounded-2xl border bg-white">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-600" />
          <h3 className="font-semibold text-sm">Pending reviews</h3>
        </div>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
          {pending.length}
        </span>
      </div>

      {lastError && (
        <div className="m-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold">Review action failed</div>
            <div>{lastError}</div>
            <div className="text-[10px] opacity-80 mt-1">
              If you're at the front desk and this keeps failing, apply the CP-32 SQL migration — it widens the
              approve/reject permission to cover the business_staff role.
            </div>
          </div>
        </div>
      )}

      <div className="divide-y">
        {pending.map(r => (
          <div key={r.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: business.brand_colors.primary }}>
                {r.member_name[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.member_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{r.member_email}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Submitted {new Date(r.submitted_at).toLocaleString()}
                </div>
                {r.verification_data?.review_link && (
                  <a href={r.verification_data.review_link} target="_blank" rel="noopener noreferrer"
                     className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> View their review
                  </a>
                )}
                {!r.verification_data?.review_link && business.google_review_url && (
                  <a href={business.google_review_url} target="_blank" rel="noopener noreferrer"
                     className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Open Google Reviews to verify
                  </a>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => reject(r.id)} disabled={busyId === r.id}
                className="text-rose-700 border-rose-200 hover:bg-rose-50">
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button size="sm" onClick={() => approve(r.id)} disabled={busyId === r.id}
                className="text-white"
                style={{ background: business.brand_colors.primary }}>
                <Check className="h-4 w-4 mr-1" /> {busyId === r.id ? "Approving…" : "Approve & award"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
