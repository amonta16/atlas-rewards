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
 *
 * CP-64.1: builders can UPLOAD their own photos into the shared library —
 * filed under a niche + section, tagged, searchable, and reusable in every
 * future demo app. Admins and VAs can add (RLS-enforced); only admins hide.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, EyeOff, ImageIcon, Loader2, Search, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_INDUSTRY_LABELS,
  libraryIndustryLabel,
  type LibraryCategory,
  type LibraryImage,
} from "@/lib/image-library";

const NEW_NICHE = "__new__";

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

  // ---- CP-64.1: upload panel state ----
  const [showUpload, setShowUpload] = useState(false);
  const [upIndustry, setUpIndustry] = useState<string>(defaultIndustry ?? "medspa");
  const [upNewNiche, setUpNewNiche] = useState("");
  const [upCategory, setUpCategory] = useState<LibraryCategory>(defaultCategory ?? "hero");
  const [upTags, setUpTags] = useState("");
  const [upBusy, setUpBusy] = useState(false);
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const upFileRef = useRef<HTMLInputElement>(null);

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

  /** Upload destination choices: every known label + every niche with images. */
  const uploadIndustries = useMemo(() => {
    const set = new Set([...Object.keys(LIBRARY_INDUSTRY_LABELS), ...industries]);
    return [...set].sort((a, b) => libraryIndustryLabel(a).localeCompare(libraryIndustryLabel(b)));
  }, [industries]);

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

  // ---- CP-64.1: upload handler ----
  async function handleUpload(files: FileList) {
    const targetIndustry =
      upIndustry === NEW_NICHE
        ? upNewNiche.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        : upIndustry;
    if (!targetIndustry) {
      setUpMsg("Give the new niche a name first.");
      return;
    }
    setUpBusy(true);
    setUpMsg(null);
    const supabase = createClient();
    const tags = [
      ...new Set([
        targetIndustry,
        upCategory,
        "custom",
        ...upTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      ]),
    ];
    let ok = 0;
    let firstErr: string | null = null;

    for (const file of Array.from(files)) {
      try {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const safe = file.name
          .replace(/\.[^.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40) || "photo";
        const storagePath = `${targetIndustry}/${upCategory}/upload-${Date.now()}-${safe}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("image-library")
          .upload(storagePath, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: { publicUrl } } = supabase.storage.from("image-library").getPublicUrl(storagePath);
        const title = safe.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
        const { data: inserted, error: dbErr } = await supabase
          .from("image_library")
          .insert({
            industry: targetIndustry,
            category: upCategory,
            title,
            tags,
            storage_path: storagePath,
            public_url: publicUrl,
            credit: "Team upload",
            is_active: true,
            sort_order: 0,
          })
          .select()
          .single();
        if (dbErr) throw new Error(dbErr.message);
        if (inserted) setRows((rs) => [inserted as LibraryImage, ...rs]);
        ok++;
      } catch (e: any) {
        firstErr = firstErr ?? (e?.message || "upload failed");
      }
    }

    setUpBusy(false);
    if (ok > 0) {
      // Jump the browser to where the new photos landed.
      setIndustry(targetIndustry);
      setCategory(upCategory);
      setQ("");
      setShowUpload(false);
      setUpTags("");
      setUpNewNiche("");
    }
    setUpMsg(
      firstErr
        ? `${ok} uploaded, then hit an error: ${firstErr}${/row-level security/i.test(firstErr) ? " — run cp64_1_library_uploads.sql so admins + VAs can upload." : ""}`
        : null
    );
    if (upFileRef.current) upFileRef.current.value = "";
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
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              type="button"
              variant={showUpload ? "default" : "outline"}
              className="h-8 text-xs font-semibold"
              onClick={() => { setShowUpload(v => !v); setUpMsg(null); }}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload photos
            </Button>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-full hover:bg-zinc-100 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* CP-64.1: upload panel */}
        {showUpload && (
          <div className="px-5 py-3 border-b bg-zinc-50 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-8 rounded-md border border-input bg-white px-2 text-xs font-semibold"
                value={upIndustry}
                onChange={(e) => setUpIndustry(e.target.value)}
              >
                {uploadIndustries.map((slug) => (
                  <option key={slug} value={slug}>{libraryIndustryLabel(slug)}</option>
                ))}
                <option value={NEW_NICHE}>＋ New niche…</option>
              </select>
              {upIndustry === NEW_NICHE && (
                <Input
                  className="h-8 w-36 text-xs"
                  placeholder="e.g. Pet Grooming"
                  value={upNewNiche}
                  onChange={(e) => setUpNewNiche(e.target.value)}
                />
              )}
              <div className="flex rounded-lg bg-white border p-0.5">
                {LIBRARY_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setUpCategory(c.value)}
                    className={`px-2.5 h-7 rounded-md text-xs font-semibold transition-colors ${
                      c.value === upCategory ? "bg-zinc-900 text-white" : "text-zinc-500"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <Input
                className="h-8 flex-1 min-w-[140px] text-xs"
                placeholder="Tags (comma separated) — e.g. botox, luxury, close-up"
                value={upTags}
                onChange={(e) => setUpTags(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={upFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }}
              />
              <Button
                size="sm"
                type="button"
                className="h-8 text-xs font-semibold"
                disabled={upBusy || (upIndustry === NEW_NICHE && !upNewNiche.trim())}
                onClick={() => upFileRef.current?.click()}
              >
                {upBusy ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5 mr-1.5" /> Choose files</>
                )}
              </Button>
              <p className="text-[10px] text-zinc-500">
                They're filed under this niche + section, tagged, and reusable in every future demo.
              </p>
            </div>
            {upMsg && <p className="text-xs text-red-600">{upMsg}</p>}
          </div>
        )}

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
                  ? "Library is empty — run scripts/seed-image-library.mjs to fill it, or upload your own photos above."
                  : "Nothing here matches — try another tab, clear the search, or upload your own."}
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
            Photos via Pexels + your own uploads. Add more with{" "}
            <code className="text-zinc-500">scripts/seed-image-library.mjs</code> or the Upload button.
          </p>
          <Button size="sm" variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
