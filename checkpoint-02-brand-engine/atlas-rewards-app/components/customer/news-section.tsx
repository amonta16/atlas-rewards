"use client";
/**
 * NewsSection — CP-69
 *
 * The "News & updates" block on the customer Home, revamped from tiny
 * image-left rows into big billboard cards: full-width image, real
 * headline, and — finally — TAPPABLE. Tapping a post opens a detail
 * sheet with the full-size image and the complete body text.
 */
import { useState } from "react";
import { Newspaper, X, ChevronRight } from "lucide-react";
import { SectionHeading } from "./section-elements";
import type { Business } from "@/lib/types/database";

export type NewsPostRow = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  published_at: string;
};

export function NewsSection({
  business,
  posts,
}: {
  business: Business;
  posts: NewsPostRow[];
}) {
  const [open, setOpen] = useState<NewsPostRow | null>(null);
  const primary = business.brand_colors.primary;
  const sec = business.brand_colors.secondary;

  if (!posts.length) return null;

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <div className="px-4 mt-5 pb-4">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Newspaper className="h-3.5 w-3.5" style={{ color: "var(--surf-fg)" }} />
          <SectionHeading business={business} className="text-sm">News &amp; updates</SectionHeading>
        </div>

        <div className="space-y-3">
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              onClick={() => setOpen(post)}
              className="w-full text-left rounded-2xl border bg-white overflow-hidden shadow-sm ring-1 ring-black/5 hover:shadow-md active:scale-[0.99] transition"
            >
              {post.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={post.image_url} alt={post.title} className="h-36 w-full object-cover" />
              )}
              <div className="p-3.5">
                <div className="text-base font-extrabold leading-tight text-zinc-900">{post.title}</div>
                {post.body && (
                  <div className="text-[13px] text-zinc-500 leading-snug mt-1 line-clamp-2">{post.body}</div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">{fmt(post.published_at)}</span>
                  <span
                    className="inline-flex items-center gap-0.5 text-[11px] font-extrabold"
                    style={{ color: primary }}
                  >
                    Read more <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail sheet — big image, full body. */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[88vh] flex flex-col shadow-2xl">
            <button
              onClick={() => setOpen(null)}
              className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-white" />
            </button>

            {open.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={open.image_url} alt={open.title} className="h-56 w-full object-cover shrink-0" />
            ) : (
              <div
                className="h-24 w-full shrink-0"
                style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
              />
            )}

            <div className="p-5 overflow-y-auto">
              <span
                className="inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
              >
                <Newspaper className="h-2.5 w-2.5" /> {business.name}
              </span>
              <h2 className="text-xl font-black leading-tight text-zinc-900 mt-2">{open.title}</h2>
              <div className="text-[11px] text-zinc-400 mt-1">{fmt(open.published_at)}</div>
              {open.body && (
                <p className="text-sm text-zinc-700 leading-relaxed mt-3 whitespace-pre-wrap">{open.body}</p>
              )}
              <button
                onClick={() => setOpen(null)}
                className="mt-5 w-full h-11 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition"
                style={{
                  background: `linear-gradient(135deg, ${primary}, ${sec})`,
                  boxShadow: "var(--atlas-cta-glow, 0 1px 2px 0 rgb(0 0 0 / 0.05))",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
