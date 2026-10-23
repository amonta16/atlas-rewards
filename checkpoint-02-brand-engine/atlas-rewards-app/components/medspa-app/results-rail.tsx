"use client";
/**
 * ResultsRail — CP-213 · "Real results" on the med spa Home (Dermis pattern).
 *
 * Before/after pairs from Builder → Gallery (only items with patient consent
 * and an after photo). Each card shows the AFTER; tap to flip to BEFORE.
 */
import { useState } from "react";
import { optimizedUrl } from "@/lib/img";
import type { MedspaGalleryItem } from "@/lib/medspa";

export function ResultsRail({ items }: { items: MedspaGalleryItem[] }) {
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  if (items.length === 0) return null;
  return (
    <section className="pt-9">
      <div className="flex items-baseline justify-between px-5">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Real results</h2>
        <span className="text-[15px]" style={{ color: "var(--ms-sub)" }}>Tap to compare</span>
      </div>
      <div className="ms-rail mt-4 flex gap-3 overflow-x-auto px-5 pb-1 scroll-px-5">
        {items.map((g) => {
          const before = !!flipped[g.id] && !!g.before_url;
          const src = before ? g.before_url : g.after_url;
          return (
            <button key={g.id} type="button" onClick={() => setFlipped((f) => ({ ...f, [g.id]: !f[g.id] }))}
              aria-label={`${g.title}: showing ${before ? "before" : "after"}. Tap to compare.`}
              className="relative h-[220px] w-[172px] shrink-0 overflow-hidden rounded-[18px] bg-[var(--ms-chip)] text-left active:scale-[.98] transition">
              {src && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={optimizedUrl(src, 360)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-white" style={{ background: before ? "rgba(38,43,61,.85)" : "var(--ms-p)" }}>
                {before ? "Before" : "After"}
              </span>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-white">
                <span className="block truncate text-[15px] font-semibold">{g.title}</span>
                {g.caption && <span className="block truncate text-[12px] text-white/80">{g.caption}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
