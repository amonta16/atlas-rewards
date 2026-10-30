"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { optimizedUrl } from "@atlas/core/img";
import type { MedspaTreatment } from "@/lib/medspa";
import { fromPrice } from "@/lib/plans";
import { IcDown, IcFilter, IcSearch, IcClose } from "./icons";

const SORTS = { featured: "Featured", low: "Price: low to high", high: "Price: high to low", az: "A to Z" } as const;
type Sort = keyof typeof SORTS;

export function TreatmentList({ slug, treatments, initialCategory, autoFocus }: {
  slug: string; treatments: MedspaTreatment[]; initialCategory: string | null; autoFocus?: boolean;
}) {
  const cats = useMemo(() => Array.from(new Set(treatments.map((t) => t.category))), [treatments]);
  const [cat, setCat] = useState<string | null>(initialCategory && cats.includes(initialCategory) ? initialCategory : null);
  const [sort, setSort] = useState<Sort>("featured");
  const [q, setQ] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(!!initialCategory);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = treatments.filter((t) => (!cat || t.category === cat) && (!needle || `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(needle)));
    const price = (t: MedspaTreatment) => t.price_cents ?? Number.MAX_SAFE_INTEGER;
    if (sort === "low") list.sort((a, b) => price(a) - price(b));
    if (sort === "high") list.sort((a, b) => (b.price_cents ?? -1) - (a.price_cents ?? -1));
    if (sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [treatments, cat, sort, q]);

  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-3">
        <button type="button" onClick={() => setFilterOpen((v) => !v)} className="flex h-9 items-center gap-1.5 text-[14px] font-medium">
          <IcFilter className="h-[18px] w-[18px]" /> Filter{cat ? ` · ${cat}` : ""}
        </button>
        <div className="relative">
          <button type="button" onClick={() => setSortOpen((v) => !v)} className="flex h-9 items-center gap-1 text-[14px] font-medium">
            Sort <IcDown className="h-4 w-4" strokeWidth={2.2} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-10 z-20 w-52 animate-rise overflow-hidden rounded-[14px] bg-white py-1 shadow-card ring-1 ring-line">
              {(Object.keys(SORTS) as Sort[]).map((k) => (
                <button key={k} type="button" onClick={() => { setSort(k); setSortOpen(false); }}
                  className={`block w-full px-4 py-2.5 text-left text-[14.5px] ${sort === k ? "font-semibold" : "text-sub"}`}>{SORTS[k]}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filterOpen && (
        <div className="animate-rise px-4 pb-1 pt-2">
          <label className="flex h-11 items-center gap-2 rounded-[14px] bg-white px-3.5 ring-1 ring-line">
            <IcSearch className="h-[18px] w-[18px] text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search treatments" autoFocus={autoFocus}
              className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><IcClose className="h-4 w-4 text-faint" /></button>}
          </label>
          <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
            {[null, ...cats].map((c) => (
              <button key={c ?? "all"} type="button" onClick={() => setCat(c)}
                className={`h-8 shrink-0 rounded-full px-3.5 text-[13.5px] font-medium ${cat === c ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-line"}`}>
                {c ?? "All"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3.5 px-4 pt-3">
        {shown.map((t, i) => (
          <Link key={t.id} href={`/${slug}/shop/treatment/${t.id}`} className="block animate-rise overflow-hidden rounded-card bg-white shadow-card" style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}>
            <div className="aspect-[16/9] bg-tint">
              {t.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedUrl(t.image_url, 720)} alt="" className="h-full w-full object-cover" loading={i < 2 ? "eager" : "lazy"} />
              )}
            </div>
            <div className="p-4">
              <span className="rounded-[6px] bg-page px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-sub">Treatment</span>
              <h3 className="mt-2.5 text-[19px] font-semibold tracking-[-0.01em]">{t.name}</h3>
              <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-sub">{t.description}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-page px-2.5 py-1 text-[12.5px] font-medium">{t.category}</span>
                <span className="rounded-full bg-page px-2.5 py-1 text-[12.5px] font-medium">{t.duration_minutes} min</span>
              </div>
              <p className="mt-3 text-[15px] text-sub">{fromPrice(t)}</p>
            </div>
          </Link>
        ))}
        {shown.length === 0 && <p className="py-16 text-center text-[15px] text-sub">No treatments match. Try another search.</p>}
      </div>
    </div>
  );
}
