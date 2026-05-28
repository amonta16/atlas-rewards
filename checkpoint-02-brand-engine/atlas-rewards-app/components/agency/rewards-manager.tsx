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
};

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

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("rewards").select("*")
      .eq("business_id", business.id)
      .order("sort_order").order("created_at");
    setRewards((data ?? []) as Reward[]);
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
              </div>
              <div className="p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {r.reward_type.replace(/_/g, " ")}
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
                />
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
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <Label className="cursor-pointer">Active (visible to customers)</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
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
