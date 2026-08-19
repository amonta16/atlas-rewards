"use client";
import { useEffect, useState } from "react";
import { Plus, Gift, Edit2, Trash2, X, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "./image-uploader";
import type { Business } from "@/lib/types/database";

type Reward = {
  id: string; name: string; description: string | null;
  reward_type: string; point_cost: number; image_url: string | null;
  is_active: boolean; sort_order: number;
  // CP-42: free-form category label — powers the categorized Shop page.
  category: string | null;
  // CP-87: false = "prize only" — usable as a wheel prize / streak gift /
  // offer gift, but never listed in the customer reward store.
  show_in_store?: boolean | null;
  // CP-99: ADDITIONAL gallery photos (cover = image_url stays separate).
  // Customers swipe through [image_url, ...images] in reward detail views.
  images?: string[] | null;
};

// CP-42: starter category suggestions surfaced as quick-pick chips when
// a business hasn't created any categories yet. Free-form so any text
// the manager types becomes a new category automatically.
const STARTER_CATEGORIES = [
  "Food", "Drinks", "Free Items", "Discounts",
  "VIP / Exclusive", "Birthday", "New customer", "Limited time",
];

const TYPES = [
  { value: "discount",   label: "Discount" },
  { value: "free_item",  label: "Free service / item" },
  { value: "vip_perk",   label: "VIP perk" },
  { value: "upgrade",    label: "Upgrade" },
  { value: "custom",     label: "Custom offer" },
];

export function RewardsManager({ business }: { business: Business }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [editing, setEditing] = useState<Partial<Reward> | null>(null);
  // CP-42: distinct categories already used by THIS business — used as
  // autocomplete chips above the category input.
  const [usedCategories, setUsedCategories] = useState<string[]>([]);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("rewards").select("*")
      .eq("business_id", business.id)
      .order("sort_order").order("created_at");
    setRewards((data ?? []) as Reward[]);
    // CP-42: pull the live category list. RPC silently no-ops if the
    // cp42 migration hasn't been applied — we fall back to deriving
    // categories client-side from the rewards we just loaded.
    const { data: cats, error: catErr } = await supabase.rpc("business_reward_categories", {
      p_business_id: business.id,
    });
    if (!catErr && Array.isArray(cats)) {
      setUsedCategories((cats as any[]).map(r => r.category as string).filter(Boolean));
    } else {
      const fromRows = Array.from(new Set(
        ((data ?? []) as any[]).map(r => r.category).filter(Boolean),
      )) as string[];
      setUsedCategories(fromRows);
    }
  }
  useEffect(() => { load(); }, [business.id]);

  async function save() {
    if (!editing?.name || !editing.point_cost) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_reward", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_name: editing.name,
      p_description: editing.description ?? null,
      p_reward_type: editing.reward_type ?? "discount",
      p_point_cost: editing.point_cost,
      p_image_url: editing.image_url ?? null,
      p_is_active: editing.is_active ?? true,
      p_sort_order: editing.sort_order ?? 0,
      p_category: (editing.category ?? "").trim() || null,  // CP-42
      p_show_in_store: editing.show_in_store ?? true,       // CP-87
      p_images: (editing.images ?? []).length > 0 ? editing.images : null,  // CP-99
    });
    if (error) { alert("Save failed: " + error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(r: Reward) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_reward", { p_id: r.id, p_business_id: business.id });
    load();
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Rewards store</h3>
          <p className="text-sm text-muted-foreground mt-1">Customers redeem these by tapping a card in the app.</p>
        </div>
        <Button onClick={() => setEditing({ point_cost: 500, reward_type: "discount", is_active: true })}>
          <Plus className="h-4 w-4 mr-1" /> Add reward
        </Button>
      </div>

      {rewards.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-10 text-center text-muted-foreground">
          <Gift className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
          <p className="text-sm">No rewards yet. Add one to populate the customer's Rewards tab.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {rewards.map(r => (
            <div key={r.id} className="rounded-xl border bg-white overflow-hidden">
              <div className="aspect-[4/3] bg-zinc-50 relative">
                {r.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={r.image_url} alt={r.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Gift className="h-10 w-10 text-zinc-300" />
                  </div>
                )}
                {!r.is_active && (
                  <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-900/80 text-white">
                    Inactive
                  </div>
                )}
                {/* CP-87: prize-only badge — not listed in the store. */}
                {r.is_active && r.show_in_store === false && (
                  <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-600/90 text-white">
                    🎡 Prize only
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <span>{r.reward_type.replace(/_/g, " ")}</span>
                  {/* CP-42: surface the shop category on the card */}
                  {r.category && (
                    <>
                      <span className="opacity-40">·</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                        style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                        {r.category}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-sm font-bold mt-0.5">{r.name}</div>
                <div className="text-xs font-bold mt-1" style={{ color: business.brand_colors.primary }}>
                  {r.point_cost.toLocaleString()} pts
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(r)}>
                    <Edit2 className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => remove(r)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit reward" : "Add reward"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Image</Label>
                <ImageUploader
                  bucket="reward-images"
                  pathPrefix={business.id}
                  value={editing.image_url ?? null}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  aspectClass="aspect-[4/3]"
                  library={{ category: "reward", industry: business.industry }}
                />
              </div>

              {/* CP-99: extra gallery photos. The image above stays the COVER
                  (cards, wheel wedges, front desk all keep using it) — these
                  extras join it in a swipe carousel on the customer's reward
                  detail view. */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  More photos (optional) — front, back, lifestyle…
                </Label>
                {(editing.images ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(editing.images ?? []).map((url, i) => (
                      <div key={`${url}-${i}`} className="relative h-16 w-16 rounded-lg overflow-hidden border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          title="Remove photo"
                          onClick={() => setEditing({
                            ...editing,
                            images: (editing.images ?? []).filter((_, j) => j !== i),
                          })}
                          className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ImageUploader
                  bucket="reward-images"
                  pathPrefix={business.id}
                  value={null}
                  onChange={(url) => {
                    if (url) setEditing({ ...editing, images: [...(editing.images ?? []), url] });
                  }}
                  label="Add photo"
                  aspectClass="aspect-video"
                  library={{ category: "reward", industry: business.industry }}
                />
                <p className="text-[10px] text-zinc-500">
                  Customers swipe through the main image plus these on the reward page.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input value={editing.name ?? ""} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="$25 off Botox" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                <Input value={editing.description ?? ""} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder="One-time discount" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editing.reward_type ?? "discount"}
                    onChange={e => setEditing({ ...editing, reward_type: e.target.value })}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Point cost</Label>
                  <Input type="number" min={1} value={editing.point_cost ?? 500}
                    onChange={e => setEditing({ ...editing, point_cost: parseInt(e.target.value || "0", 10) })} />
                </div>
              </div>
              {/* CP-42: free-form category for the Shop page grouping.
                  Quick-pick chips show whatever categories this business
                  has already used, plus the STARTER_CATEGORIES list so
                  fresh businesses have somewhere to start. */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Category (groups it on the Shop page)</Label>
                <Input
                  value={editing.category ?? ""}
                  onChange={e => setEditing({ ...editing, category: e.target.value })}
                  placeholder="e.g. Food, Drinks, VIP, Birthday…"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Array.from(new Set([...usedCategories, ...STARTER_CATEGORIES]))
                    .slice(0, 12)
                    .map(c => {
                      const active = (editing.category ?? "").trim().toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setEditing({ ...editing, category: active ? "" : c })}
                          className={
                            "text-[11px] font-bold px-2 py-1 rounded-full border transition " +
                            (active
                              ? "text-white border-transparent"
                              : "text-zinc-700 bg-white hover:bg-zinc-50")
                          }
                          style={active ? { background: business.brand_colors.primary } : undefined}
                        >
                          {c}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Active (visible to customers)</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>

              {/* CP-87: store visibility. OFF = prize-only — the reward can
                  still be picked as a wheel prize, streak gift, or offer
                  gift, but customers never see it in the reward store. */}
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <div className="pr-3">
                  <Label className="cursor-pointer">Show in rewards store</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Turn off for prize-only rewards (wheel spins, streak gifts,
                    offers) that shouldn't be redeemable from the store.
                  </p>
                </div>
                <Switch
                  checked={editing.show_in_store ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, show_in_store: v })}
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={save}>
                <Save className="h-4 w-4 mr-1" /> Save reward
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
