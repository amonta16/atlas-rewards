"use client";
/**
 * SpecialsStrip — CP-132
 *
 * "This week" — the venue's standing weekly deals (Tue $2 games, Thu
 * unlimited after 7pm, Sat family hours). Seven day chips, today first
 * and highlighted; tap a day to see its deals. Client component so "today"
 * is the customer's day, not the server's. Hides itself when empty.
 */
import { useMemo, useState } from "react";
import { SectionHeading } from "./section-elements";
import type { Business } from "@/lib/types/database";

export type SpecialRow = {
  id: string;
  day_of_week: number;   // 0 = Sunday
  title: string;
  detail: string | null;
};

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SpecialsStrip({
  business,
  specials,
  title = "This week",
}: {
  business: Business;
  specials: SpecialRow[];
  title?: string;
}) {
  const today = new Date().getDay();
  const [sel, setSel] = useState<number>(today);
  const primary = business.brand_colors.primary;

  // Days in order starting from today, so the strip always opens on "now".
  const order = useMemo(() => Array.from({ length: 7 }, (_, i) => (today + i) % 7), [today]);
  const byDay = useMemo(() => {
    const m: Record<number, SpecialRow[]> = {};
    for (const s of specials) (m[s.day_of_week] ??= []).push(s);
    return m;
  }, [specials]);

  if (specials.length === 0) return null;
  const list = byDay[sel] ?? [];

  return (
    <div className="px-4 mt-6">
      <SectionHeading business={business} className="text-sm">{title}</SectionHeading>
      <div className="mt-2.5 rounded-2xl bg-white border shadow-sm overflow-hidden">
        {/* Day chips */}
        <div className="flex gap-1.5 p-2 overflow-x-auto no-scrollbar">
          {order.map((d) => {
            const has = (byDay[d]?.length ?? 0) > 0;
            const on = d === sel;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSel(d)}
                className="shrink-0 rounded-xl px-3 py-2 text-center transition"
                style={on
                  ? { background: primary, color: "#fff" }
                  : { background: has ? `${primary}14` : "#f4f4f5", color: has ? "#18181b" : "#a1a1aa" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">{d === today ? "Today" : DAY_SHORT[d]}</div>
                <div className="mt-0.5 flex justify-center">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? "rgba(255,255,255,.9)" : has ? primary : "transparent" }} />
                </div>
              </button>
            );
          })}
        </div>
        {/* Deals for the selected day */}
        <div className="border-t px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{DAY_LONG[sel]}</div>
          {list.length === 0 ? (
            <div className="text-sm text-zinc-500 mt-1">No specials — regular pricing.</div>
          ) : (
            <div className="mt-1.5 space-y-2">
              {list.map((s) => (
                <div key={s.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: primary }} />
                  <div className="min-w-0">
                    <div className="font-extrabold text-[15px] leading-tight text-zinc-900">{s.title}</div>
                    {s.detail && <div className="text-[12px] text-zinc-500 mt-0.5">{s.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
