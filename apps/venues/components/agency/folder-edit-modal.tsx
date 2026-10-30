"use client";
import { useState } from "react";
import { X, Trash2, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "./image-uploader";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import type { BusinessFolder } from "@/lib/types/database";

/**
 * CP-60: create or edit an Apps folder — name + cover image, plus delete.
 * Deleting a folder just unfiles its apps (businesses.folder_id → NULL via the
 * FK's ON DELETE SET NULL), it never touches the businesses themselves.
 */
export function FolderEditModal({
  folder, onClose, onSaved, onDeleted, allFolders,
}: {
  folder: BusinessFolder | null; // null = create
  onClose: () => void;
  onSaved: (folder: BusinessFolder) => void;
  onDeleted: (id: string) => void;
  /** CP-128.2: the full folder list, for the parent-folder picker. */
  allFolders?: BusinessFolder[];
}) {
  const { toast } = useToast();
  const [name, setName] = useState(folder?.name ?? "");
  const [cover, setCover] = useState<string | null>(folder?.cover_image_url ?? null);
  // CP-128.2: one level of nesting — only top-level folders can be parents,
  // and a folder that already has children stays top-level (no grandkids).
  const [parentId, setParentId] = useState<string | null>(folder?.parent_folder_id ?? null);
  const parentOptions = (allFolders ?? []).filter(f => !f.parent_folder_id && f.id !== folder?.id);
  const hasChildren = (allFolders ?? []).some(f => f.parent_folder_id === folder?.id);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Give the folder a name."); return; }
    setSaving(true);
    const supabase = createClient();
    if (folder) {
      const { data, error } = await supabase
        .from("business_folders")
        .update({ name: trimmed, cover_image_url: cover, parent_folder_id: hasChildren ? null : parentId })
        .eq("id", folder.id)
        .select("*").single();
      setSaving(false);
      if (error) { toast.error("Save failed: " + error.message); return; }
      onSaved(data as BusinessFolder);
      toast.success("Folder updated");
    } else {
      const { data, error } = await supabase
        .from("business_folders")
        .insert({ name: trimmed, cover_image_url: cover, parent_folder_id: parentId })
        .select("*").single();
      setSaving(false);
      if (error) { toast.error("Create failed: " + error.message); return; }
      onSaved(data as BusinessFolder);
      toast.success(`Folder "${trimmed}" created`);
    }
    onClose();
  }

  async function doDelete() {
    if (!folder) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("business_folders").delete().eq("id", folder.id);
    setSaving(false);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    onDeleted(folder.id);
    toast.success("Folder deleted — its apps are now Unfiled");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 font-bold text-zinc-900">
            <Folder className="h-4 w-4 text-sky-600" />
            {folder ? "Edit folder" : "New folder"}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Folder name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Med Spas, Restaurants, Trials"
              onKeyDown={e => { if (e.key === "Enter") save(); }} autoFocus />
          </div>
          {/* CP-128.2: file this folder inside a top-level folder, so the
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
                : "e.g. put \u201cSmoke shops\u201d inside \u201cSan Luis Obispo\u201d. One level deep."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cover image (optional)</Label>
            <ImageUploader
              bucket="folder-covers"
              pathPrefix={folder?.id ?? "new"}
              value={cover}
              onChange={setCover}
              label="Cover"
              aspectClass="aspect-[16/9]"
            />
            <p className="text-[10px] text-zinc-500">Landscape image (1600×900+). Shown on the folder card.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t bg-zinc-50">
          {folder ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-700 font-medium">Delete this folder?</span>
                <Button size="sm" variant="destructive" onClick={doDelete} disabled={saving}>Yes, delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            )
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white">
              {saving ? "Saving…" : folder ? "Save" : "Create folder"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
