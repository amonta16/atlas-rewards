"use client";
import { useEffect, useState } from "react";
import { Plus, Tag, Edit2, Trash2, X, Save, Star, StarOff, AlertCircle, CheckCircle2, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "./image-uploader";
// CP-85: Raffle Giveaway is an additional offer TYPE inside this same
// manager — not a separate feature. The "+ Add offer" button now opens a
// type picker (Standard offer / Raffle Giveaway); raffles list right below
// the regular offers with live status chips + an Entries admin view.
import { RaffleEditor, RaffleList } from "./raffle-manager";
import type { Business } from "@/lib/types/database";

type Offer = {
  id: string; title: string; description: string | null; image_url: string | null;
  starts_at: string | null; expires_at: string | null;
  is_active: boolean; is_featured: boolean; sort_order: number;
};

export function OffersManager({
  business,
  onChange,
}: {
  business: Business;
  /** CP-22: fires after any save/delete/feature so the parent (Brand Editor)
   *  can refetch the live preview without waiting for a full page refresh. */
  onChange?: () => void;
}) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [editing, setEditing] = useState<Partial<Offer> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  // CP-85: "+ Add offer" first asks which TYPE (standard / raffle).
  const [pickingType, setPickingType] = useState(false);
  const [creatingRaffle, setCreatingRaffle] = useState(false);
  const [raffleTick, setRaffleTick] = useState(0);

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase.from("offers").select("*")
      .eq("business_id", business.id).order("is_featured", { ascending: false }).order("created_at", { ascending: false });
    if (error) console.error("offers load:", error.message);
    setOffers((data ?? []) as Offer[]);
  }
  useEffect(() => { load(); }, [business.id]);

  function defaultExpiresAt() {
    // 14 days out, kept as ISO string so we don't run into "expires today
    // because midnight UTC = yesterday locally" timezone bugs.
    const d = new Date(); d.setDate(d.getDate() + 14); d.setHours(23, 59, 59, 0);
    return d.toISOString();
  }

  async function save() {
    if (!editing?.title) return;
    setSaving(true); setSaveErr(null);
    const supabase = createClient();
    const isNew = !editing.id;
    const willFeature = editing.is_featured ?? (offers.length === 0);
    const willBeActive = editing.is_active ?? true;
    const { error } = await supabase.rpc("upsert_offer", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_title: editing.title,
      p_description: editing.description ?? null,
      p_image_url: editing.image_url ?? null,
      p_expires_at: editing.expires_at ?? null,
      p_is_active: willBeActive,
      // Auto-feature the first offer for a business so the customer banner
      // always has *something* to show once they enable the Offers widget.
      p_is_featured: willFeature,
    });
    setSaving(false);
    if (error) {
      setSaveErr(error.message);
      return;
    }
    // CP-43: announce a brand-new featured offer instantly (editing an
    // existing offer doesn't re-announce, to avoid spamming on every tweak —
    // use the ⭐ feature toggle to re-announce an existing one).
    if (isNew && willFeature && willBeActive) {
      announceOffer({ id: editing.id ?? "", title: editing.title!, description: editing.description ?? null });
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
    setEditing(null);
    load();
    onChange?.(); // CP-22: nudge parent to refetch preview data
  }

  async function remove(o: Offer) {
    if (!confirm(`Delete "${o.title}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_offer", { p_id: o.id, p_business_id: business.id });
    load();
    onChange?.();
  }

  // CP-43: fire the "Customer offer announcement" via the proven instant
  // push path (same one the test button used) when an offer becomes the
  // featured one. The route respects the business's master toggle and
  // pushes synchronously, so customers' phones light up immediately — no
  // cron involved. Fire-and-forget so it never blocks the save.
  function announceOffer(o: Pick<Offer, "id" | "title" | "description">) {
    fetch("/api/notifications/announce-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: business.id,
        offer_id: o.id,
        title: o.title,
        description: o.description ?? null,
      }),
    }).catch(() => { /* silent — in-app row is the safety net */ });
  }

  async function toggleFeatured(o: Offer) {
    const supabase = createClient();
    const becomingFeatured = !o.is_featured;
    await supabase.rpc("upsert_offer", {
      p_id: o.id, p_business_id: business.id,
      p_title: o.title, p_description: o.description, p_image_url: o.image_url,
      p_expires_at: o.expires_at,
      p_is_active: o.is_active, p_is_featured: becomingFeatured,
    });
    // Only announce when turning featured ON (not when un-featuring).
    if (becomingFeatured && o.is_active) announceOffer(o);
    load();
    onChange?.();
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Tag className="h-4 w-4" /> Offers</h3>
          <p className="text-sm text-muted-foreground mt-1">
            The <strong>featured</strong> offer shows in the customer app's sticky banner at the top and in the big Featured Offer card on the Home tab.
          </p>
        </div>
        <Button onClick={() => setPickingType(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add offer
        </Button>
      </div>

      {/* Hint if the Offers widget isn't enabled — without this, even a featured offer won't display in the customer app. */}
      {!business.widget_config.offers && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4 flex items-start gap-2 text-[11px] text-amber-900">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            The <strong>Offers</strong> widget is currently turned off. Turn it on under <strong>Brand &amp; widgets → Engagement → Offers &amp; promos</strong>
            for offers (and the sticky banner) to appear in the customer app.
          </div>
        </div>
      )}

      {/* "Just saved" inline flash */}
      {savedFlash && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 mb-4 flex items-center gap-2 text-[12px] text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Offer saved.
        </div>
      )}

      {offers.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <Tag className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No offers yet. The customer's sticky banner stays empty until you add one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {offers.map(o => (
            <div key={o.id} className="rounded-xl border bg-zinc-50 p-3">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-white border">
                  {o.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={o.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center" style={{ background: `${business.brand_colors.primary}15` }}>
                      <Tag className="h-5 w-5" style={{ color: business.brand_colors.primary }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm truncate">{o.title}</div>
                    {o.is_featured && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                        <Star className="h-2.5 w-2.5 fill-current" /> Featured
                      </span>
                    )}
                    {!o.is_active && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">Inactive</span>
                    )}
                    {o.expires_at && new Date(o.expires_at) < new Date() && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                        × Expired
                      </span>
                    )}
                  </div>
                  {o.description && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{o.description}</div>}
                  {o.expires_at && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Expires {new Date(o.expires_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => toggleFeatured(o)} title={o.is_featured ? "Unfeature" : "Feature"}>
                    {o.is_featured ? <StarOff className="h-3 w-3" /> : <Star className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(o)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(o)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CP-85: raffle giveaways live in the same list area — same feature,
          different offer type. Hidden entirely when the business has none. */}
      <RaffleList
        business={business}
        refreshTick={raffleTick}
        onChanged={() => { setRaffleTick(t => t + 1); onChange?.(); }}
      />

      {/* CP-85: offer-type picker — Standard keeps the exact flow that
          existed before; Raffle opens the raffle editor. */}
      {pickingType && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">What kind of offer?</h2>
              <button onClick={() => setPickingType(false)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => {
                  setPickingType(false);
                  setEditing({ is_active: true, is_featured: offers.length === 0, expires_at: defaultExpiresAt() as any });
                }}
                className="rounded-xl border-2 p-4 text-left hover:border-zinc-400 hover:shadow-md transition flex items-start gap-3"
              >
                <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm">Standard offer</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    A limited-time promo customers claim as a gift — image, headline, expiry, featured banner.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setPickingType(false); setCreatingRaffle(true); }}
                className="rounded-xl border-2 border-violet-200 p-4 text-left hover:border-violet-400 hover:shadow-md transition flex items-start gap-3"
                style={{ background: "linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)" }}
              >
                <div className="h-10 w-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-bold text-sm flex items-center gap-1.5">
                    Raffle Giveaway
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-violet-600 text-white">New</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Members spend points to enter. When time runs out, one winner is drawn automatically — big prize, big hype.
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CP-85: raffle creation modal */}
      {creatingRaffle && (
        <RaffleEditor
          business={business}
          raffle={null}
          onClose={() => setCreatingRaffle(false)}
          onSaved={() => { setRaffleTick(t => t + 1); onChange?.(); }}
        />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit offer" : "Add offer"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Image (optional)</Label>
                <ImageUploader
                  bucket="offer-images"
                  pathPrefix={business.id}
                  value={editing.image_url ?? null}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  aspectClass="aspect-video"
                  label="Offer"
                  library={{ category: "offer", industry: business.industry }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Headline</Label>
                <Input value={editing.title ?? ""} onChange={e => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Free hotdog with $20 spend" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                <Input value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Show this at checkout to redeem" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Expires on (optional)</Label>
                <Input type="date"
                  value={editing.expires_at ? String(editing.expires_at).slice(0, 10) : ""}
                  onChange={e => setEditing({ ...editing, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-amber-50">
                <div>
                  <Label className="cursor-pointer flex items-center gap-1.5"><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Featured</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Shows in the sticky banner + featured card. Only one offer can be featured at a time.</p>
                </div>
                <Switch checked={editing.is_featured ?? false} onCheckedChange={(v) => setEditing({ ...editing, is_featured: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Active (visible to customers)</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
            {saveErr && (
              <div className="px-5 pb-2 text-xs text-rose-700 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{saveErr}</span>
              </div>
            )}
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={!editing.title || saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save offer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
