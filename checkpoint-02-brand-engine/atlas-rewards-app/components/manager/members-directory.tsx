"use client";
/**
 * MembersDirectory — CP-48
 *
 * Front-desk "Users" tab: a manual list of every app user (member) of the
 * business. Click a row to open the same member panel you get from a QR
 * scan (award points, history, and — CP-48 — reset their password). Handy
 * as a debugging / support surface, especially before email reset is live.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, Users, ChevronRight, Loader2, Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";

type Member = {
  membership_id: string; user_id: string; full_name: string | null;
  email: string | null; phone: string | null;
  points_balance: number; tier: string; joined_at: string; visit_count: number;
  is_vip?: boolean;
};

export function MembersDirectory({
  businessId, primary, onPick,
}: { businessId: string; primary: string; onPick: (m: Member) => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("list_business_members", {
        p_business_id: businessId, p_limit: 500, p_offset: 0,
      });
      if (cancelled) return;
      if (error) { setErr(error.message); return; }
      setMembers((data ?? []) as Member[]);
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  const filtered = useMemo(() => {
    const list = members ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(m =>
      (m.full_name ?? "").toLowerCase().includes(term) ||
      (m.email ?? "").toLowerCase().includes(term) ||
      (m.phone ?? "").toLowerCase().includes(term));
  }, [members, q]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: primary }} />
          <h3 className="font-bold text-sm">All app users</h3>
          {members && (
            <span className="ml-auto text-[11px] font-semibold text-zinc-400">{members.length} total</span>
          )}
        </div>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search name, email, or phone"
              className="pl-9 h-10"
            />
          </div>
        </div>

        {err ? (
          <div className="p-6 text-center text-sm text-rose-600">{err}</div>
        ) : members === null ? (
          <div className="p-8 flex items-center justify-center text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {q ? "No members match that search." : "No members yet."}
          </div>
        ) : (
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {filtered.map(m => {
              const name = m.full_name || m.email || "Member";
              const initials = name.split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
              return (
                <button
                  key={m.membership_id}
                  onClick={() => onPick(m)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-50 transition"
                >
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                    style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{name}</span>
                      {m.is_vip && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                          <Crown className="h-2.5 w-2.5" /> VIP
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {m.email ?? m.phone ?? "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums" style={{ color: primary }}>
                      {m.points_balance.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-zinc-400">{m.tier}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
