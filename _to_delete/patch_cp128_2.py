import subprocess, sys

R = "checkpoint-02-brand-engine/atlas-rewards-app/"
MODE = sys.argv[1] if len(sys.argv) > 1 else "device"

def load(p):
    if MODE == "mirror":
        return open(p, encoding="utf-8").read()
    return subprocess.run(["git", "show", "HEAD:" + R + p], capture_output=True, text=True, check=True).stdout

def save(p, src):
    path = p if MODE == "mirror" else R + p
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(src)

def rep(src, a, b, name):
    assert src.count(a) == 1, f"anchor fail: {name} ({src.count(a)})"
    return src.replace(a, b)

# ═══ CP-128.2 · Tier 2: plaza scan, nested folders, pipeline auto-log ══

# ── 1. types: BusinessFolder gains parent_folder_id ───────────────────
p = "lib/types/database.ts"
src = load(p)
src = rep(src,
"""export type BusinessFolder = {
  id: string;
  name: string;
  cover_image_url: string | null;
  sort: number;""",
"""export type BusinessFolder = {
  id: string;
  name: string;
  cover_image_url: string | null;
  /** CP-128.2: one level of nesting (location → niche); null = top level. */
  parent_folder_id?: string | null;
  sort: number;""",
"folder type")
save(p, src)
print("types OK")

# ── 2. folder-edit-modal: pick a parent folder ────────────────────────
p = "components/agency/folder-edit-modal.tsx"
src = load(p)

src = rep(src,
"""export function FolderEditModal({
  folder, onClose, onSaved, onDeleted,
}: {
  folder: BusinessFolder | null; // null = create
  onClose: () => void;
  onSaved: (folder: BusinessFolder) => void;
  onDeleted: (id: string) => void;
}) {""",
"""export function FolderEditModal({
  folder, onClose, onSaved, onDeleted, allFolders,
}: {
  folder: BusinessFolder | null; // null = create
  onClose: () => void;
  onSaved: (folder: BusinessFolder) => void;
  onDeleted: (id: string) => void;
  /** CP-128.2: the full folder list, for the parent-folder picker. */
  allFolders?: BusinessFolder[];
}) {""",
"modal props")

src = rep(src,
'  const [cover, setCover] = useState<string | null>(folder?.cover_image_url ?? null);',
"""  const [cover, setCover] = useState<string | null>(folder?.cover_image_url ?? null);
  // CP-128.2: one level of nesting — only top-level folders can be parents,
  // and a folder that already has children stays top-level (no grandkids).
  const [parentId, setParentId] = useState<string | null>(folder?.parent_folder_id ?? null);
  const parentOptions = (allFolders ?? []).filter(f => !f.parent_folder_id && f.id !== folder?.id);
  const hasChildren = (allFolders ?? []).some(f => f.parent_folder_id === folder?.id);""",
"modal state")

src = rep(src,
'        .update({ name: trimmed, cover_image_url: cover })',
'        .update({ name: trimmed, cover_image_url: cover, parent_folder_id: hasChildren ? null : parentId })',
"modal update")

src = rep(src,
'        .insert({ name: trimmed, cover_image_url: cover })',
'        .insert({ name: trimmed, cover_image_url: cover, parent_folder_id: parentId })',
"modal insert")

src = rep(src,
"""          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cover image (optional)</Label>""",
"""          {/* CP-128.2: file this folder inside a top-level folder, so the
              deck can hold "San Luis Obispo" ▸ "Smoke shops". One level. */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Inside folder</Label>
            <select
              value={parentId ?? ""}
              onChange={e => setParentId(e.target.value || null)}
              disabled={hasChildren}
              className="w-full h-10 rounded-lg border bg-white px-3 text-sm text-zinc-900 disabled:opacity-60"
            >
              <option value="">Top level</option>
              {parentOptions.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500">
              {hasChildren
                ? "This folder holds subfolders, so it stays at the top level."
                : "e.g. put \\u201cSmoke shops\\u201d inside \\u201cSan Luis Obispo\\u201d. One level deep."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cover image (optional)</Label>""",
"modal select ui")
save(p, src)
print("folder modal OK")

# ── 3. apps-admin-client: subfolders in the deck ──────────────────────
p = "components/agency/apps-admin-client.tsx"
src = load(p)

src = rep(src,
"""  function appsInFolder(folderId: string) { return list.filter(b => b.folder_id === folderId); }
  function countFor(f: BusinessFolder) { return appsInFolder(f.id).length; }""",
"""  function appsInFolder(folderId: string) { return list.filter(b => b.folder_id === folderId); }
  function countFor(f: BusinessFolder) { return appsInFolder(f.id).length; }

  // CP-128.2: one level of nesting (location → niche).
  const topFolders = folders.filter(f => !f.parent_folder_id);
  function childrenOf(folderId: string) { return folders.filter(f => f.parent_folder_id === folderId); }
  /** A parent card counts its own apps plus its children's. */
  function rollupCount(f: BusinessFolder) {
    return countFor(f) + childrenOf(f.id).reduce((n, c) => n + countFor(c), 0);
  }
  /** Move-menu ordering: each parent followed by its children (indented). */
  const orderedFolders = topFolders.flatMap(t => [t, ...childrenOf(t.id)]);""",
"deck helpers")

src = rep(src,
"""              {folders.map(f => (
                <FolderCard
                  key={f.id}
                  label={f.name}
                  count={countFor(f)}""",
"""              {topFolders.map(f => (
                <FolderCard
                  key={f.id}
                  label={f.name}
                  count={rollupCount(f)}""",
"overview top-level")

src = rep(src,
"""                <button onClick={() => setDrill(null)}
                  className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sky-100 flex items-center gap-1.5 text-sm shrink-0">
                  <ArrowLeft className="h-4 w-4" /> Folders
                </button>""",
"""                <button
                  onClick={() => setDrill(activeFolder?.parent_folder_id
                    ? { folderId: activeFolder.parent_folder_id }
                    : null)}
                  className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-sky-100 flex items-center gap-1.5 text-sm shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                  {activeFolder?.parent_folder_id
                    ? (folders.find(f => f.id === activeFolder.parent_folder_id)?.name ?? "Back")
                    : "Folders"}
                </button>""",
"back to parent")

src = rep(src,
"""            <AppGrid
              apps={list.filter(searchMatch)}
              folders={folders}""",
"""            <AppGrid
              apps={list.filter(searchMatch)}
              folders={orderedFolders}""",
"search grid folders")

src = rep(src,
"""            <AppGrid
              apps={drilledApps()}
              folders={folders}""",
"""            {/* CP-128.2: subfolders of this folder (one level deep). */}
            {activeFolder && childrenOf(activeFolder.id).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-5">
                {childrenOf(activeFolder.id).map(sf => (
                  <FolderCard
                    key={sf.id}
                    label={sf.name}
                    count={countFor(sf)}
                    cover={sf.cover_image_url}
                    accent={gradientFor(sf.name)}
                    icon={<Folder className="h-6 w-6" />}
                    onClick={() => setDrill({ folderId: sf.id })}
                    onEdit={() => setFolderModal({ folder: sf })}
                  />
                ))}
              </div>
            )}
            <AppGrid
              apps={drilledApps()}
              folders={orderedFolders}""",
"drill subfolders")

src = rep(src,
"""  function onFolderDeleted(id: string) {
    setFolders(prev => prev.filter(f => f.id !== id));""",
"""  function onFolderDeleted(id: string) {
    // CP-128.2: a deleted parent releases its children to the top level
    // (matches the DB's ON DELETE SET NULL).
    setFolders(prev => prev.filter(f => f.id !== id)
      .map(f => (f.parent_folder_id === id ? { ...f, parent_folder_id: null } : f)));""",
"delete releases children")

src = rep(src,
"""        <FolderEditModal
          folder={folderModal.folder}
          onClose={() => setFolderModal(null)}""",
"""        <FolderEditModal
          folder={folderModal.folder}
          allFolders={folders}
          onClose={() => setFolderModal(null)}""",
"modal allFolders")

src = rep(src,
"""                  {folders.map(f => (
                    <button key={f.id} onClick={() => { onMove(b, f.id); setMenuOpen(false); }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-sky-100 hover:bg-white/5">""",
"""                  {folders.map(f => (
                    <button key={f.id} onClick={() => { onMove(b, f.id); setMenuOpen(false); }}
                      style={f.parent_folder_id ? { paddingLeft: "1.75rem" } : undefined}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-sky-100 hover:bg-white/5">""",
"move menu indent")
save(p, src)
print("apps deck OK")

# ── 4. field-demo-modal: pipeline auto-log + found meta ───────────────
p = "components/field/field-demo-modal.tsx"
src = load(p)

src = rep(src,
"""  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);""",
"""  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  // CP-128.2: what auto-fill found, carried into the pipeline log.
  const [foundMeta, setFoundMeta] = useState<{
    address?: string | null; phone?: string | null; website?: string | null;
  }>({});""",
"demo meta state")

src = rep(src,
"      if (j.name) setName(j.name);",
"""      setFoundMeta({ address: j.address, phone: j.phone, website: j.website });
      if (j.name) setName(j.name);""",
"demo meta capture")

src = rep(src,
"""      const slug = row?.new_slug as string;
      setResult({ slug, url: appUrl(slug) });
      onCreated?.();""",
"""      const slug = row?.new_slug as string;
      setResult({ slug, url: appUrl(slug) });
      // CP-128.2: door days track themselves — every demo lands in the
      // pipeline as a 'prepared_app' prospect. Best-effort: a pipeline
      // hiccup never blocks the demo the rep is holding.
      try {
        const { data: existing } = await supabase
          .from("agency_pipeline").select("id")
          .ilike("name", name.trim()).eq("status", "open").limit(1);
        if (!existing?.length) {
          await supabase.from("agency_pipeline").insert({
            name: name.trim(),
            stage: "prepared_app",
            lead_source: "door_to_door",
            contact_info: [foundMeta.phone, foundMeta.website].filter(Boolean).join(" · ") || null,
            notes: [`Instant demo: ${appUrl(slug)}`, foundMeta.address].filter(Boolean).join("\\n"),
          });
        }
      } catch { /* best-effort */ }
      onCreated?.();""",
"demo pipeline log")

src = rep(src,
'    setThemeId("from-logo"); setErr(null);',
'    setThemeId("from-logo"); setErr(null); setFoundMeta({}); setLookupNote(null);',
"demo reset")
save(p, src)
print("demo modal OK")

# ── 5. field-batch-modal: plaza scan + pipeline auto-log ──────────────
p = "components/field/field-batch-modal.tsx"
src = load(p)

src = rep(src,
'import { Loader2, Layers, Check, X, ExternalLink, Copy, AlertCircle } from "lucide-react";',
'import { Loader2, Layers, Check, X, ExternalLink, Copy, AlertCircle, MapPin } from "lucide-react";',
"batch import")

src = rep(src,
"  const [copied, setCopied] = useState(false);",
"""  const [copied, setCopied] = useState(false);
  // CP-128.2: "Scan this plaza" — Places nearby → checklist → list lines.
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [nearby, setNearby] = useState<
    Array<{ name: string; address: string | null; niche: DemoNiche; checked: boolean }> | null
  >(null);""",
"batch scan state")

src = rep(src,
"""  function restart() {
    setDone(false); setResults([]); setText("");
  }""",
"""  function restart() {
    setDone(false); setResults([]); setText("");
  }

  // CP-128.2: pull every storefront around the rep into a checklist.
  async function scanNearby() {
    if (scanBusy) return;
    setScanBusy(true); setScanNote(null); setNearby(null);
    try {
      const pos = await new Promise<GeolocationPosition | null>((res) => {
        if (!navigator.geolocation) return res(null);
        const t = window.setTimeout(() => res(null), 6000);
        navigator.geolocation.getCurrentPosition(
          (g) => { window.clearTimeout(t); res(g); },
          () => { window.clearTimeout(t); res(null); },
          { enableHighAccuracy: true, timeout: 5500 },
        );
      });
      if (!pos) { setScanNote("Location needed — allow location access and try again."); return; }
      const r = await fetch("/api/field/places-nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, radius: 250 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setScanNote(j?.error === "places_not_configured"
          ? "Scan needs GOOGLE_PLACES_API_KEY in Vercel — paste names manually meanwhile."
          : (j?.error || "Scan failed — paste names manually."));
        return;
      }
      const found = ((j.places ?? []) as Array<{ name?: string; address?: string | null; niche?: string }>)
        .map((p) => ({
          // commas would split the "name, niche" line format
          name: String(p.name || "").replace(/,/g, " ").replace(/\\s+/g, " ").trim(),
          address: p.address ?? null,
          niche: (p.niche && p.niche in NICHE_META ? p.niche : "general") as DemoNiche,
          checked: true,
        }))
        .filter((p) => p.name);
      if (!found.length) { setScanNote("Nothing storefront-shaped found here."); return; }
      setNearby(found);
    } catch {
      setScanNote("Scan failed — paste names manually.");
    } finally {
      setScanBusy(false);
    }
  }

  function addNearby() {
    if (!nearby) return;
    const existing = new Set(rows.map((r) => r.name.toLowerCase()));
    const lines = nearby
      .filter((p) => p.checked && !existing.has(p.name.toLowerCase()))
      .map((p) => `${p.name}, ${p.niche}`);
    if (lines.length) {
      setText((t) => (t.trim() ? t.replace(/\\s+$/, "") + "\\n" : "") + lines.join("\\n"));
    }
    setNearby(null);
  }""",
"batch scan fns")

src = rep(src,
"""              <div>
                <label className="text-xs font-bold text-zinc-600">Your list</label>""",
"""              {/* CP-128.2: scan the plaza you're standing in. */}
              <div>
                <button onClick={scanNearby} disabled={scanBusy}
                  className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm font-bold text-cyan-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {scanBusy ? "Scanning nearby…" : "Scan this plaza"}
                </button>
                {scanNote && <p className="text-[11px] text-zinc-500 mt-1.5">{scanNote}</p>}
                {nearby && (
                  <div className="mt-2 rounded-xl border overflow-hidden">
                    <div className="max-h-44 overflow-y-auto divide-y">
                      {nearby.map((p, i) => (
                        <label key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50">
                          <input type="checkbox" checked={p.checked}
                            onChange={() => setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, checked: !x.checked } : x)))} />
                          <span className="min-w-0 flex-1">
                            <span className="font-semibold text-zinc-900 block truncate">{p.name}</span>
                            {p.address && <span className="text-[10px] text-zinc-400 block truncate">{p.address}</span>}
                          </span>
                          <span className="text-sm">{NICHE_META[p.niche].emoji}</span>
                        </label>
                      ))}
                    </div>
                    <button onClick={addNearby}
                      className="w-full border-t bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">
                      Add {nearby.filter(p => p.checked).length} to the list
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600">Your list</label>""",
"batch scan ui")

src = rep(src,
"        acc.push({ name: row.name, niche: row.niche, ok: true, slug, url: appUrl(slug) });",
"""        acc.push({ name: row.name, niche: row.niche, ok: true, slug, url: appUrl(slug) });
        // CP-128.2: best-effort pipeline log — one open 'prepared_app'
        // prospect per business, never blocks the batch.
        try {
          const { data: existing } = await supabase
            .from("agency_pipeline").select("id")
            .ilike("name", row.name).eq("status", "open").limit(1);
          if (!existing?.length) {
            await supabase.from("agency_pipeline").insert({
              name: row.name,
              stage: "prepared_app",
              lead_source: "door_to_door",
              notes: `Batch demo: ${appUrl(slug)}`,
            });
          }
        } catch { /* best-effort */ }""",
"batch pipeline log")
save(p, src)
print("batch modal OK")
