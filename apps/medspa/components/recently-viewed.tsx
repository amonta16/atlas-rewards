"use client";
/**
 * Home's "Recently viewed" grid. What a patient opens is remembered on this
 * device (TrackView on the detail screens). Until they've opened something,
 * the same grid shows the clinic's popular items.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { optimizedUrl } from "@atlas/core/img";

export type CatalogItem = { key: string; name: string; price: string; image: string | null; href: string };

const storeKey = (slug: string) => `ms_recent_${slug}`;

export function TrackView({ slug, itemKey }: { slug: string; itemKey: string }) {
  useEffect(() => {
    try {
      const prev = JSON.parse(localStorage.getItem(storeKey(slug)) ?? "[]") as string[];
      localStorage.setItem(storeKey(slug), JSON.stringify([itemKey, ...prev.filter((k) => k !== itemKey)].slice(0, 8)));
    } catch { /* private window: the grid just stays on Popular */ }
  }, [slug, itemKey]);
  return null;
}

export function RecentlyViewed({ slug, catalog }: { slug: string; catalog: CatalogItem[] }) {
  const [recent, setRecent] = useState<CatalogItem[]>([]);
  useEffect(() => {
    try {
      const keys = JSON.parse(localStorage.getItem(storeKey(slug)) ?? "[]") as string[];
      setRecent(keys.map((k) => catalog.find((c) => c.key === k)).filter(Boolean).slice(0, 4) as CatalogItem[]);
    } catch { /* fine */ }
  }, [slug, catalog]);
  const shown = recent.length >= 2 ? recent : catalog.slice(0, 4);
  if (!shown.length) return null;
  return (
    <section className="px-4 pt-7">
      <h3 className="text-center text-[20px] font-semibold tracking-[-0.015em]">{recent.length >= 2 ? "Recently viewed" : "Popular right now"}</h3>
      <div className="mt-4 grid grid-cols-2 gap-x-2.5 gap-y-5">
        {shown.map((c) => (
          <Link key={c.key} href={c.href} className="min-w-0">
            <div className="aspect-[4/5] overflow-hidden rounded-[10px] bg-page">
              {c.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={optimizedUrl(c.image, 420)} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </div>
            <p className="mt-2 truncate text-[13.5px] font-medium">{c.name}</p>
            <p className="mt-0.5 text-[13.5px] font-semibold">{c.price}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
