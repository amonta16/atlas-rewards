"use client";
import { useEffect, useState } from "react";
import { Plus, CalendarClock, Edit2, Trash2, X, Save, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "./image-uploader";
import type { Business, BookingTag } from "@/lib/types/database";

const EMOJI_OPTIONS = ["💆", "🦷", "💇", "💪", "🍽️", "☕", "🎮", "🛠️", "🩺", "🧖", "🥋", "✨"];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120, 180];

/**
 * Booking tags manager — manager / agency CRUD for the service widgets
 * customers tap on the Book tab. Tap-heavy editing (emoji picker, duration
 * chips) on purpose so it's quick from a phone too.
 */
export function BookingTagsManager({ business }: { business: Business }) {
  const [tags, setTags] = useState<BookingTag[]>([]);
  const [editing, setEditing] = useState<Partial<BookingTag> | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("booking_tags").select("*")
      .eq("business_id", business.id)
      .order("sort_order").order("created_at");
    setTags((data ?? []) as BookingTag[]);
  }
  useEffect(() => { load(); }, [business.id]);

  async function save() {
    if (!editing?.name || !editing.duration_minutes) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_booking_tag", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_name: editing.name,
      p_duration_minutes: editing.duration_minutes,
      p_description: editing.description ?? null,
      p_emoji: editing.emoji ?? null,
      p_price_cents: editing.price_cents ?? null,
      p_color: editing.color ?? null,
      p_is_active: editing.is_active ?? true,
      p_sort_order: editing.sort_order ?? 0,
      p_image_url: editing.image_url ?? null,
    });
    if (error) { alert("Save failed: " + error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(t: BookingTag) {
    if (!confirm(`Delete "${t.name}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_booking_tag", { p_id: t.id, p_business_id: business.id });
    load();
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-violet-500" /> Bookable services
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Each service is a tap-able widget on the customer's Book tab. They tap, then pick a time.
          </p>
        </div>
        <Button onClick={() => setEditing({ duration_minutes: 30, is_active: true, emoji: "✨" })}>
          <Plus className="h-4 w-4 mr-1" /> Add service
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <CalendarClock className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No services yet. Add at least one so customers have something to tap.</p>
          <p className="text-[11px] mt-1">Customers will always see an "Other" tile so they can still request something off-list.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {tags.map(t => (
            <div key={t.id} className="rounded-xl border bg-zinc-50 p-3 flex items-start gap-3">
              {t.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.image_url} alt={t.name}
                  className="h-14 w-14 rounded-lg object-cover shrink-0 border bg-white" />
              ) : (
                <div className="h-14 w-14 rounded-lg shrink-0 border bg-white flex items-center justify-center text-3xl">
                  {t.emoji ?? "✨"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  {!t.is_active && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">Hidden</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" /> {t.duration_minutes}m
                  {t.price_cents != null && <span>· ${(t.price_cents / 100).toFixed(0)}</span>}
                </div>
                {t.description && <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{t.description}</div>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}><Edit2 className="h-3 w-3" /></Button>
                <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(t)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit service" : "New service"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Tile image (optional)</Label>
                <ImageUploader
                  bucket="booking-tag-images"
                  pathPrefix={business.id}
                  value={editing.image_url ?? null}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  aspectClass="aspect-video"
                  label="Service photo"
                />
                <p className="text-[11px] text-muted-foreground">
                  Recommended ~1200×675. Used as the hero photo on the customer's service tile.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Icon (fallback if no image)</Label>
                <div className="grid grid-cols-6 gap-1.5">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} type="button"
                      onClick={() => setEditing({ ...editing, emoji: e })}
                      className={`h-12 rounded-lg border text-2xl active:scale-95 transition ${
                        editing.emoji === e ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
                      }`}>{e}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Service name</Label>
                <Input value={editing.name ?? ""} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Botox consult" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map(d => (
                    <button key={d} type="button"
                      onClick={() => setEditing({ ...editing, duration_minutes: d })}
                      className={`px-3 h-9 rounded-full border text-xs font-semibold active:scale-95 transition ${
                        editing.duration_minutes === d
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 text-zinc-700"
                      }`}>
                      {d < 60 ? `${d}m` : `${d / 60}h${d % 60 ? ` ${d % 60}m` : ""}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Price (optional)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm">$</span>
                  <Input type="number" min={0} step="0.01"
                    value={editing.price_cents ? (editing.price_cents / 100).toFixed(2) : ""}
                    onChange={e => setEditing({
                      ...editing,
                      price_cents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null,
                    })}
                    placeholder="optional" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                <Input value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="What's included" />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Visible to customers</Label>
                <Switch checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={!editing.name || !editing.duration_minutes}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
