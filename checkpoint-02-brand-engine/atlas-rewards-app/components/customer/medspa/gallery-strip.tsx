"use client";
/**
 * GalleryStrip — CP-185 · before & after on the med spa Home.
 * Only pairs with consent + both photos render. Tap a card to flip
 * before ⇄ after; the label says which you're looking at.
 */
import { useState } from "react";
import { HeadingByStyle } from "@/components/customer/section-elements";
import type { MedspaGalleryItem } from "@/lib/medspa";

export function GalleryStrip({ items, primary, secondary, headingStyle }: { items: MedspaGalleryItem[]; primary: string; secondary: string; headingStyle?: string | null }) {
  const list = items.filter((g) => g.consent && g.before_url && g.after_url);
  if (list.length === 0) return null;
  return (
    <section className="mt-7">
      <div className="px-4 flex items-baseline justify-between">
        <HeadingByStyle styleId={headingStyle} primary={primary} secondary={secondary} className="text-base">Real results</HeadingByStyle>
        <span className="text-xs text-zinc-500">Tap to compare</span>
      </div>
      <div className="mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((g) => <Pair key={g.id} g={g} primary={primary} />)}
      </div>
    </section>
  );
}

function Pair({ g, primary }: { g: MedspaGalleryItem; primary: string }) {
  const [after, setAfter] = useState(true);
  return (
    <button type="button" onClick={() => setAfter((v) => !v)} className="relative w-[170px] shrink-0 overflow-hidden rounded-3xl bg-zinc-100 text-left shadow-sm ring-1 ring-black/5 active:scale-[0.98] transition" aria-label={`${g.title}: showing ${after ? "after" : "before"}. Tap to see ${after ? "before" : "after"}.`}>
      <div className="relative aspect-[4/5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={g.before_url!} alt="" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${after ? "opacity-0" : "opacity-100"}`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={g.after_url!} alt="" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${after ? "opacity-100" : "opacity-0"}`} />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white" style={{ background: after ? primary : "rgba(0,0,0,.55)" }}>{after ? "After" : "Before"}</span>
        <div className="absolute inset-x-0 bottom-0 p-3 text-white">
          <div className="truncate text-[13px] font-bold">{g.title || "Result"}</div>
          {g.caption && <div className="truncate text-[11px] opacity-85">{g.caption}</div>}
        </div>
      </div>
    </button>
  );
}
