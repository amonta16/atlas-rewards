"use client";
import { useState, useRef } from "react";
import { Upload, X, ImageIcon, LayoutGrid } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ImageLibraryPicker } from "./image-library-picker";
import { libraryIndustryForBusiness, type LibraryCategory } from "@/lib/image-library";

/**
 * Generic image uploader for Supabase Storage.
 * Picks a file, uploads to <bucket>/<path>, returns the public URL via onChange.
 *
 * CP-64: pass `library` to also offer "Choose from library" — the pre-curated
 * per-industry stock set — so building a demo never requires hunting images.
 */
export function ImageUploader({
  bucket, pathPrefix, value, onChange, label = "Image", aspectClass = "aspect-video", library,
}: {
  // CP-06 removed booking, but the legacy booking-tags-manager.tsx
  // component still compiles — keep "booking-tag-images" in the
  // allowlist so its image upload still typechecks.
  bucket:
    | "business-logos" | "business-heroes" | "reward-images"
    | "offer-images" | "news-images" | "membership-images"
    | "booking-tag-images"
    // CP-60: agency folder cover art.
    | "folder-covers";
  pathPrefix: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  aspectClass?: string;
  /** CP-64: enable the pre-curated library. `category` is the slot being
   *  edited; `industry` is the business's industry value (we map it to the
   *  library's slug — unknown industries just open on the first niche). */
  library?: { category: LibraryCategory; industry?: string | null };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  async function handleFile(file: File) {
    setUploading(true); setErr(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${pathPrefix}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) {
      const msg = /bucket not found/i.test(error.message)
        ? `Storage bucket "${bucket}" is missing. Run checkpoint-14-bug-fixes/01_storage_all_buckets.sql in the Supabase SQL Editor to create it.`
        : error.message;
      setErr(msg);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    // Cache-buster: ensures customer apps re-fetch even if Supabase CDN cached the prior asset at this path.
    const busted = `${publicUrl}?v=${Date.now()}`;
    onChange(busted);
    setUploading(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <div
        onClick={() => inputRef.current?.click()}
        className={`group relative rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 cursor-pointer hover:border-zinc-400 transition-colors overflow-hidden ${aspectClass}`}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <Button size="sm" type="button" variant="outline" className="bg-white">
                  <Upload className="h-3 w-3 mr-1" /> Replace
                </Button>
                <Button size="sm" type="button" variant="destructive" onClick={clear}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2 p-4">
            {uploading ? (
              <>
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                <span className="text-xs font-medium">Uploading…</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-7 w-7" />
                <span className="text-xs font-medium">Click to upload {label.toLowerCase()}</span>
                <span className="text-[10px] text-zinc-400">PNG, JPG, SVG — max ~10MB</span>
              </>
            )}
          </div>
        )}
      </div>
      {library && (
        <Button
          size="sm"
          type="button"
          variant="outline"
          className="w-full h-8 text-xs font-semibold"
          onClick={() => setLibraryOpen(true)}
        >
          <LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Choose from library
        </Button>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {library && libraryOpen && (
        <ImageLibraryPicker
          defaultCategory={library.category}
          defaultIndustry={libraryIndustryForBusiness(library.industry)}
          onSelect={(url) => { onChange(url); setLibraryOpen(false); }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}
