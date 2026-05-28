"use client";
/**
 * TeamMembers — CP-31
 *
 * Single component used by BOTH the agency dashboard ("Team" tab) and the
 * manager dashboard ("Team" tab). Lists active members + pending invitations
 * for a business (`businessId`), or for the agency itself (`businessId={null}`).
 *
 * Permissions are enforced by the underlying RPCs:
 *   - agency_admin can invite any role, any business
 *   - business_manager can invite business_staff for their own business
 *   - business_staff sees no Invite button (the scope is hidden via UI)
 *
 * Pending invitations show a status pill (pending / accepted / expired /
 * revoked) and a "Revoke" action when revocable. Active members show a
 * "Remove" action (gated to admins / managers via the RPC).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  UserPlus, MoreVertical, Crown, Shield, User, Mail, Clock,
  Loader2, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { InviteMemberModal } from "./invite-member-modal";

type Row = {
  kind: "member" | "invitation";
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: "agency_admin" | "business_manager" | "business_staff";
  business_id: string | null;
  status: "active" | "pending" | "revoked" | "expired";
  token: string | null;
  created_at: string;
};

export function TeamMembers({
  /** Pass null for the agency-wide list (agency_admin only). */
  businessId,
  /** Caller's role — controls which Invite options are offered. */
  callerRole,
  primary,
}: {
  businessId: string | null;
  callerRole: "agency_admin" | "business_manager" | "business_staff";
  primary: string;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const canInvite = callerRole === "agency_admin"
    || (callerRole === "business_manager" && businessId !== null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_team_members", {
      p_business_id: businessId,
    });
    setLoading(false);
    if (error) {
      toast.error("Couldn't load team — " + error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  }, [businessId, toast]);

  useEffect(() => { load(); }, [load]);

  async function revoke(token: string, email: string) {
    setMenuOpen(null);
    const res = await fetch("/api/team/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error("Revoke failed — " + (json.error ?? "unknown"));
      return;
    }
    toast.success(`Invitation for ${email} revoked`);
    load();
  }

  async function remove(userId: string, role: string, email: string) {
    setMenuOpen(null);
    if (!confirm(`Remove ${email} from this team?`)) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_team_member", {
      p_user_id: userId,
      p_business_id: businessId,
      p_role: role,
    });
    if (error) {
      toast.error("Remove failed — " + error.message);
      return;
    }
    toast.success(`${email} removed`);
    load();
  }

  // Group: active members first, then pending / expired / revoked.
  const grouped = useMemo(() => {
    if (!rows) return { active: [], pending: [], inactive: [] };
    return {
      active:  rows.filter(r => r.kind === "member" || (r.kind === "invitation" && r.status === "active")),
      pending: rows.filter(r => r.kind === "invitation" && r.status === "pending"),
      inactive:rows.filter(r => r.kind === "invitation" && (r.status === "expired" || r.status === "revoked")),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-zinc-500" />
            {businessId ? "Team members" : "Agency team"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            {businessId
              ? "People who can sign in to this business's manager + front-desk views."
              : "Agency admins — full access to every sub-account, billing, and the agency dashboard."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (loading ? "animate-spin" : "")} />
            Refresh
          </Button>
          {canInvite && (
            <Button size="sm" onClick={() => setInviteOpen(true)}
              style={{ background: primary }}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Invite
            </Button>
          )}
        </div>
      </div>

      {/* Active */}
      <Section title="Active" count={grouped.active.length}>
        {loading && grouped.active.length === 0 && (
          <Loading />
        )}
        {!loading && grouped.active.length === 0 && (
          <Empty text="No active team members yet." />
        )}
        {grouped.active.map((r) => (
          <Row
            key={(r.user_id ?? r.email) + r.role}
            row={r}
            primary={primary}
            menuOpen={menuOpen === r.email + r.role}
            onToggleMenu={() => setMenuOpen(menuOpen === r.email + r.role ? null : r.email + r.role)}
            onRemove={r.user_id ? () => remove(r.user_id!, r.role, r.email) : undefined}
          />
        ))}
      </Section>

      {/* Pending */}
      {grouped.pending.length > 0 && (
        <Section title="Pending invitations" count={grouped.pending.length}>
          {grouped.pending.map((r) => (
            <Row
              key={r.token ?? r.email}
              row={r}
              primary={primary}
              menuOpen={menuOpen === "p" + (r.token ?? "")}
              onToggleMenu={() => setMenuOpen(menuOpen === "p" + (r.token ?? "") ? null : "p" + (r.token ?? ""))}
              onRevoke={r.token ? () => revoke(r.token!, r.email) : undefined}
            />
          ))}
        </Section>
      )}

      {/* Inactive (expired / revoked) — collapsed by default */}
      {grouped.inactive.length > 0 && (
        <details className="rounded-2xl border bg-white">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold flex items-center justify-between">
            <span>Expired / revoked</span>
            <span className="text-xs text-zinc-400">{grouped.inactive.length}</span>
          </summary>
          <div className="px-4 pb-3 space-y-2">
            {grouped.inactive.map((r) => (
              <Row
                key={r.token ?? r.email}
                row={r}
                primary={primary}
                menuOpen={false}
                onToggleMenu={() => {}}
              />
            ))}
          </div>
        </details>
      )}

      {inviteOpen && (
        <InviteMemberModal
          businessId={businessId}
          callerRole={callerRole}
          primary={primary}
          onClose={() => setInviteOpen(false)}
          onInvited={() => { setInviteOpen(false); load(); }}
        />
      )}
    </div>
  );
}

/* ────────────────────── sub-components ────────────────────── */

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mb-2 flex items-center gap-2">
        {title}
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 normal-case tracking-normal">
          {count}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  row, primary, menuOpen, onToggleMenu, onRemove, onRevoke,
}: {
  row: Row;
  primary: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onRemove?: () => void;
  onRevoke?: () => void;
}) {
  const RoleIcon = row.role === "agency_admin" ? Crown
                  : row.role === "business_manager" ? Shield
                  : User;
  const roleLabel = row.role === "agency_admin" ? "Agency admin"
                   : row.role === "business_manager" ? "Manager"
                   : "Front desk";

  return (
    <div className="rounded-2xl border bg-white p-3 flex items-center gap-3" style={{ borderColor: `${primary}1f` }}>
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
      >
        {(row.full_name ?? row.email)[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold leading-tight flex items-center gap-1.5 truncate">
          {row.full_name || row.email}
          {row.kind === "invitation" && row.status === "pending" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> Pending
            </span>
          )}
          {row.kind === "invitation" && row.status === "expired" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500">Expired</span>
          )}
          {row.kind === "invitation" && row.status === "revoked" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">Revoked</span>
          )}
        </div>
        <div className="text-[11px] text-zinc-500 truncate flex items-center gap-1.5">
          <Mail className="h-2.5 w-2.5" /> {row.email}
        </div>
      </div>
      <div
        className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full shrink-0"
        style={{ background: `${primary}10`, color: primary }}
      >
        <RoleIcon className="h-3 w-3" /> {roleLabel}
      </div>

      {(onRemove || onRevoke) && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
            className="h-7 w-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-500"
            aria-label="More"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={onToggleMenu} />
              <div className="absolute right-0 top-8 z-40 w-44 rounded-xl bg-white border shadow-lg py-1 text-sm">
                {onRevoke && (
                  <button
                    onClick={onRevoke}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-50 text-rose-600"
                  >
                    Revoke invitation
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={onRemove}
                    className="w-full text-left px-3 py-2 hover:bg-zinc-50 text-rose-600"
                  >
                    Remove from team
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500 flex items-center justify-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed bg-white p-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}
