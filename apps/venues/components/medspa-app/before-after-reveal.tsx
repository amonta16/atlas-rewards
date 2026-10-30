"use client";
/**
 * BeforeAfterReveal — Dermis-style interactive before/after
 *
 * Replaces the CP-213 tap-to-flip rail. Each card holds the before/after on
 * one image: a draggable split line that the patient slides to reveal the
 * after. First time the card enters the viewport it auto-plays the reveal
 * once, so the interaction is obvious.
 *
 * Props: a MedspaGalleryItem (consent-cleared, after image present).
 */
import { useEffect, useRef, useState } from "react";
import { optimizedUrl } from "@/lib/img";
import type { MedspaGalleryItem } from "@/lib/medspa";

export function BeforeAfterCard({ item, autoPlay = true }: { item: MedspaGalleryItem; autoPlay?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const [pct, setPct] = useState(78); // start showing most of "After" so the reveal is read as a change
  const [played, setPlayed] = useState(false);

  // Auto reveal once when the card scrolls in: sweep left → right → settle at 50/50.
  useEffect(() => {
    if (!autoPlay || played) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setPct(50); setPlayed(true); return; }
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const dur = 1600;
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        // ease out, overshoot to 20%, back to 50
        const eased = 1 - Math.pow(1 - t, 3);
        const next = 78 - (78 - 20) * Math.min(1, eased * 1.6);
        if (t < 0.6) setPct(next);
        else {
          const t2 = (t - 0.6) / 0.4;
          setPct(20 + (50 - 20) * (1 - Math.pow(1 - t2, 2)));
        }
        if (t < 1) requestAnimationFrame(tick);
        else setPlayed(true);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [autoPlay, played]);

  const update = (clientX: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const p = ((clientX - r.left) / r.width) * 100;
    setPct(Math.max(2, Math.min(98, p)));
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = true;
    update(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => { if (dragRef.current) update(e.clientX); };
  const onUp = () => { dragRef.current = false; };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); setPct((p) => Math.max(2, p - 4)); }
    else if (e.key === "ArrowRight") { e.preventDefault(); setPct((p) => Math.min(98, p + 4)); }
    else if (e.key === "Home") { setPct(2); }
    else if (e.key === "End") { setPct(98); }
  };

  if (!item.after_url) return null;
  const before = item.before_url ?? item.after_url;
  const after = item.after_url;

  return (
    <figure className="group relative overflow-hidden rounded-[22px] bg-black/5 ring-1 ring-[var(--ms-line)]"
      style={{ aspectRatio: "4 / 5" }}>
      <div
        ref={rootRef}
        role="slider"
        tabIndex={0}
        aria-label={`Compare before and after for ${item.title}. Drag to reveal.`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="absolute inset-0 touch-none select-none focus:outline-none"
      >
        {/* AFTER — base layer (full) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={optimizedUrl(after, 800)} alt={`${item.title}, after`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        {/* BEFORE — clipped to the left of the handle */}
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={optimizedUrl(before, 800)} alt="" className="h-full w-full object-cover" draggable={false}
            style={{ width: `${(100 / Math.max(pct, 0.001)) * 100}%`, maxWidth: "none" }} />
        </div>
        {/* Chips */}
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur-sm">Before</span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white backdrop-blur-sm" style={{ background: "color-mix(in srgb, var(--ms-p) 85%, #000)" }}>After</span>
        {/* Handle */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
          <div className="absolute inset-y-0 w-[2.5px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_8px_20px_-6px_rgba(0,0,0,0.35)]" />
          <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ms-ink)" }}>
              <polyline points="15 18 9 12 15 6" />
              <polyline points="9 18 15 12 9 6" transform="translate(6 0)" />
            </svg>
          </div>
        </div>
        {/* First-use hint, fades after the auto-play finishes */}
        {!played && (
          <div className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center">
            <span className="rounded-full bg-white/92 px-3 py-1 text-[12px] font-semibold text-[var(--ms-ink)] shadow-md">
              Drag to compare
            </span>
          </div>
        )}
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-4 pt-10 text-white">
        <span className="block truncate text-[16px] font-semibold leading-tight">{item.title}</span>
        {item.caption && <span className="mt-0.5 block truncate text-[12.5px] text-white/85">{item.caption}</span>}
      </figcaption>
    </figure>
  );
}

/** The Home rail: full-width hero card + a horizontal rail of smaller ones. */
export function BeforeAfterSection({ items }: { items: MedspaGalleryItem[] }) {
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
