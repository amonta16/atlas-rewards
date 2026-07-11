"use client";
/**
 * ImageLibraryPicker — CP-64
 *
 * The "stop googling stock photos" modal. Browses the pre-curated
 * `image_library` (seeded per industry × hero/reward/offer) and returns the
 * picked image's public URL — the same shape ImageUploader produces, so the
 * two are interchangeable everywhere an image gets set in the builder.
 *
 * • Industry chips across the top (defaults to the business's niche)
 * • Hero / Rewards / Offers tabs (defaults to the slot being edited)
 * • Search box filters by title + tags
 * • Hover an image → "Use photo", or hide a dud from the library forever
 */
import { useEffect, useMemo, useState } from "react";
import { Check, EyeOff, ImageIcon, Loader2, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LIBRARY_CATEGORIES,
  libraryIndustryLabel,
  type LibraryCategory,
  type LibraryImage,
} from "@/lib/image-library";

export function ImageLibraryPicker({
  defaultIndustry,
  defaultCategory,
  onSelect,
  onClose,
}: {
  /** Library industry slug to open on (e.g. "medspa"). Unknown/null → first available. */
  defaultIndustry?: string | null;
  /** Which tab to open on — pass the slot being edited. */
  defaultCategory?: LibraryCategory;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(defaultIndustry ?? null);
  const [category, setCategory] = useState<LibraryCategory>(defaultCategory ?? "hero");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("image_library")
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
        .order("created_at");
      if (error) {
        setErr(
          /relation .* does not exist/i.test(error.message)
            ? "The image library isn't set up yet. Run checkpoint-64-image-library/cp64_image_library.sql, then seed it with scripts/seed-image-library.mjs."
            : error.message
        );
      } else {
        setRows((data ?? []) as LibraryImage[]);
      }
      setLoading(false);
    })();
  }, []);

  /** Industries that actually have images, in a stable order. */
  const industries = useMemo(() => {
    const set = new Set(rows.map((r) => r.industry));
    return [...set].sort((a, b) => libraryIndustryLabel(a).localeCompare(libraryIndustryLabel(b)));
  }, [rows]);

  // Snap to a real industry once rows load (default may be null or empty).
  useEffect(() => {
    if (!loading && industries.length && (!industry || !industries.includes(industry))) {
      setIndustry(industries[0]);
    }
  }, [loading, industries, industry]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.industry === industry &&
        r.category === category &&
        (!needle ||
          r.title.toLowerCase().includes(needle) ||
          r.tags.some((t) => t.includes(needle)))
    );
  }, [rows, industry, category, q]);

  async function hideImage(img: LibraryImage) {
    // Soft-hide a dud (agency admins only — RLS enforces it server-side).
    setRows((rs) => rs.filter((r) => r.id !== img.id));
    const supabase = createClient();
    const { error } = await supabase
      .from("image_library")
      .update({ is_active: false })
      .eq("id", img.id);
    if (error) {
      setRows((rs) => [...rs, img]); // roll back
      setErr(`Couldn't hide that image: ${error.message}`);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="px-5 pt-5 pb-4 border-b flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-lg leading-tight">Image library</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pre-curated demo photos — pick one and it drops straight in.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* filters */}
        <div className="px-5 pt-3 pb-2 space-y-2.5 border-b">
          {/* industry chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
            {industries.map((ind) => (
              <button
                key={ind}
                onClick={() => setIndustry(ind)}
                className={`px-3 h-7 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  ind === industry
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {libraryIndustryLabel(ind)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* category tabs */}
            <div className="flex rounded-lg bg-zinc-100 p-0.5">
              {LIBRARY_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                    c.value === category ? "bg-white shadow text-zinc-900" : "text-zinc-500"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {/* search */}
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search this set…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs font-medium">Loading library…</span>
            </div>
          ) : err ? (
            <p className="text-sm text-red-600 py-8 text-center max-w-md mx-auto">{err}</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
              <ImageIcon className="h-7 w-7" />
              <span className="text-xs font-medium">
                {rows.length === 0
                  ? "Library is empty — run scripts/seed-image-library.mjs to fill it."
                  : "Nothing here matches — try another tab or clear the search."}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visible.map((img) => (
                <div
                  key={img.id}
                  className="group relative rounded-xl overflow-hidden aspect-[4/3] bg-zinc-100 cursor-pointer"
                  onClick={() => onSelect(img.public_url)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.public_url}
                    alt={img.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{img.title}</p>
                      {img.credit && (
                        <p className="text-[9px] text-white/70 truncate">{img.credit}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        title="Hide from library"
                        onClick={(e) => { e.stopPropagation(); hideImage(img); }}
                        className="h-6 w-6 rounded-md bg-white/20 hover:bg-white/40 backdrop-blur flex items-center justify-center"
                      >
                        <EyeOff className="h-3 w-3 text-white" />
                      </button>
                      <span className="h-6 px-1.5 rounded-md bg-white text-zinc-900 text-[10px] font-bold flex items-center gap-0.5">
                        <Check className="h-3 w-3" /> Use
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-2.5 border-t flex items-center justify-between">
          <p className="text-[10px] text-zinc-400">
            CC-licensed photos via Openverse (creator credit on hover). Add more with{" "}
            <code className="text-zinc-500">scripts/seed-image-library.mjs</code>.
          </p>
          <Button size="sm" variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
