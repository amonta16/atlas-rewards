"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Search, KanbanSquare, Folder, FolderPlus, Pencil, ArrowLeft,
  Trash2, ArrowUpRight, Check, LayoutGrid, FolderInput, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewBusinessModal } from "./new-business-modal";
import { FolderEditModal } from "./folder-edit-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { RequestDeleteModal } from "./request-delete-modal";
import { DeleteRequestsPanel, type DeleteRequest } from "./delete-requests-panel";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business, BusinessFolder } from "@/lib/types/database";

// Drill target: the folders overview, "all apps", a real folder, or unfiled.
type Drill = null | "ALL" | "UNFILED" | { folderId: string };

/**
 * CP-60 — Apps command deck.
 *
 * A dark "command center" for the agency's app portfolio. Opens on a grid of
 * big folder cards (with cover art); click one to drill into its apps, shown as
 * large glowing tiles. Folders are real objects you can create, rename, cover-
 * image, and delete. Analytics moved to its own tab.
 */
export function AppsAdminClient({
  role = "agency_admin",
  friendlyName, initialBusinesses, initialFolders, initialDeleteRequests = [],
}: {
  role?: "agency_admin" | "agency_va";
  friendlyName: string;
  initialBusinesses: Business[];
  initialFolders: BusinessFolder[];
  initialDeleteRequests?: DeleteRequest[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isVa = role === "agency_va";
  const [list, setList] = useState<Business[]>(initialBusinesses);
  const [folders, setFolders] = useState<BusinessFolder[]>(initialFolders);
  const [requests, setRequests] = useState<DeleteRequest[]>(initialDeleteRequests);
  const [query, setQuery] = useState("");
  const [drill, setDrill] = useState<Drill>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [folderModal, setFolderModal] = useState<{ folder: BusinessFolder | null } | null>(null);
  // Admin uses the hard-delete confirm; a VA uses the request-a-delete modal.
  const [pendingDelete, setPendingDelete] = useState<Business | null>(null);
  const [pendingRequest, setPendingRequest] = useState<Business | null>(null);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  // Business ids that currently have a pending delete request (badge on tiles).
  const pendingBizIds = new Set(
    requests.filter(r => r.status === "pending" && r.business_id).map(r => r.business_id as string),
  );

  // Router: admins go straight to the confirm dialog; VAs go to the request
  // modal instead.
  const onDeleteClick = (b: Business) => (isVa ? setPendingRequest(b) : setPendingDelete(b));

  const unfiledCount = list.filter(b => !b.folder_id).length;

  function appsInFolder(folderId: string) { return list.filter(b => b.folder_id === folderId); }
  function countFor(f: BusinessFolder) { return appsInFolder(f.id).length; }

  const searchMatch = (b: Business) =>
    !query || b.name.toLowerCase().includes(query.toLowerCase()) || b.slug.toLowerCase().includes(query.toLowerCase());

  // Which apps are shown once drilled in.
  function drilledApps(): Business[] {
    let apps: Business[];
    if (drill === "ALL") apps = list;
    else if (drill === "UNFILED") apps = list.filter(b => !b.folder_id);
    else if (drill && typeof drill === "object") apps = list.filter(b => b.folder_id === drill.folderId);
    else apps = [];
    return apps.filter(searchMatch);
  }

  async function performDelete(business: Business) {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_business", { p_business_id: business.id });
    if (error) { toast.error("Delete failed: " + error.message); throw error; }
    setList(prev => prev.filter(b => b.id !== business.id));
    setPendingDelete(null);
    toast.success(`${business.name} deleted`);
    router.refresh();
  }

  // CP-62: a VA files a delete request (reason required) instead of deleting.
  async function submitDeleteRequest(business: Business, reason: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("request_business_delete", {
      p_business_id: business.id,
      p_reason: reason,
    });
    if (error) { toast.error("Couldn't send request: " + error.message); throw error; }
    // Optimistically mark this business as having a pending request.
    setRequests(prev => {
      const rest = prev.filter(r => !(r.business_id === business.id && r.status === "pending"));
      return [
        {
          id: `local-${business.id}`,
          business_id: business.id,
          business_name: business.name,
          business_slug: business.slug,
          reason,
          status: "pending",
          requested_by: null,
          requested_by_email: null,
          reviewed_by: null,
          reviewed_at: null,
          review_note: null,
          created_at: new Date().toISOString(),
        },
        ...rest,
      ];
    });
    setPendingRequest(null);
    toast.success("Delete request sent for approval");
  }

  // CP-62: admin approved/declined a request from the panel.
  function onRequestResolved(requestId: string, businessId: string | null, deleted: boolean) {
    setRequests(prev => prev.map(r => (r.id === requestId ? { ...r, status: deleted ? "approved" : "rejected" } : r)));
    if (deleted && businessId) {
      setList(prev => prev.filter(b => b.id !== businessId));
      router.refresh();
    }
  }

  async function moveApp(business: Business, folderId: string | null) {
    const prev = business.folder_id ?? null;
    setList(l => l.map(b => (b.id === business.id ? { ...b, folder_id: folderId } : b)));
    const supabase = createClient();
    const { error } = await supabase.from("businesses").update({ folder_id: folderId }).eq("id", business.id);
    if (error) {
      toast.error("Couldn't move: " + error.message);
      setList(l => l.map(b => (b.id === business.id ? { ...b, folder_id: prev } : b)));
      return;
    }
    const dest = folderId ? folders.find(f => f.id === folderId)?.name ?? "folder" : "Unfiled";
    toast.success(`Moved to ${dest}`);
  }

  function onFolderSaved(f: BusinessFolder) {
    setFolders(prev => {
      const exists = prev.some(x => x.id === f.id);
      const next = exists ? prev.map(x => (x.id === f.id ? f : x)) : [...prev, f];
      return next.sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
    });
  }
  function onFolderDeleted(id: string) {
    setFolders(prev => prev.filter(f => f.id !== id));
    setList(prev => prev.map(b => (b.folder_id === id ? { ...b, folder_id: null } : b)));
    setDrill(d => (d && typeof d === "object" && d.folderId === id ? null : d));
  }

  const activeFolder =
    drill && typeof drill === "object" ? folders.find(f => f.id === drill.folderId) ?? null : null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #061a32 0%, #04132a 50%, #020c1c 100%)" }}>
      {/* ============ Header ============ */}
      <header className="relative px-8 pt-10 pb-6 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-10 h-64 w-64 rounded-full blur-3xl opacity-30" style={{ background: "#22d3ee" }} />
        <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full blur-3xl opacity-20" style={{ background: "#1d6fa5" }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="text-white">
            <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · App Command</div>
            <h1 className="text-4xl font-extrabold tracking-tight mt-1 drop-shadow">Welcome back, {friendlyName}. 👋</h1>
            <p className="text-sm text-sky-200/60 mt-1">Your app portfolio, organized. Open a folder to manage its apps.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/agency/pipeline">
              <Button variant="outline" className="border-sky-400/30 bg-white/5 text-white hover:bg-white/10">
                <KanbanSquare className="h-4 w-4 mr-1.5" /> Pipeline
              </Button>
            </Link>
            <Button className="bg-sky-400 text-slate-900 hover:bg-sky-300 shadow-lg shadow-sky-500/20 font-semibold" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Business
            </Button>
          </div>
        </div>

        <div className="relative mt-6 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-200/40" />
          <Input placeholder="Search all apps…" value={query} onChange={e => setQuery(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-sky-200/30" />
        </div>
      </header>

      <div className="px-8 pb-14">
        {/* ---- CP-62: admin's delete-request approval queue ---- */}
        {!isVa && (
          <DeleteRequestsPanel requests={requests} onResolved={onRequestResolved} />
        )}

        {/* ---- Search across everything (skips the folder view) ---- */}
        {query ? (
          <Section title={`Search · "${query}"`}>
            <AppGrid
              apps={list.filter(searchMatch)}
              folders={folders}
              rootDomain={rootDomain}
              isVa={isVa}
              pendingBizIds={pendingBizIds}
              onMove={moveApp}
              onDelete={onDeleteClick}
              onNewFolder={() => setFolderModal({ folder: null })}
            />
          </Section>
        ) : drill === null ? (
          /* ---- Folders overview ---- */
          <Section title="Folders">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <FolderCard
                label="All Apps"
                count={list.length}
                accent="linear-gradient(135deg,#0ea5e9,#22d3ee)"
                icon={<LayoutGrid className="h-6 w-6" />}
                onClick={() => setDrill("ALL")}
              />
              {folders.map(f => (
                <FolderCard
                  key={f.id}
                  label={f.name}
                  count={countFor(f)}
                  cover={f.cover_image_url}
                  accent={gradientFor(f.name)}
                  icon={<Folder className="h-6 w-6" />}
                  onClick={() => setDrill({ folderId: f.id })}
                  onEdit={() => setFolderModal({ folder: f })}
                />
              ))}
              {unfiledCount > 0 && (
                <FolderCard
                  label="Unfiled"
                  count={unfiledCount}
                  accent="linear-gradient(135deg,#475569,#64748b)"
                  icon={<Folder className="h-6 w-6" />}
                  onClick={() => setDrill("UNFILED")}
                />
              )}
              {/* New folder tile */}
              <button
                type="button"
                onClick={() => setFolderModal({ folder: null })}
                className="group relative rounded-2xl border-2 border-dashed border-white/15 hover:border-sky-400/50 flex flex-col items-center justify-center gap-2 min-h-[9.5rem] text-sky-200/50 hover:text-sky-200 transition-colors"
              >
                <FolderPlus className="h-7 w-7" />
                <span className="text-sm font-semibold">New folder</span>
              </button>
            </div>
            {list.length === 0 && (
              <p className="text-center text-sky-200/50 mt-8">No apps yet. Click "Add Business" to create your first sub-account.</p>
            )}
          </Section>
        ) : (
          /* ---- Drilled into a folder ---- */
          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setDrill(null)}
                  className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sky-100 flex items-center gap-1.5 text-sm shrink-0">
                  <ArrowLeft className="h-4 w-4" /> Folders
                </button>
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center text-white shrink-0 bg-cover bg-center"
                  style={activeFolder?.cover_image_url
                    ? { backgroundImage: `url("${activeFolder.cover_image_url}")` }
                    : { background: drill === "ALL" ? "linear-gradient(135deg,#0ea5e9,#22d3ee)" : drill === "UNFILED" ? "#475569" : gradientFor(activeFolder?.name ?? "") }}>
                  {!activeFolder?.cover_image_url && (drill === "ALL" ? <LayoutGrid className="h-5 w-5" /> : <Folder className="h-5 w-5" />)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white truncate">
                    {drill === "ALL" ? "All Apps" : drill === "UNFILED" ? "Unfiled" : activeFolder?.name}
                  </h2>
                  <p className="text-[12px] text-sky-200/50">{drilledApps().length} app{drilledApps().length === 1 ? "" : "s"}</p>
                </div>
              </div>
              {activeFolder && (
                <Button variant="outline" size="sm" className="border-sky-400/30 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => setFolderModal({ folder: activeFolder })}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit folder
                </Button>
              )}
            </div>

            <AppGrid
              apps={drilledApps()}
              folders={folders}
              rootDomain={rootDomain}
              isVa={isVa}
              pendingBizIds={pendingBizIds}
              onMove={moveApp}
              onDelete={onDeleteClick}
              onNewFolder={() => setFolderModal({ folder: null })}
              emptyHint={drill === "UNFILED" ? "Every app is filed into a folder. 🎉" : "No apps in this folder yet — move some in with the folder button on each app."}
            />
          </div>
        )}
      </div>

      {newOpen && <NewBusinessModal onClose={() => setNewOpen(false)} />}
      {folderModal && (
        <FolderEditModal
          folder={folderModal.folder}
          onClose={() => setFolderModal(null)}
          onSaved={onFolderSaved}
          onDeleted={onFolderDeleted}
        />
      )}
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
      {pendingRequest && (
        <RequestDeleteModal
          business={pendingRequest}
          rootDomain={rootDomain}
          alreadyPending={pendingBizIds.has(pendingRequest.id)}
          onClose={() => setPendingRequest(null)}
          onConfirm={(reason) => submitDeleteRequest(pendingRequest, reason)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[11px] uppercase tracking-[0.25em] font-extrabold text-sky-300/60 mb-4">{title}</h2>
      {children}
    </div>
  );
}

/** A big folder card with optional cover art. */
function FolderCard({
  label, count, cover, accent, icon, onClick, onEdit,
}: {
  label: string; count: number; cover?: string | null; accent: string;
  icon: React.ReactNode; onClick: () => void; onEdit?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl overflow-hidden cursor-pointer min-h-[9.5rem] ring-1 ring-white/10 hover:ring-sky-400/50 transition-all hover:-translate-y-0.5"
      style={{ boxShadow: "0 10px 30px -12px rgba(0,0,0,0.6)" }}
    >
      {/* cover / accent */}
      <div className="absolute inset-0 bg-cover bg-center"
        style={cover ? { backgroundImage: `url("${cover}")` } : { background: accent }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(2,10,25,0.15) 0%, rgba(2,10,25,0.78) 100%)" }} />
      {/* glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ boxShadow: "inset 0 0 40px rgba(56,189,248,0.35)" }} />

      {onEdit && (
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="absolute top-2.5 right-2.5 z-10 h-8 w-8 rounded-lg bg-black/40 hover:bg-black/70 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title={`Edit ${label}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="relative h-full flex flex-col justify-between p-4 text-white">
        <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
          {icon}
        </div>
        <div>
          <div className="font-bold text-[15px] leading-tight drop-shadow truncate">{label}</div>
          <div className="text-[12px] text-white/70">{count} app{count === 1 ? "" : "s"}</div>
        </div>
      </div>
    </div>
  );
}

/** Grid of big app tiles. */
function AppGrid({
  apps, folders, rootDomain, isVa, pendingBizIds, onMove, onDelete, onNewFolder, emptyHint,
}: {
  apps: Business[];
  folders: BusinessFolder[];
  rootDomain: string;
  isVa?: boolean;
  pendingBizIds?: Set<string>;
  onMove: (b: Business, folderId: string | null) => void;
  onDelete: (b: Business) => void;
  onNewFolder: () => void;
  emptyHint?: string;
}) {
  if (apps.length === 0) {
    return <p className="text-center text-sky-200/50 py-12">{emptyHint ?? "No apps here."}</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {apps.map(b => (
        <AppTile key={b.id} b={b} folders={folders} rootDomain={rootDomain}
          isVa={isVa} pending={!!pendingBizIds?.has(b.id)}
          onMove={onMove} onDelete={onDelete} onNewFolder={onNewFolder} />
      ))}
    </div>
  );
}

function AppTile({
  b, folders, rootDomain, isVa, pending, onMove, onDelete, onNewFolder,
}: {
  b: Business;
  folders: BusinessFolder[];
  rootDomain: string;
  isVa?: boolean;
  pending?: boolean;
  onMove: (b: Business, folderId: string | null) => void;
  onDelete: (b: Business) => void;
  onNewFolder: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const primary = b.brand_colors?.primary ?? "#1d6fa5";

  return (
    <div className="group relative rounded-2xl overflow-hidden ring-1 ring-white/10 hover:ring-sky-400/50 transition-all hover:-translate-y-0.5"
      style={{ background: "rgba(255,255,255,0.03)", boxShadow: "0 10px 30px -14px rgba(0,0,0,0.6)" }}>
      {/* cover strip */}
      <Link href={`/agency/businesses/${b.id}`} className="block">
        <div className="h-24 bg-cover bg-center relative"
          style={b.hero_image_url ? { backgroundImage: `url("${b.hero_image_url}")` } : { background: `linear-gradient(135deg, ${primary}, ${b.brand_colors?.secondary ?? primary})` }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(2,10,25,0) 0%, rgba(2,10,25,0.55) 100%)" }} />
          <span className={cn("absolute top-2.5 left-2.5 text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm",
            b.status === "active" ? "bg-emerald-400/25 text-emerald-100" : "bg-black/40 text-white/70")}>
            {b.status === "active" ? "● Active" : b.status}
          </span>
        </div>
      </Link>

      {/* body */}
      <div className="p-3.5 flex items-center gap-3">
        {b.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={b.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/15 -mt-9 relative bg-white shrink-0" />
        ) : (
          <div className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold -mt-9 relative ring-1 ring-white/15 shrink-0" style={{ background: primary }}>
            {b.name[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/agency/businesses/${b.id}`} className="font-semibold text-white truncate block hover:text-sky-200">{b.name}</Link>
          <div className="text-[11px] text-sky-200/40 truncate">{b.industry ?? "Uncategorized"} · <code className="text-sky-300/60">{b.slug}.{rootDomain}</code></div>
        </div>
      </div>

      {/* actions */}
      <div className="flex items-center gap-1.5 px-3.5 pb-3.5">
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)}
            className={cn("h-8 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors",
              b.folder_id ? "bg-sky-400/15 text-sky-200 hover:bg-sky-400/25" : "bg-white/5 text-sky-200/60 hover:bg-white/10")}>
            <FolderInput className="h-3.5 w-3.5" />
            {b.folder_id ? (folders.find(f => f.id === b.folder_id)?.name ?? "Folder") : "Move"}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-52 rounded-xl overflow-hidden shadow-xl"
                style={{ background: "#0b2036", border: "1px solid rgba(56,189,248,0.2)" }}>
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-sky-200/40">Move to folder</div>
                <div className="max-h-48 overflow-y-auto">
                  {folders.map(f => (
                    <button key={f.id} onClick={() => { onMove(b, f.id); setMenuOpen(false); }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-sky-100 hover:bg-white/5">
                      <span className="truncate flex items-center gap-2"><Folder className="h-3.5 w-3.5 text-sky-300/60" />{f.name}</span>
                      {b.folder_id === f.id && <Check className="h-3.5 w-3.5 text-sky-300" />}
                    </button>
                  ))}
                  <button onClick={() => { onMove(b, null); setMenuOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-sky-200/60 hover:bg-white/5">
                    <span>Unfiled</span>{!b.folder_id && <Check className="h-3.5 w-3.5 text-sky-300" />}
                  </button>
                </div>
                <button onClick={() => { onNewFolder(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-sky-300 hover:bg-white/5 border-t border-white/10">
                  <FolderPlus className="h-3.5 w-3.5" /> New folder…
                </button>
              </div>
            </>
          )}
        </div>
        <Link href={`/agency/businesses/${b.id}`}
          className="h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sky-100 flex items-center gap-1.5 text-[11px] font-medium">
          <ArrowUpRight className="h-3.5 w-3.5" /> Open
        </Link>
        {isVa && pending ? (
          <span className="h-8 ml-auto px-2.5 rounded-lg bg-amber-400/15 text-amber-200 text-[11px] font-semibold flex items-center gap-1.5"
            title="A delete request is awaiting admin approval">
            <Clock className="h-3.5 w-3.5" /> Delete requested
          </span>
        ) : (
          <button onClick={() => onDelete(b)}
            className="h-8 w-8 ml-auto rounded-lg text-sky-200/40 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition"
            aria-label={isVa ? `Request deletion of ${b.name}` : `Delete ${b.name}`}
            title={isVa ? `Request deletion of ${b.name}` : `Delete ${b.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Deterministic pleasant gradient from a folder name (fallback when no cover). */
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const h2 = (h + 40) % 360;
  return `linear-gradient(135deg, hsl(${h} 65% 42%), hsl(${h2} 70% 52%))`;
}
