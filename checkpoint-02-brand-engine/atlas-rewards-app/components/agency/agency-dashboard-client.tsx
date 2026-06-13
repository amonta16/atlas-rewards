"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Users, Activity, Plus, Search, Trash2, KanbanSquare, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewBusinessModal } from "./new-business-modal";
import { AgencyMetrics } from "./agency-metrics";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Rollup = {
  total_businesses: number; active_businesses: number;
  total_members: number; active_30d: number;
  revenue_30d_cents: number;
};

/**
 * Agency command center — CP-50 dark revamp.
 *
 * Dark navy canvas with an Atlas ocean-blue glow. Surfaces AGENCY-side
 * metrics only (what sub-accounts pay us), big charts, and the portfolio
 * list. Business customer-revenue is intentionally NOT shown here.
 */
export function AgencyDashboardClient({
  friendlyName, initialBusinesses,
}: { friendlyName: string; initialBusinesses: Business[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const [list, setList] = useState<Business[]>(initialBusinesses);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Business | null>(null);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  async function performDelete(business: Business) {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_business", { p_business_id: business.id });
    if (error) { toast.error("Delete failed: " + error.message); throw error; }
    setList(prev => prev.filter(b => b.id !== business.id));
    setPendingDelete(null);
    toast.success(`${business.name} deleted`);
    router.refresh();
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("agency_rollup").then(({ data }) => setRollup(data as Rollup | null));
  }, []);

  const filtered = list.filter(b =>
    !query || b.name.toLowerCase().includes(query.toLowerCase()) || b.slug.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #061a32 0%, #04132a 50%, #020c1c 100%)" }}
    >
      {/* ============ Header ============ */}
      <header className="relative px-8 pt-10 pb-7 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-10 h-64 w-64 rounded-full blur-3xl opacity-30"
          style={{ background: "#22d3ee" }} />
        <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full blur-3xl opacity-20"
          style={{ background: "#1d6fa5" }} />
        <div className="relative flex items-start justify-between gap-4">
          <div className="text-white">
            <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · Command Center</div>
            <h1 className="text-4xl font-extrabold tracking-tight mt-1 drop-shadow">Welcome back, {friendlyName}. 👋</h1>
            <p className="text-sm text-sky-200/60 mt-1">Here's how your agency is performing today.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/agency/pipeline">
              <Button variant="outline" className="border-sky-400/30 bg-white/5 text-white hover:bg-white/10">
                <KanbanSquare className="h-4 w-4 mr-1.5" /> Pipeline
              </Button>
            </Link>
            <Button className="bg-sky-400 text-slate-900 hover:bg-sky-300 shadow-lg shadow-sky-500/20 font-semibold"
              onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Business
            </Button>
          </div>
        </div>

        {/* Portfolio mini-stats (NOT revenue) */}
        <div className="relative mt-6 flex flex-wrap gap-2.5">
          <Pill icon={<Building2 className="h-3.5 w-3.5" />} label="Businesses" value={rollup?.total_businesses ?? list.length} />
          <Pill icon={<Users className="h-3.5 w-3.5" />} label="Members" value={rollup?.total_members ?? "—"} />
          <Pill icon={<Activity className="h-3.5 w-3.5" />} label="Active (30d)" value={rollup?.active_30d ?? "—"} />
        </div>
      </header>

      {/* ============ Metrics + charts ============ */}
      <AgencyMetrics />

      {/* ============ Businesses ============ */}
      <div className="px-8 py-8">
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(56,189,248,0.14)" }}>
          <div className="flex items-center justify-between gap-3 p-5 border-b border-white/5 flex-wrap">
            <div>
              <h2 className="font-bold text-white">Your businesses</h2>
              <p className="text-[12px] text-sky-200/50">Manage your client portfolio</p>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40" />
              <Input placeholder="Search businesses…" value={query} onChange={e => setQuery(e.target.value)}
                className="pl-9 w-64 bg-white/5 border-white/10 text-white placeholder:text-sky-200/30" />
            </div>
          </div>

          <div className="divide-y divide-white/5">
            {filtered.map(b => (
              <div key={b.id} className="flex items-center justify-between p-4 hover:bg-white/[0.04] transition-colors">
                <Link href={`/agency/businesses/${b.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  {b.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={b.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10" />
                  ) : (
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold"
                      style={{ background: b.brand_colors?.primary ?? "#1d6fa5" }}>
                      {b.name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{b.name}</div>
                    <div className="text-[11px] text-sky-200/40 truncate">{b.industry ?? "Uncategorized"} · <code className="text-sky-300/60">{b.slug}.{rootDomain}</code></div>
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${b.status === "active" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-sky-200/50"}`}>
                    {b.status === "active" ? "● Active" : b.status}
                  </span>
                  <Link href={`/agency/businesses/${b.id}`}
                    className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                  <button onClick={() => setPendingDelete(b)}
                    className="h-8 w-8 rounded-full text-sky-200/40 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition"
                    aria-label={`Delete ${b.name}`} title={`Delete ${b.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-10 text-center text-sky-200/50">
                {list.length === 0 ? 'No businesses yet. Click "Add Business" to create your first sub-account.' : "No matches."}
              </div>
            )}
          </div>
        </div>
      </div>

      {newOpen && <NewBusinessModal onClose={() => setNewOpen(false)} />}

      {pendingDelete && (
        <ConfirmDeleteModal
          title={`Delete ${pendingDelete.name}?`}
          description="This removes the business + every customer, reward, offer, ledger entry, and Google review tied to it. Cannot be undone."
          detail={
            <div className="rounded-lg bg-zinc-50 border p-3 text-xs space-y-1">
              <div><strong>Slug:</strong> <code>{pendingDelete.slug}.{rootDomain}</code></div>
              <div><strong>Status:</strong> {pendingDelete.status}</div>
              <div className="text-rose-700 font-bold mt-2">⚠ All customer apps for this business stop working immediately.</div>
            </div>
          }
          confirmWord="DELETE"
          destructiveLabel="Delete business"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => performDelete(pendingDelete)}
        />
      )}
    </div>
  );
}

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(56,189,248,0.18)" }}>
      <span className="text-sky-300/80">{icon}</span>
      <span className="text-sm font-bold text-white tabular-nums">{value}</span>
      <span className="text-[11px] text-sky-200/50">{label}</span>
    </div>
  );
}
