"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, Users, Activity, Plus, Search, Trash2, KanbanSquare, ArrowUpRight,
  Folder, FolderPlus, ChevronDown, ChevronRight, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewBusinessModal } from "./new-business-modal";
import { AgencyMetrics } from "./agency-metrics";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

type Rollup = {
  total_businesses: number; active_businesses: number;
  total_members: number; active_30d: number;
  revenue_30d_cents: number;
};

type GroupMode = "folder" | "industry" | "none";
const UNFILED = "Unfiled";
const UNCATEGORIZED = "Uncategorized";

/**
 * Agency command center — CP-50 dark revamp.
 *
 * Dark navy canvas with an Atlas ocean-blue glow. Surfaces AGENCY-side
 * metrics only (what sub-accounts pay us), big charts, and the portfolio
 * list. Business customer-revenue is intentionally NOT shown here.
 *
 * CP-59: the portfolio is no longer a flat list. The agency can organize
 * businesses into named folders (manual) or auto-group them by industry, with
 * collapsible sections. Folder assignment lives on businesses.folder.
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
  // CP-59: default to folder view only if folders already exist, so a fresh
  // agency isn't greeted by an empty "Unfiled" header.
  const [groupMode, setGroupMode] = useState<GroupMode>(
    () => (initialBusinesses.some(b => b.folder) ? "folder" : "none"),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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

  // CP-59: assign / clear a business's folder. Optimistic, with rollback.
  async function moveToFolder(business: Business, folder: string | null) {
    const prevFolder = business.folder ?? null;
    setList(prev => prev.map(b => (b.id === business.id ? { ...b, folder } : b)));
    const supabase = createClient();
    const { error } = await supabase.from("businesses").update({ folder }).eq("id", business.id);
    if (error) {
      toast.error("Couldn't move: " + error.message);
      setList(prev => prev.map(b => (b.id === business.id ? { ...b, folder: prevFolder } : b)));
      return;
    }
    toast.success(folder ? `Moved to "${folder}"` : "Removed from folder");
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("agency_rollup").then(({ data }) => setRollup(data as Rollup | null));
  }, []);

  const filtered = list.filter(b =>
    !query || b.name.toLowerCase().includes(query.toLowerCase()) || b.slug.toLowerCase().includes(query.toLowerCase()));

  // Every folder name currently in use — powers the "move to folder" menu.
  const existingFolders = Array.from(
    new Set(list.map(b => (b.folder ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  // Build the ordered, grouped view of the (filtered) businesses.
  const groups = buildGroups(filtered, groupMode);

  function toggleCollapse(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

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
            <div className="flex items-center gap-2 flex-wrap">
              {/* CP-59: grouping toggle — manual folders, auto by-industry, or a flat list. */}
              <div className="inline-flex rounded-full bg-white/5 p-0.5 gap-0.5 border border-white/10">
                {([["folder", "Folders"], ["industry", "By industry"], ["none", "All"]] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGroupMode(m)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                      groupMode === m ? "bg-sky-400 text-slate-900" : "text-sky-200/60 hover:text-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40" />
                <Input placeholder="Search businesses…" value={query} onChange={e => setQuery(e.target.value)}
                  className="pl-9 w-56 bg-white/5 border-white/10 text-white placeholder:text-sky-200/30" />
              </div>
            </div>
          </div>

          <div>
            {groups.map(g => {
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key}>
                  {groupMode !== "none" && (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(g.key)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-white/[0.02] hover:bg-white/[0.05] border-b border-white/5 text-left transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4 text-sky-200/50" /> : <ChevronDown className="h-4 w-4 text-sky-200/50" />}
                      <Folder className="h-3.5 w-3.5 text-sky-300/70" />
                      <span className="text-sm font-semibold text-white">{g.label}</span>
                      <span className="text-[11px] text-sky-200/40 tabular-nums">{g.items.length}</span>
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className="divide-y divide-white/5">
                      {g.items.map(b => (
                        <BusinessRow
                          key={b.id}
                          b={b}
                          rootDomain={rootDomain}
                          folders={existingFolders}
                          onMove={moveToFolder}
                          onDelete={() => setPendingDelete(b)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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

/** One business row + its folder / open / delete actions. */
function BusinessRow({
  b, rootDomain, folders, onMove, onDelete,
}: {
  b: Business;
  rootDomain: string;
  folders: string[];
  onMove: (business: Business, folder: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-white/[0.04] transition-colors">
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
      <div className="flex items-center gap-2 shrink-0">
        <FolderControl business={b} folders={folders} onMove={onMove} />
        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${b.status === "active" ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-sky-200/50"}`}>
          {b.status === "active" ? "● Active" : b.status}
        </span>
        <Link href={`/agency/businesses/${b.id}`}
          className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-sky-200/70">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <button onClick={onDelete}
          className="h-8 w-8 rounded-full text-sky-200/40 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition"
          aria-label={`Delete ${b.name}`} title={`Delete ${b.name}`}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Compact "move to folder" dropdown: pick an existing folder, unfile, or make a new one. */
function FolderControl({
  business, folders, onMove,
}: {
  business: Business;
  folders: string[];
  onMove: (business: Business, folder: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const current = business.folder?.trim() || null;

  function addNew() {
    const name = newName.trim();
    if (!name) return;
    onMove(business, name);
    setNewName("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={current ? `Folder: ${current}` : "Move to folder"}
        className={cn(
          "h-8 max-w-[9rem] flex items-center gap-1.5 px-2.5 rounded-lg text-[11px] font-medium transition-colors",
          current
            ? "bg-sky-400/15 text-sky-200 hover:bg-sky-400/25"
            : "bg-white/5 text-sky-200/50 hover:bg-white/10 hover:text-sky-200/80",
        )}
      >
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{current ?? "Folder"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1.5 z-50 w-56 rounded-xl overflow-hidden shadow-xl"
            style={{ background: "#0b2036", border: "1px solid rgba(56,189,248,0.2)" }}>
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-sky-200/40">Move to folder</div>
            <div className="max-h-48 overflow-y-auto">
              {folders.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { onMove(business, f); setOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-sky-100 hover:bg-white/5"
                >
                  <span className="truncate flex items-center gap-2"><Folder className="h-3.5 w-3.5 text-sky-300/60" />{f}</span>
                  {current === f && <Check className="h-3.5 w-3.5 text-sky-300" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { onMove(business, null); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-sky-200/60 hover:bg-white/5"
              >
                <span>{UNFILED}</span>
                {current === null && <Check className="h-3.5 w-3.5 text-sky-300" />}
              </button>
            </div>
            <div className="p-2 border-t border-white/10 flex gap-1.5">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addNew(); }}
                placeholder="New folder…"
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg text-[12px] bg-white/5 border border-white/10 text-white placeholder:text-sky-200/30 focus:outline-none focus:border-sky-400/40"
              />
              <button
                type="button"
                onClick={addNew}
                className="h-8 px-2.5 rounded-lg bg-sky-400 text-slate-900 text-[11px] font-bold flex items-center gap-1 hover:bg-sky-300"
              >
                <FolderPlus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Group businesses for display. Named groups sort alphabetically; the
 *  catch-all ("Unfiled" / "Uncategorized") always sinks to the bottom. */
function buildGroups(
  items: Business[], mode: GroupMode,
): { key: string; label: string; items: Business[] }[] {
  if (mode === "none") return [{ key: "all", label: "All", items }];

  const catchAll = mode === "folder" ? UNFILED : UNCATEGORIZED;
  const map = new Map<string, Business[]>();
  for (const b of items) {
    const raw = mode === "folder" ? (b.folder?.trim() || "") : (b.industry?.trim() || "");
    const key = raw || catchAll;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === catchAll) return 1;
    if (b === catchAll) return -1;
    return a.localeCompare(b);
  });
  return keys.map(key => ({ key, label: key, items: map.get(key)! }));
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
