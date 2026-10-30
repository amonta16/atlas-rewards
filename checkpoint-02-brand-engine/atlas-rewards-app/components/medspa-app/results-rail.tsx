"use client";
/**
 * ResultsRail — "Real results" on the med spa Home (Dermis pattern).
 *
 * Before/after pairs from Builder → Gallery (only items with patient consent
 * and an after photo). First card is a full-width draggable slider that
 * auto-reveals once on first view; the rest sit in a horizontal rail with
 * their own smaller sliders. CP-213: originally a tap-to-flip rail.
 */
import { BeforeAfterCard } from "./before-after-reveal";
import type { MedspaGalleryItem } from "@/lib/medspa";

export function ResultsRail({ items }: { items: MedspaGalleryItem[] }) {
  if (items.length === 0) return null;
  const [first, ...rest] = items;
  return (
    <section className="pt-9">
      <div className="flex items-baseline justify-between px-5">
        <h2 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Real results</h2>
        <span className="text-[15px]" style={{ color: "var(--ms-sub)" }}>Drag to compare</span>
      </div>
      <div className="mt-4 px-5">
        <BeforeAfterCard item={first} />
      </div>
      {rest.length > 0 && (
        <div className="ms-rail mt-3 flex gap-3 overflow-x-auto px-5 pb-1 scroll-px-5">
          {rest.map((g) => (
            <div key={g.id} className="w-[200px] shrink-0">
              <BeforeAfterCard item={g} autoPlay={false} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
