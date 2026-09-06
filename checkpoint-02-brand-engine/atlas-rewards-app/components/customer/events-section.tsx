"use client";
/**
 * EventsSection — CP-132
 *
 * "Coming up" — dated happenings (tournaments, holidays, league nights).
 * Client component on purpose: dates are formatted in the customer's own
 * timezone, not the server's. Hides itself when there's nothing upcoming.
 * Used on Home (compact: first few) and on the Events tab (full list).
 */
import { useState } from "react";
import { CalendarDays, MapPin, ChevronRight, ExternalLink, X } from "lucide-react";
import { SectionHeading } from "./section-elements";
import type { Business } from "@/lib/types/database";

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  starts_at: string;
  ends_at: string | null;
  location_note: string | null;
  cta_label: string | null;
  cta_url: string | null;
};

function dayParts(iso: string) {
  const d = new Date(iso);
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.toLocaleDateString(undefined, { day: "numeric" }),
    mon: d.toLocaleDateString(undefined, { month: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    full: d.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }),
  };
}

function relativeLabel(iso: string): string | null {
  const start = new Date(iso);
  const now = new Date();
  const sameDay = start.toDateString() === now.toDateString();
  if (sameDay) return "Today";
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (start.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  const diffDays = Math.round((start.getTime() - now.getTime()) / 86_400_000);
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  return null;
}

export function EventsSection({
  business,
  events,
  title = "Coming up",
  limit,
}: {
  business: Business;
  events: EventRow[];
  title?: string;
  /** Home shows the next few; the Events tab shows everything. */
  limit?: number;
}) {
  const [open, setOpen] = useState<EventRow | null>(null);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const shown = typeof limit === "number" ? events.slice(0, limit) : events;
  if (shown.length === 0) return null;

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-2.5">
        <SectionHeading business={business} className="text-sm">{title}</SectionHeading>
        {typeof limit === "number" && events.length > limit && (
          <span className="text-[11px] font-semibold" style={{ color: "var(--surf-fg, #18181b)", opacity: 0.6 }}>
            +{events.length - limit} more
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {shown.map((ev) => {
          const p = dayParts(ev.starts_at);
          const rel = relativeLabel(ev.starts_at);
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => setOpen(ev)}
              className="w-full text-left rounded-2xl bg-white border overflow-hidden shadow-sm active:scale-[0.99] transition flex"
            >
              {/* Date block */}
              <div
                className="w-[68px] shrink-0 flex flex-col items-center justify-center py-3 text-white"
                style={{ background: `linear-gradient(160deg, ${primary}, ${secondary})` }}
              >
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-85">{p.dow}</div>
                <div className="text-2xl font-black leading-none mt-0.5">{p.day}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-85 mt-0.5">{p.mon}</div>
              </div>
              {/* Body */}
              <div className="flex-1 min-w-0 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  {rel && (
                    <div className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: primary }}>{rel}</div>
                  )}
                  <div className="font-extrabold text-[15px] leading-tight text-zinc-900 line-clamp-2">{ev.title}</div>
                  <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {p.time}</span>
                    {ev.location_note && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.location_note}</span>
                    )}
                  </div>
                </div>
                {ev.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={ev.image_url} alt="" className="h-14 w-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail sheet */}
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end justify-center" onClick={() => setOpen(null)}>
          <div
            className="w-full max-w-md bg-white rounded-t-3xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {open.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={open.image_url} alt="" className="h-44 w-full object-cover" />
            ) : (
              <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
            )}
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/40 text-white flex items-center justify-center"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="p-5 overflow-y-auto">
              <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: primary }}>
                {dayParts(open.starts_at).full}
                {open.ends_at && ` – ${dayParts(open.ends_at).time}`}
              </div>
              <h3 className="text-xl font-black leading-tight text-zinc-900 mt-1">{open.title}</h3>
              {open.location_note && (
                <div className="text-sm text-zinc-500 mt-1 inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {open.location_note}</div>
              )}
              {open.description && (
                <p className="text-[15px] text-zinc-700 leading-relaxed mt-3 whitespace-pre-line">{open.description}</p>
              )}
              {open.cta_url && (
                <a
                  href={open.cta_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-extrabold text-white"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
                >
                  {open.cta_label || "Learn more"} <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
