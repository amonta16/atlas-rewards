"use client";
/**
 * EventsManager — CP-132
 *
 * Dated happenings for the customer app: tournaments, Veterans Day, league
 * night, glow bowl. Shown on Home ("Coming up") and the Events tab. Same
 * shape as NewsManager (list + modal editor) so it feels familiar.
 */
import { useEffect, useState } from "react";
import { Plus, CalendarDays, Edit2, Trash2, X, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "./image-uploader";
import type { Business, BusinessEvent } from "@/lib/types/database";

/** <input type="datetime-local"> wants local "YYYY-MM-DDTHH:MM". */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EventsManager({ business }: { business: Business }) {
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [editing, setEditing] = useState<Partial<BusinessEvent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("business_events").select("*")
      .eq("business_id", business.id)
      .order("starts_at", { ascending: true });
    setEvents((data ?? []) as BusinessEvent[]);
  }
  useEffect(() => { load(); }, [business.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!editing?.title || !editing.starts_at) return;
    setSaving(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_business_event", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_title: editing.title,
      p_description: editing.description ?? null,
      p_image_url: editing.image_url ?? null,
      p_starts_at: editing.starts_at,
      p_ends_at: editing.ends_at ?? null,
      p_location_note: editing.location_note ?? null,
      p_cta_label: editing.cta_label ?? null,
      p_cta_url: editing.cta_url ?? null,
      p_is_published: editing.is_published ?? true,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(ev: BusinessEvent) {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_business_event", { p_id: ev.id, p_business_id: business.id });
    load();
  }

  const now = Date.now();
  const upcoming = events.filter(e => new Date(e.ends_at ?? e.starts_at).getTime() >= now - 3_600_000);
  const past = events.filter(e => !upcoming.includes(e));

  function Row({ ev, dim }: { ev: BusinessEvent; dim?: boolean }) {
    const d = new Date(ev.starts_at);
    return (
      <div className={`rounded-xl border bg-zinc-50 p-3 flex items-start gap-3 ${dim ? "opacity-60" : ""}`}>
        <div className="w-14 shrink-0 rounded-lg text-center py-1.5 text-white"
          style={{ background: business.brand_colors.primary }}>
          <div className="text-[9px] font-bold uppercase tracking-widest opacity-85">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
          <div className="text-lg font-black leading-none">{d.getDate()}</div>
          <div className="text-[9px] font-semibold uppercase opacity-85">{d.toLocaleDateString(undefined, { month: "short" })}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm truncate">{ev.title}</div>
            {!ev.is_published && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">Draft</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            {ev.ends_at && ` – ${new Date(ev.ends_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
            {ev.location_note && ` · ${ev.location_note}`}
          </div>
          {ev.description && <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{ev.description}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setEditing(ev)}><Edit2 className="h-3 w-3" /></Button>
          <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(ev)}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-violet-600" /> Events
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Tournaments, holidays, league nights, parties. The next few show on Home under &ldquo;Coming up&rdquo;; the Events tab lists them all. Past events drop off by themselves.
          </p>
        </div>
        <Button onClick={() => setEditing({ is_published: true, starts_at: new Date(Date.now() + 86_400_000).toISOString() })}>
          <Plus className="h-4 w-4 mr-1" /> Add event
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No events yet. Add one and it appears on the customer app right away.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map(ev => <Row key={ev.id} ev={ev} />)}
          {past.length > 0 && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 pt-3">Past</div>
              {past.slice(0, 5).map(ev => <Row key={ev.id} ev={ev} dim />)}
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col text-zinc-900">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit event" : "New event"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input value={editing.title ?? ""} onChange={e => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Saturday pool tournament" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Starts</Label>
                  <Input type="datetime-local" value={toLocalInput(editing.starts_at)}
                    onChange={e => setEditing({ ...editing, starts_at: fromLocalInput(e.target.value) ?? editing.starts_at })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Ends (optional)</Label>
                  <Input type="datetime-local" value={toLocalInput(editing.ends_at)}
                    onChange={e => setEditing({ ...editing, ends_at: fromLocalInput(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Where in the venue (optional)</Label>
                <Input value={editing.location_note ?? ""} onChange={e => setEditing({ ...editing, location_note: e.target.value })}
                  placeholder="Back room · Cage 3 · Main floor" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Details (optional)</Label>
                <textarea value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="$10 buy-in, double elimination, winner takes the pot. Sign up at the counter."
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[90px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                <ImageUploader
                  bucket="news-images"
                  pathPrefix={`${business.id}/events`}
                  value={editing.image_url ?? null}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  aspectClass="aspect-video"
                  label="Event image"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Button label (optional)</Label>
                  <Input value={editing.cta_label ?? ""} onChange={e => setEditing({ ...editing, cta_label: e.target.value })} placeholder="Sign up" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Button link</Label>
                  <Input value={editing.cta_url ?? ""} onChange={e => setEditing({ ...editing, cta_url: e.target.value })} placeholder="https://…" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Published</Label>
                <Switch checked={editing.is_published ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} />
              </div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={saving || !editing.title || !editing.starts_at}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save event"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
