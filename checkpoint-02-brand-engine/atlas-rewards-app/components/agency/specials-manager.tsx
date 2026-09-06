"use client";
/**
 * SpecialsManager — CP-132
 *
 * The weekly deal calendar: one column per day, add a line to any day.
 * Shown to customers as the "This week" strip on Home and the Events tab.
 * Inline editing — no modal — because owners fill this in once and tweak
 * a line at a time.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Check, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Business, BusinessSpecial } from "@/lib/types/database";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SpecialsManager({ business }: { business: Business }) {
  const [rows, setRows] = useState<BusinessSpecial[]>([]);
  const [draft, setDraft] = useState<{ day: number; title: string; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("business_specials").select("*")
      .eq("business_id", business.id)
      .order("day_of_week").order("sort_order");
    setRows((data ?? []) as BusinessSpecial[]);
  }
  useEffect(() => { load(); }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!draft?.title.trim()) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_business_special", {
      p_id: null,
      p_business_id: business.id,
      p_day_of_week: draft.day,
      p_title: draft.title.trim(),
      p_detail: draft.detail.trim() || null,
      p_is_active: true,
      p_sort_order: rows.filter(r => r.day_of_week === draft.day).length,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDraft(null);
    load();
  }

  async function remove(r: BusinessSpecial) {
    const supabase = createClient();
    await supabase.rpc("delete_business_special", { p_id: r.id, p_business_id: business.id });
    load();
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4 text-emerald-600" /> Weekly specials
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Standing deals by day — &ldquo;$2 games&rdquo;, &ldquo;Unlimited after 7pm&rdquo;, &ldquo;Family hours 11–3&rdquo;. Customers see a &ldquo;This week&rdquo; strip that opens on today.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {DAYS.map((name, day) => {
          const list = rows.filter(r => r.day_of_week === day);
          const isDraft = draft?.day === day;
          const isToday = new Date().getDay() === day;
          return (
            <div key={day} className={`rounded-xl border p-3 flex flex-col ${isToday ? "border-zinc-900" : "bg-zinc-50"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                  {name}{isToday && <span className="ml-1 text-zinc-400 font-semibold normal-case tracking-normal">· today</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setDraft({ day, title: "", detail: "" })}
                  className="h-6 w-6 rounded-full bg-white border flex items-center justify-center hover:bg-zinc-100"
                  aria-label={`Add special on ${name}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-1.5 flex-1">
                {list.length === 0 && !isDraft && (
                  <div className="text-[11px] text-zinc-400">Regular pricing</div>
                )}
                {list.map(r => (
                  <div key={r.id} className="group rounded-lg bg-white border px-2.5 py-1.5 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold leading-tight">{r.title}</div>
                      {r.detail && <div className="text-[11px] text-zinc-500 leading-snug">{r.detail}</div>}
                    </div>
                    <button type="button" onClick={() => remove(r)} className="text-zinc-300 hover:text-rose-600 shrink-0" aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {isDraft && draft && (
                  <div className="rounded-lg bg-white border-2 border-zinc-900 p-2 space-y-1.5">
                    <Input
                      autoFocus
                      value={draft.title}
                      onChange={e => setDraft({ ...draft, title: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") setDraft(null); }}
                      placeholder="$2 games"
                      className="h-8 text-sm"
                    />
                    <Input
                      value={draft.detail}
                      onChange={e => setDraft({ ...draft, detail: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") setDraft(null); }}
                      placeholder="All day · arcade only (optional)"
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 flex-1" onClick={add} disabled={busy || !draft.title.trim()}>
                        <Check className="h-3 w-3 mr-1" /> Add
                      </Button>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => setDraft(null)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
    </div>
  );
}
