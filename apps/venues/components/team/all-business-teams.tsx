"use client";
/**
 * AllBusinessTeams — CP-32
 *
 * Agency-side flat list of every team member across every business —
 * managers + front-desk grouped by business, plus pending invitations.
 * Renders compactly using the same TeamMembers component (one card per
 * business) so the agency admin can see the full picture without
 * drilling into each business.
 *
 * Backed by the existing list_team_members(p_business_id) RPC, called
 * once per business after we load businesses[].
 */
import { useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TeamMembers } from "@/components/team/team-members";
import type { Business } from "@/lib/types/database";

export function AllBusinessTeams() {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("businesses")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as Business[];
        setBusinesses(list);
        // Auto-expand the first 2 so the page isn't a wall of collapsed cards.
        const init: Record<string, boolean> = {};
        list.slice(0, 2).forEach(b => (init[b.id] = true));
        setOpen(init);
      });
  }, []);

  if (!businesses) {
    return <div className="text-sm text-zinc-500">Loading businesses…</div>;
  }
  if (businesses.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed bg-white p-6 text-center text-sm text-zinc-500">
        No sub-accounts yet. Add a business from My Apps to start inviting managers + front-desk.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {businesses.map(b => {
        const isOpen = open[b.id] ?? false;
        return (
          <div key={b.id} className="rounded-2xl border bg-white overflow-hidden">
            <button
              onClick={() => setOpen(o => ({ ...o, [b.id]: !isOpen }))}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-50"
            >
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${b.brand_colors.primary}, ${b.brand_colors.secondary})`,
                }}
              >
                {b.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={b.logo_url} alt="" className="h-6 w-6 object-contain" />
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="font-semibold text-sm truncate">{b.name}</div>
                <div className="text-[11px] text-zinc-500">{b.slug ?? b.id.slice(0, 8)}</div>
              </div>
              {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400"/> : <ChevronRight className="h-4 w-4 text-zinc-400"/>}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t bg-zinc-50/50">
                <TeamMembers
                  businessId={b.id}
                  callerRole="agency_admin"
                  primary={b.brand_colors.primary}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
