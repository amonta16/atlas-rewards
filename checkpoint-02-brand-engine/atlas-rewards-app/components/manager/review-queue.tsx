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
    <div
      className="rounded-2xl overflow-hidden shadow-md"
      style={{
        // CP-35: Google-branded pending-review container. Multi-color
        // top border (red/yellow/green/blue) so it's instantly readable
        // as "Google" at a glance.
        border: "1px solid #e5e7eb",
        background: "white",
      }}
    >
      {/* Google 4-color top stripe */}
      <div
        className="h-1 w-full"
        style={{
          background:
            "linear-gradient(90deg, #4285F4 0%, #4285F4 25%, #EA4335 25%, #EA4335 50%, #FBBC05 50%, #FBBC05 75%, #34A853 75%, #34A853 100%)",
        }}
      />
      <div className="px-4 py-3 border-b flex items-center justify-between bg-white">
        <div className="flex items-center gap-2.5">
          <GoogleGLogo className="h-5 w-5" />
          <div>
            <h3 className="font-extrabold text-sm tracking-tight">Pending Google reviews</h3>
            <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
              Verify, then award points
            </div>
          </div>
        </div>
        <span
          className="text-[11px] font-extrabold px-2.5 py-1 rounded-full text-white shadow"
          style={{
            background: "linear-gradient(135deg, #4285F4 0%, #34A853 100%)",
          }}
        >
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
                className="text-white font-bold shadow-md"
                style={{
                  // Google-themed approve action (blue → green gradient)
                  background: "linear-gradient(135deg, #4285F4 0%, #34A853 100%)",
                }}>
                <Check className="h-4 w-4 mr-1" /> {busyId === r.id ? "Approving…" : "Approve & award"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Inline Google "G" logomark. CP-35 — used in the pending-review queue
 * header so the front-desk operator immediately recognizes this is a
 * Google review request. Faithful to Google's 4-color brand. SVG path
 * data is the canonical "G" glyph.
 */
function GoogleGLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
