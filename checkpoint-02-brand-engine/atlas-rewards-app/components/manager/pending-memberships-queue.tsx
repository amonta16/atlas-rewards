"use client";
/**
 * PendingMembershipsQueue — CP-34
 *
 * Front-desk widget that lists customers who have requested a membership
 * via the in-person or external-link payment modes. Staff confirms the
 * payment (cash collected / external receipt verified) and taps Activate,
 * which:
 *   - flips business_memberships.status to 'active'
 *   - flips membership_payment_status to 'paid'
 *   - drops an in-app notification to the customer
 *
 * Lives on the Front-desk tab of the manager dashboard, beneath the
 * Review queue. Hides itself entirely when there's nothing pending.
 *
 * RPCs (from cp34_migration.sql):
 *   - list_pending_memberships(p_business_id)
 *   - activate_pending_membership(p_membership_id, p_note)
 *   - reject_pending_membership(p_membership_id)
 */
import { useEffect, useState } from "react";
import { Crown, Clock, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { Business } from "@/lib/types/database";

type Pending = {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  requested_at: string;
};

export function PendingMembershipsQueue({ business }: { business: Business }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_pending_memberships", {
      p_business_id: business.id,
    });
    if (error) { setLastError(error.message); setLoaded(true); return; }
    setPending((data ?? []) as Pending[]);
    setLoaded(true);
  }

  useEffect(() => {
    load();
    const supabase = createClient();
    const ch = supabase
      .channel(`pending-mems-${business.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_memberships", filter: `business_id=eq.${business.id}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  async function activate(id: string) {
    setBusyId(id); setLastError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("activate_pending_membership", {
      p_membership_id: id,
      p_note: null,
    });
    setBusyId(null);
    if (error) {
      setLastError(error.message);
      toast.error("Activate failed: " + error.message);
      return;
    }
    toast.success("Member activated 👑");
    setPending(p => p.filter(r => r.membership_id !== id));
  }

  async function reject(id: string) {
    if (!confirm("Reject this pending membership? They can re-join anytime.")) return;
    setBusyId(id); setLastError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_pending_membership", {
      p_membership_id: id,
    });
    setBusyId(null);
    if (error) {
      setLastError(error.message);
      toast.error("Reject failed: " + error.message);
      return;
    }
    toast.success("Pending request removed");
    setPending(p => p.filter(r => r.membership_id !== id));
  }

  // Hide the whole widget when there's nothing pending and no error to show
  if (loaded && pending.length === 0 && !lastError) return null;
  if (!loaded) {
    return (
      <div className="rounded-2xl border bg-white p-4 flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking pending memberships…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500 fill-amber-300" />
          <h3 className="font-semibold text-sm">Pending memberships</h3>
        </div>
        {pending.length > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {pending.length}
          </span>
        )}
      </div>

      {lastError && (
        <div className="m-3 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-bold">Membership action failed</div>
            <div>{lastError}</div>
            <div className="text-[10px] opacity-80 mt-1">
              If this keeps failing, apply the CP-34 SQL migration in Supabase.
            </div>
          </div>
        </div>
      )}

      <div className="divide-y">
        {pending.map(r => (
          <div key={r.membership_id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: business.brand_colors.primary }}>
                {(r.full_name ?? r.email ?? "?")[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{r.full_name ?? r.email ?? "Customer"}</div>
                {r.email && (
                  <div className="text-[11px] text-muted-foreground truncate">{r.email}</div>
                )}
                {r.phone && (
                  <div className="text-[11px] text-muted-foreground truncate">{r.phone}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Requested {new Date(r.requested_at).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => reject(r.membership_id)}
                disabled={busyId === r.membership_id}
                className="text-rose-700 border-rose-200 hover:bg-rose-50"
              >
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => activate(r.membership_id)}
                disabled={busyId === r.membership_id}
                className="text-white"
                style={{ background: business.brand_colors.primary }}
              >
                <Check className="h-4 w-4 mr-1" />
                {busyId === r.membership_id ? "Activating…" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
