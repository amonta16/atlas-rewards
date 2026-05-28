"use client";
/**
 * InviteMemberModal — CP-31 / CP-32
 *
 * Email + role select. The role options are filtered by what the caller
 * is allowed to invite. The actual permission check happens server-side
 * in the create_invitation RPC — this UI just hides options the user
 * couldn't successfully invite anyway.
 *
 * CP-32: when an agency_admin is on the agency Team page (businessId is
 * null), they can now ALSO invite a manager or front-desk for a specific
 * sub-account by picking it from a "Which business?" dropdown. Previously
 * they had to drill into each business's manager dashboard, which Andrew
 * found tedious.
 */

import { useEffect, useState } from "react";
import { X, Send, Crown, Shield, User, Loader2, Mail, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type Role = "agency_admin" | "business_manager" | "business_staff";
type BizPick = { id: string; name: string };

const ROLE_DEFS: Record<Role, { label: string; description: string; icon: typeof Crown }> = {
  agency_admin: {
    label: "Agency admin",
    description: "Full access to every sub-account, billing, and the agency dashboard.",
    icon: Crown,
  },
  business_manager: {
    label: "Manager",
    description: "Can run this business's day-to-day: insights, billing, offers, team.",
    icon: Shield,
  },
  business_staff: {
    label: "Front desk",
    description: "Limited access: scan members, award points, fulfill redemptions.",
    icon: User,
  },
};

export function InviteMemberModal({
  businessId,
  callerRole,
  primary,
  onClose,
  onInvited,
}: {
  businessId: string | null;
  callerRole: Role;
  primary: string;
  onClose: () => void;
  onInvited: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(() => {
    // Default to the most-likely role: managers usually invite staff first.
    if (callerRole === "business_manager") return "business_staff";
    if (callerRole === "agency_admin" && businessId !== null) return "business_staff";
    return "business_manager";
  });
  const [busy, setBusy] = useState(false);

  // CP-32: when the agency admin is on the agency Team page (businessId
  // prop is null), they can pick which sub-account to invite a manager
  // / front-desk into. We load the list of businesses lazily here.
  const [businesses, setBusinesses] = useState<BizPick[] | null>(null);
  const [pickedBusinessId, setPickedBusinessId] = useState<string | "">("");
  const isAgencyFromAgency = callerRole === "agency_admin" && businessId === null;

  useEffect(() => {
    if (!isAgencyFromAgency) return;
    const supabase = createClient();
    supabase
      .from("businesses")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setBusinesses((data ?? []) as BizPick[]));
  }, [isAgencyFromAgency]);

  // What roles can the caller actually invite?
  // CP-32: agency_admin can now invite ALL three roles from the agency
  // Team page — manager + staff get scoped to a business they pick.
  const allowed: Role[] = (() => {
    if (callerRole === "agency_admin") return ["agency_admin", "business_manager", "business_staff"];
    if (callerRole === "business_manager") return ["business_staff"];
    return [];
  })();

  async function send() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    // CP-32: if agency admin is inviting a manager/staff from the
    // agency Team page, they must pick a business first.
    const effectiveBusinessId = role === "agency_admin"
      ? null
      : (businessId ?? (pickedBusinessId || null));
    if (role !== "agency_admin" && !effectiveBusinessId) {
      toast.error("Pick which business this person joins");
      return;
    }
    setBusy(true);
    const body = {
      email: email.trim(),
      role,
      business_id: effectiveBusinessId,
    };
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "invite failed");
      toast.success(`Invite sent to ${email.trim()}`);
      onInvited();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b">
          <h2 className="font-bold text-lg">Invite a team member</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Email */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="pl-9 h-11"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              We'll send a magic-link sign-in email. They land in their dashboard
              automatically once they click.
            </p>
          </div>

          {/* CP-32: business picker — only shown to agency_admin on the
              agency Team page (businessId prop is null) when they're
              inviting a non-admin role. */}
          {isAgencyFromAgency && role !== "agency_admin" && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Which business?</Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                <select
                  value={pickedBusinessId}
                  onChange={(e) => setPickedBusinessId(e.target.value)}
                  className="w-full h-11 pl-9 pr-3 rounded-md border bg-white text-sm"
                >
                  <option value="">{businesses ? "Pick a sub-account…" : "Loading…"}</option>
                  {(businesses ?? []).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">
                Managers see Insights, Billing, Offers, Team. Front-desk only sees scan + redemptions.
              </p>
            </div>
          )}

          {/* Role */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Role</Label>
            <div className="mt-2 space-y-2">
              {allowed.map((r) => {
                const def = ROLE_DEFS[r];
                const Icon = def.icon;
                const selected = role === r;
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={
                      "w-full text-left rounded-2xl border p-3 flex items-start gap-3 transition " +
                      (selected ? "ring-2 ring-offset-1 bg-white" : "hover:bg-zinc-50")
                    }
                    style={{
                      borderColor: selected ? primary : undefined,
                      ['--tw-ring-color' as any]: selected ? primary : undefined,
                    }}
                  >
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: selected ? primary : `${primary}15`,
                        color: selected ? "white" : primary,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold leading-tight">{def.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{def.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
          <button onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:text-zinc-900 px-3 py-2">
            Cancel
          </button>
          <Button
            onClick={send}
            disabled={busy || !email.trim()}
            className="rounded-full px-5 bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" /> Send invite</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
