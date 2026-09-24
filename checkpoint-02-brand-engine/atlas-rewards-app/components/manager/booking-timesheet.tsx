"use client";
/**
 * BookingTimesheet — CP-148 · the day at a glance
 *
 * Time down the left (opening → closing, 30-min rows), one column per
 * bookable unit across the top (Cage #1 … #6; a resource with units=4
 * becomes four columns "Bay 1"…"Bay 4"). Bookings are blocks; empty cells
 * are tappable (→ walk-in form pre-filled with that cage + time). A red
 * "now" line runs across today.
 *
 * Unit columns for a multi-unit resource are assigned greedily
 * (interval partitioning) — the DB only guarantees the COUNT never exceeds
 * `units`, so any non-overlapping arrangement is a valid picture of the day.
 */
import { useMemo } from "react";
import { Users, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { type BookingResource, type DeskBooking, type BookingStatus, isoDay } from "@/lib/booking";
import type { Business } from "@/lib/types/database";

export type SheetColumn = { key: string; resource: BookingResource; unitIndex: number; label: string; sub?: string };

const ROW_MIN = 30;          // minutes per row
const ROW_PX = 44;           // px per row
const HEAD_H = 56;

const BLOCK_STYLE: Record<BookingStatus, string> = {
  pending:   "bg-amber-100 border-amber-300 text-amber-900",
  confirmed: "bg-emerald-100 border-emerald-300 text-emerald-900",
  completed: "bg-zinc-100 border-zinc-300 text-zinc-600",
  cancelled: "bg-rose-50 border-rose-200 text-rose-500 line-through opacity-70",
  no_show:   "bg-rose-50 border-rose-200 text-rose-600 opacity-80",
};

function toMin(t: string): number { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }

/** Opening window (minutes from midnight) for a resource on a weekday. */
function windowFor(r: BookingResource, business: Business, isodow: number): [number, number] | null {
  if (r.hours) {
    const w = r.hours[String(isodow)];
    if (!w || w.length === 0) return null;
    return [Math.min(...w.map(x => toMin(x[0]))), Math.max(...w.map(x => toMin(x[1])))];
  }
  const bh = business.booking_hours;
  const days: number[] = (bh?.days as number[] | undefined) ?? [1, 2, 3, 4, 5, 6, 7];
  if (!days.includes(isodow)) return null;
  return [toMin(bh?.start ?? "09:00"), toMin(bh?.end ?? "21:00")];
}

export function columnsFor(resources: BookingResource[]): SheetColumn[] {
  const cols: SheetColumn[] = [];
  for (const r of resources) {
    if (r.units <= 1) {
      cols.push({ key: r.id, resource: r, unitIndex: 0, label: r.name });
    } else {
      const unit = r.unit_label.charAt(0).toUpperCase() + r.unit_label.slice(1);
      for (let i = 0; i < r.units; i++) cols.push({ key: `${r.id}:${i}`, resource: r, unitIndex: i, label: `${unit} ${i + 1}`, sub: r.name });
    }
  }
  return cols;
}

/** Greedy lane assignment per resource → column key for each booking. */
function assignLanes(bookings: DeskBooking[], resources: BookingResource[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of resources) {
    const mine = bookings
      .filter(b => b.resource_id === r.id && (b.status === "pending" || b.status === "confirmed" || b.status === "completed"))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const laneEnd: number[] = Array.from({ length: Math.max(1, r.units) }, () => 0);
    for (const b of mine) {
      const s = new Date(b.scheduled_at).getTime(), e = new Date(b.scheduled_end).getTime();
      let lane = laneEnd.findIndex(end => end <= s);
      if (lane < 0) lane = laneEnd.indexOf(Math.min(...laneEnd)); // over capacity (shouldn't happen) — stack on earliest
      laneEnd[lane] = e;
      out.set(b.id, r.units <= 1 ? r.id : `${r.id}:${lane}`);
    }
    // cancelled / no-show still get drawn (faded) in lane 0 so staff see them
    for (const b of bookings.filter(b => b.resource_id === r.id && !out.has(b.id))) out.set(b.id, r.units <= 1 ? r.id : `${r.id}:0`);
  }
  return out;
}

export function BookingTimesheet({
  business, resources, bookings, day, onPickSlot, onPickBooking, selectedId,
}: {
  business: Business;
  resources: BookingResource[];
  bookings: DeskBooking[];
  /** YYYY-MM-DD local */
  day: string;
  onPickSlot: (resource: BookingResource, startsAt: Date) => void;
  onPickBooking: (b: DeskBooking) => void;
  selectedId?: string | null;
}) {
  const primary = business.brand_colors.primary;
  const dayDate = useMemo(() => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); }, [day]);
  const isodow = ((dayDate.getDay() + 6) % 7) + 1;
  const isToday = isoDay(new Date()) === day;

  const cols = useMemo(() => columnsFor(resources), [resources]);

  // Sheet range = union of every resource's window that day; closed resources get shaded.
  const windows = useMemo(() => new Map(resources.map(r => [r.id, windowFor(r, business, isodow)])), [resources, business, isodow]);
  const open = [...windows.values()].filter((w): w is [number, number] => !!w);
  const startMin = open.length ? Math.floor(Math.min(...open.map(w => w[0])) / ROW_MIN) * ROW_MIN : 9 * 60;
  const endMin   = open.length ? Math.ceil(Math.max(...open.map(w => w[1])) / ROW_MIN) * ROW_MIN : 21 * 60;
  const rows = Math.max(1, (endMin - startMin) / ROW_MIN);

  const lanes = useMemo(() => assignLanes(bookings, resources), [bookings, resources]);

  const minsFrom = (iso: string) => {
    const d = new Date(iso);
    return (d.getTime() - new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime()) / 60_000;
  };
  const nowMin = isToday ? minsFrom(new Date().toISOString()) : null;

  const hourLabel = (min: number) => {
    const h = Math.floor(min / 60), m = min % 60;
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: m ? "2-digit" : undefined });
  };

  if (cols.length === 0) {
    return <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500">Add something bookable under Set up to see the day sheet.</div>;
  }
  if (open.length === 0) {
    return <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500">Closed {dayDate.toLocaleDateString(undefined, { weekday: "long" })}s.</div>;
  }

  const colW = cols.length <= 4 ? "minmax(150px,1fr)" : "minmax(120px,1fr)";

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `64px repeat(${cols.length}, ${colW})`, minWidth: 64 + cols.length * (cols.length <= 4 ? 150 : 120) }}
        >
          {/* Header row */}
          <div className="sticky top-0 z-20 bg-white border-b" style={{ height: HEAD_H }} />
          {cols.map(c => (
            <div key={c.key} className="sticky top-0 z-20 bg-white border-b border-l px-2 flex flex-col justify-center" style={{ height: HEAD_H }}>
              <div className="text-[12px] font-extrabold leading-tight truncate">{c.label}</div>
              {c.sub && <div className="text-[10px] text-zinc-500 truncate">{c.sub}</div>}
              {!c.sub && c.resource.durations.length > 0 && (
                <div className="text-[10px] text-zinc-500 truncate">{c.resource.durations.map(d => d % 60 === 0 ? `${d / 60}h` : `${d}m`).join(" / ")}</div>
              )}
            </div>
          ))}

          {/* Time gutter */}
          <div className="relative" style={{ height: rows * ROW_PX }}>
            {Array.from({ length: rows }).map((_, i) => {
              const min = startMin + i * ROW_MIN;
              const onHour = min % 60 === 0;
              return (
                <div key={i} className="absolute left-0 right-0 pr-2 text-right" style={{ top: i * ROW_PX - 7 }}>
                  {onHour && <span className="text-[11px] font-semibold text-zinc-500">{hourLabel(min)}</span>}
                </div>
              );
            })}
          </div>

          {/* Columns */}
          {cols.map(c => {
            const w = windows.get(c.resource.id) ?? null;
            const blocks = bookings.filter(b => lanes.get(b.id) === c.key);
            return (
              <div key={c.key} className="relative border-l" style={{ height: rows * ROW_PX }}>
                {/* cells */}
                {Array.from({ length: rows }).map((_, i) => {
                  const min = startMin + i * ROW_MIN;
                  const closed = !w || min < w[0] || min + ROW_MIN > w[1];
                  const past = isToday && nowMin !== null && min + ROW_MIN <= nowMin;
                  const onHour = min % 60 === 0;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={closed}
                      onClick={() => {
                        const d = new Date(dayDate); d.setHours(Math.floor(min / 60), min % 60, 0, 0);
                        onPickSlot(c.resource, d);
                      }}
                      className={cn(
                        "absolute left-0 right-0 border-t transition",
                        onHour ? "border-zinc-200" : "border-zinc-100 border-dashed",
                        closed ? "bg-[repeating-linear-gradient(135deg,#f4f4f5_0_6px,#fafafa_6px_12px)] cursor-default" : past ? "bg-zinc-50/60 hover:bg-zinc-100" : "hover:bg-sky-50",
                      )}
                      style={{ top: i * ROW_PX, height: ROW_PX }}
                      aria-label={closed ? "Closed" : `Book ${c.label} at ${hourLabel(min)}`}
                    />
                  );
                })}

                {/* bookings */}
                {blocks.map(b => {
                  const s = minsFrom(b.scheduled_at), e = minsFrom(b.scheduled_end);
                  const top = ((s - startMin) / ROW_MIN) * ROW_PX;
                  const h = Math.max(ROW_PX * 0.9, ((e - s) / ROW_MIN) * ROW_PX - 3);
                  const short = h < ROW_PX * 1.4;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onPickBooking(b)}
                      className={cn(
                        "absolute left-1 right-1 rounded-lg border px-2 py-1 text-left shadow-sm overflow-hidden transition hover:shadow-md",
                        BLOCK_STYLE[b.status],
                        selectedId === b.id && "ring-2 ring-offset-1",
                      )}
                      style={{ top: top + 1, height: h, ["--tw-ring-color" as string]: primary }}
                    >
                      <div className="text-[12px] font-extrabold leading-tight truncate flex items-center gap-1">
                        {b.customer_name ?? "Guest"}
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold opacity-80"><Users className="h-3 w-3" />{b.party_size}</span>
                      </div>
                      {!short && (
                        <div className="text-[10px] leading-tight opacity-80 truncate">
                          {b.status === "pending" ? "Needs confirm · " : ""}
                          {b.customer_phone ? <><Phone className="h-2.5 w-2.5 inline -mt-0.5" /> {b.customer_phone}</> : b.source === "desk" ? "walk-in" : "app"}
                          {b.notes ? ` · ${b.notes}` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* now line */}
          {nowMin !== null && nowMin >= startMin && nowMin <= endMin && (
            <div
              className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
              style={{ top: HEAD_H + ((nowMin - startMin) / ROW_MIN) * ROW_PX }}
            >
              <span className="ml-[52px] h-2.5 w-2.5 rounded-full bg-rose-500 shadow" />
              <span className="flex-1 h-[2px] bg-rose-500/80" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
