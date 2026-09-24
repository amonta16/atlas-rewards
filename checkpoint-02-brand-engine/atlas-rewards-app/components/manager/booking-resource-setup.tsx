"use client";
/**
 * BookingResourceSetup — CP-147 · what a business can take bookings for
 *
 * Shared by the front desk's Bookings tab (managers → "Set up") AND the
 * app builder's Bookings tab, so the agency and the venue edit the SAME
 * list. Resources save immediately through upsert_booking_resource /
 * delete_booking_resource; the customer on/off switch is
 * widget_config.booking and is handed back through onToggleEnabled so the
 * host decides how it persists (desk: instant update; builder: Save).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Power, ChevronDown, ChevronUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type BookingResource, dollars, durationLabel } from "@/lib/booking";
// CP-148: a real photo of the cage / bay instead of an emoji.
import { ImageUploader } from "@/components/agency/image-uploader";
import type { Business } from "@/lib/types/database";

/* ── Manager: resources set-up ───────────────────────────────────────── */
const DAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["7", "Sun"]] as const;
const DURATION_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240];

type Draft = {
  id: string | null; name: string; description: string; emoji: string; units: number; unit_label: string;
  durations: number[]; slot_minutes: number; buffer_minutes: number; max_party: number;
  price: string; deposit: string; hours: Record<string, [string, string][]> | null; is_active: boolean;
  image_url: string | null;
};

function draftFrom(r: BookingResource | null): Draft {
  return r ? {
    id: r.id, name: r.name, description: r.description ?? "", emoji: r.emoji ?? "", units: r.units, unit_label: r.unit_label,
    durations: r.durations, slot_minutes: r.slot_minutes, buffer_minutes: r.buffer_minutes, max_party: r.max_party,
    price: r.price_cents != null ? (r.price_cents / 100).toString() : "", deposit: r.deposit_cents != null ? (r.deposit_cents / 100).toString() : "",
    hours: r.hours, is_active: r.is_active, image_url: r.image_url ?? null,
  } : {
    id: null, name: "", description: "", emoji: "", units: 1, unit_label: "spot", durations: [60], slot_minutes: 30, buffer_minutes: 0,
    max_party: 8, price: "", deposit: "", hours: null, is_active: true, image_url: null,
  };
}

export function BookingResourceSetup({
  business, resources: resourcesProp, enabled, onToggleEnabled, onChanged,
}: {
  business: Business;
  /** Pass the list when the host already has it (desk); omit to self-load (builder). */
  resources?: BookingResource[];
  enabled: boolean;
  onToggleEnabled: () => void;
  onChanged?: () => void;
}) {
  const primary = business.brand_colors.primary;
  const [own, setOwn] = useState<BookingResource[]>([]);
  const selfLoad = resourcesProp === undefined;
  const loadOwn = useCallback(async () => {
    const { data } = await createClient().rpc("list_booking_resources", { p_business_id: business.id });
    setOwn((data ?? []) as BookingResource[]);
  }, [business.id]);
  useEffect(() => { if (selfLoad) loadOwn(); }, [selfLoad, loadOwn]);
  const resources = resourcesProp ?? own;
  const changed = () => { if (selfLoad) loadOwn(); onChanged?.(); };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) { setErr("Give it a name."); return; }
    if (draft.durations.length === 0) { setErr("Pick at least one length."); return; }
    setSaving(true); setErr(null);
    const toCents = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
    const supabase = createClient();
    const { data: savedId, error } = await supabase.rpc("upsert_booking_resource", {
      p_id: draft.id, p_business_id: business.id, p_name: draft.name.trim(), p_description: draft.description.trim() || null,
      p_emoji: draft.emoji.trim() || null, p_units: draft.units, p_unit_label: draft.unit_label.trim() || "spot",
      p_durations: [...draft.durations].sort((a, b) => a - b), p_slot_minutes: draft.slot_minutes, p_buffer_minutes: draft.buffer_minutes,
      p_max_party: draft.max_party, p_price_cents: toCents(draft.price), p_deposit_cents: toCents(draft.deposit),
      p_hours: draft.hours, p_is_active: draft.is_active, p_sort_order: draft.id ? (resources.find(r => r.id === draft.id)?.sort_order ?? 0) : resources.length,
    });
    if (error) { setSaving(false); setErr(error.message); return; }
    // CP-148: photo. Written straight to the row (bres_staff_write RLS) so
    // the RPC signature stays as shipped in cp147.
    const id = (savedId as string | null) ?? draft.id;
    if (id) {
      const { error: imgErr } = await supabase.from("booking_resources").update({ image_url: draft.image_url }).eq("id", id);
      if (imgErr) { setSaving(false); setErr("Saved, but the photo didn't stick: " + imgErr.message); changed(); return; }
    }
    setSaving(false);
    setDraft(null);
    changed();
  }

  async function remove(r: BookingResource) {
    if (!confirm(`Delete "${r.name}"? Existing bookings keep their record.`)) return;
    const { error } = await createClient().rpc("delete_booking_resource", { p_id: r.id, p_business_id: business.id });
    if (error) { alert(error.message); return; }
    changed();
  }

  function setDayHours(d: string, on: boolean) {
    if (!draft) return;
    const h = { ...(draft.hours ?? {}) };
    if (on) h[d] = h[d] ?? [[business.booking_hours?.start ?? "10:00", business.booking_hours?.end ?? "21:00"]];
    else delete h[d];
    setDraft({ ...draft, hours: h });
  }

  return (
    <div className="rounded-2xl border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold">Booking set-up</h3>
          <p className="text-xs text-zinc-500">What customers can reserve in the app. Prices and deposits are shown, not charged — online payment comes later.</p>
        </div>
        <button
          type="button"
          onClick={onToggleEnabled}
          className={cn("inline-flex items-center gap-2 rounded-full px-3.5 h-10 text-xs font-extrabold border transition", enabled ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-zinc-100 text-zinc-700")}
        >
          <Power className="h-3.5 w-3.5" /> {enabled ? "Customers can book — ON" : "Customer booking OFF"}
        </button>
      </div>

      {!draft && (
        <>
          <div className="divide-y rounded-xl border">
            {resources.length === 0 && <div className="p-4 text-sm text-zinc-500">No bookable spots yet.</div>}
            {resources.map(r => (
              <div key={r.id} className={cn("px-3 py-2.5 flex items-center gap-3", !r.is_active && "opacity-60")}>
                {r.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={r.image_url} alt="" className="h-10 w-14 rounded-lg object-cover shrink-0" />
                  : <span className="text-xl w-14 text-center">{r.emoji ?? "📅"}</span>}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{r.name} {!r.is_active && <span className="text-[10px] font-semibold text-zinc-500">(hidden)</span>}</div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {r.units} {r.unit_label}{r.units === 1 ? "" : "s"} · {r.durations.map(durationLabel).join(" / ")} · up to {r.max_party}
                    {r.price_cents ? <> · {dollars(r.price_cents)}</> : null}{r.deposit_cents ? <> · {dollars(r.deposit_cents)} deposit</> : null}
                    {r.hours ? " · custom hours" : " · business hours"}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setDraft(draftFrom(r)); setHoursOpen(!!r.hours); }}>Edit</Button>
                <button type="button" onClick={() => remove(r)} className="h-9 w-9 rounded-full hover:bg-rose-50 text-rose-600 flex items-center justify-center" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Button onClick={() => { setDraft(draftFrom(null)); setHoursOpen(false); }} className="text-white" style={{ background: primary }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add something bookable
          </Button>
          <p className="text-[11px] text-zinc-500">
            Examples: <b>Batting cage</b> · 6 cages · 30 min / 1 hour · up to 6 · <b>Golf sim bay</b> · 4 bays · 1 / 2 hours · <b>Party room</b> · 1 room · 2 hours · up to 30 · $50 deposit.
          </p>
        </>
      )}

      {draft && (
        <div className="space-y-4">
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Photo (what customers see)</Label>
            <div className="mt-1 max-w-sm">
              <ImageUploader
                bucket="news-images"
                pathPrefix={`${business.id}/booking`}
                value={draft.image_url}
                onChange={(url) => setDraft({ ...draft, image_url: url })}
                aspectClass="aspect-video"
                label="Photo"
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">A real shot of the cage / bay / room beats an icon. The icon below is the fallback when there&apos;s no photo.</p>
          </div>
          <div className="grid grid-cols-[64px_1fr] gap-3">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Icon</Label>
              <Input value={draft.emoji} onChange={e => setDraft({ ...draft, emoji: e.target.value })} placeholder="⚾" className="mt-1 text-center text-xl" maxLength={4} />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Name</Label>
              <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Batting cage" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Short description (optional)</Label>
            <Input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Fast & slow pitch, helmets included" className="mt-1" maxLength={160} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <NumField label="How many" value={draft.units} min={1} max={200} onChange={v => setDraft({ ...draft, units: v })} />
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Called a…</Label>
              <Input value={draft.unit_label} onChange={e => setDraft({ ...draft, unit_label: e.target.value })} placeholder="cage" className="mt-1" maxLength={20} />
            </div>
            <NumField label="Max party" value={draft.max_party} min={1} max={500} onChange={v => setDraft({ ...draft, max_party: v })} />
          </div>

          <div>
            <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Lengths offered</Label>
            <div className="mt-1.5 flex gap-2 flex-wrap">
              {DURATION_CHOICES.map(d => {
                const on = draft.durations.includes(d);
                return (
                  <button key={d} type="button"
                    onClick={() => setDraft({ ...draft, durations: on ? draft.durations.filter(x => x !== d) : [...draft.durations, d] })}
                    className={cn("px-3 h-9 rounded-full text-xs font-bold border", on ? "text-white" : "bg-white")}
                    style={on ? { background: primary, borderColor: primary } : undefined}>
                    {durationLabel(d)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Start times every</Label>
              <select value={draft.slot_minutes} onChange={e => setDraft({ ...draft, slot_minutes: parseInt(e.target.value) })} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm">
                {[15, 30, 60].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Turnover gap</Label>
              <select value={draft.buffer_minutes} onChange={e => setDraft({ ...draft, buffer_minutes: parseInt(e.target.value) })} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm">
                {[0, 5, 10, 15, 30].map(m => <option key={m} value={m}>{m === 0 ? "none" : `${m} min`}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Price (shown)</Label>
              <Input value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} placeholder="25" inputMode="decimal" className="mt-1" />
            </div>
            <div>
              <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Deposit at counter</Label>
              <Input value={draft.deposit} onChange={e => setDraft({ ...draft, deposit: e.target.value })} placeholder="0" inputMode="decimal" className="mt-1" />
            </div>
          </div>

          {/* Hours */}
          <div className="rounded-xl border p-3">
            <button type="button" onClick={() => setHoursOpen(v => !v)} className="w-full flex items-center justify-between text-sm font-bold">
              <span>Hours {draft.hours ? "(custom)" : `(business hours ${business.booking_hours?.start ?? "09:00"}–${business.booking_hours?.end ?? "19:00"})`}</span>
              {hoursOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {hoursOpen && (
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={draft.hours !== null} onChange={e => setDraft({ ...draft, hours: e.target.checked ? {} : null })} />
                  Use its own hours (otherwise the business booking hours apply)
                </label>
                {draft.hours !== null && DAYS.map(([d, label]) => {
                  const win = draft.hours?.[d]?.[0];
                  return (
                    <div key={d} className="flex items-center gap-2 text-xs">
                      <label className="w-14 flex items-center gap-1.5 font-bold">
                        <input type="checkbox" checked={!!win} onChange={e => setDayHours(d, e.target.checked)} /> {label}
                      </label>
                      {win ? (
                        <>
                          <input type="time" value={win[0]} onChange={e => setDraft({ ...draft, hours: { ...draft.hours, [d]: [[e.target.value, win[1]]] } })} className="h-8 rounded-md border px-2" />
                          <span>to</span>
                          <input type="time" value={win[1]} onChange={e => setDraft({ ...draft, hours: { ...draft.hours, [d]: [[win[0], e.target.value]] } })} className="h-8 rounded-md border px-2" />
                        </>
                      ) : <span className="text-zinc-400">closed</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} /> Visible to customers
          </label>

          {err && <p className="text-sm text-rose-600">{err}</p>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="text-white flex-1 h-11 font-bold" style={{ background: primary }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : draft.id ? "Save changes" : "Add"}
            </Button>
            <Button variant="outline" onClick={() => setDraft(null)} className="h-11">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))} className="mt-1" />
    </div>
  );
}
