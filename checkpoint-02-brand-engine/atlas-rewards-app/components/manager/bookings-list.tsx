"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Phone, User as UserIcon, Check, X, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

type BookingRow = {
  id: string;
  tag_id: string | null;
  tag_name: string;
  duration_minutes: number;
  scheduled_at: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
};

const STATUS_COLOR: Record<BookingRow["status"], string> = {
  pending:   "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-zinc-100 text-zinc-700",
  cancelled: "bg-rose-100 text-rose-800",
  no_show:   "bg-rose-100 text-rose-800",
};

/** Bookings list for the manager dashboard. Grouped by day. */
export function BookingsList({ business }: { business: Business }) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "all" | "today">("upcoming");

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const now = new Date();
    const from = filter === "all"
      ? new Date(now.getTime() - 60 * 86_400_000)
      : filter === "today"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : now;
    const to = filter === "today"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : new Date(now.getTime() + 60 * 86_400_000);
    const { data } = await supabase.rpc("list_bookings", {
      p_business_id: business.id,
      p_from: from.toISOString(),
      p_to:   to.toISOString(),
    });
    setRows((data ?? []) as BookingRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [business.id, filter]);

  async function updateStatus(id: string, status: BookingRow["status"], reason?: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("update_booking_status", {
      p_id: id, p_status: status, p_reason: reason ?? null,
    });
    if (error) { alert(error.message); return; }
    load();
  }

  const grouped = groupByDay(rows);

  return (
    <div className="rounded-2xl border bg-white">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-violet-500" /> Bookings
        </h3>
        <div className="flex gap-1">
          {(["today", "upcoming", "all"] as const).map(f => (
            <button key={f}
              onClick={() => setFilter(f)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition ${
                filter === f ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <CalendarClock className="h-7 w-7 mx-auto mb-2 text-zinc-300" />
          No bookings in this window.
        </div>
      ) : (
        <div className="divide-y">
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-zinc-50">
                {prettyDay(day)}
              </div>
              {items.map(b => (
                <div key={b.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-sm truncate">{b.tag_name}</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status]}`}>
                          {b.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(b.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        · {b.duration_minutes}m
                      </div>
                      {(b.customer_name || b.customer_phone) && (
                        <div className="text-[11px] text-zinc-700 flex items-center gap-2 mt-1 flex-wrap">
                          {b.customer_name && <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" /> {b.customer_name}</span>}
                          {b.customer_phone && (
                            <a href={`tel:${b.customer_phone}`} className="flex items-center gap-1 text-sky-600 underline">
                              <Phone className="h-3 w-3" /> {b.customer_phone}
                            </a>
                          )}
                        </div>
                      )}
                      {b.notes && <div className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">"{b.notes}"</div>}
                    </div>
                  </div>
                  {b.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1" onClick={() => updateStatus(b.id, "confirmed")}>
                        <Check className="h-3 w-3 mr-1" /> Confirm
                      </Button>
                      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => {
                        const reason = prompt("Reason for cancelling? (optional)") ?? undefined;
                        updateStatus(b.id, "cancelled", reason);
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {b.status === "confirmed" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1" onClick={() => updateStatus(b.id, "completed")}>
                        <Check className="h-3 w-3 mr-1" /> Mark complete
                      </Button>
                      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => updateStatus(b.id, "no_show")}>
                        <AlertCircle className="h-3 w-3 mr-1" /> No-show
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(rows: BookingRow[]): Record<string, BookingRow[]> {
  const out: Record<string, BookingRow[]> = {};
  for (const r of rows) {
    const d = new Date(r.scheduled_at);
    const key = d.toISOString().slice(0, 10);
    (out[key] ??= []).push(r);
  }
  return out;
}

function prettyDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0)  return "Today";
  if (diffDays === 1)  return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
