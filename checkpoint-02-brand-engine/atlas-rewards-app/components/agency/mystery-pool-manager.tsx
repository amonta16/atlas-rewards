"use client";
import { useEffect, useState } from "react";
import { Sparkles, Plus, X, Save, Trash2, Edit2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Business } from "@/lib/types/database";

type Prize = {
  id: string; business_id: string;
  prize_name: string; prize_description: string | null; prize_image_url: string | null;
  kind: "points" | "reward" | "coupon";
  points_amount: number | null; reward_id: string | null; coupon_code: string | null;
  weight: number; is_active: boolean;
};

type MysteryConfig = { is_enabled: boolean; cooldown_hours: number };

/**
 * Agency-side Mystery Reward configurator — sits on the Rewards tab below
 * the existing rewards store. Manages:
 *   • a per-business config row (enabled + cooldown_hours)
 *   • a weighted prize pool (CRUD)
 *
 * The customer-facing spin lives in components/customer/mystery-reward-card.tsx
 * and is wired to the spin_mystery_reward / mystery_reward_status RPCs from
 * checkpoint-18-engagement/01_automated_offers_and_mystery.sql.
 */
export function MysteryPoolManager({ business }: { business: Business }) {
  const [cfg, setCfg] = useState<MysteryConfig>({ is_enabled: false, cooldown_hours: 24 });
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [editing, setEditing] = useState<Partial<Prize> | null>(null);

  async function load() {
    const supabase = createClient();
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("business_mystery_config").select("is_enabled, cooldown_hours")
        .eq("business_id", business.id).maybeSingle(),
      supabase.from("mystery_reward_pool").select("*")
        .eq("business_id", business.id)
        .order("weight", { ascending: false }),
    ]);
    if (c) setCfg({ is_enabled: c.is_enabled, cooldown_hours: c.cooldown_hours });
    setPrizes((p ?? []) as Prize[]);
  }
  useEffect(() => { load(); }, [business.id]);

  async function saveConfig(next: MysteryConfig) {
    setCfg(next);
    const supabase = createClient();
    await supabase.from("business_mystery_config").upsert({
      business_id: business.id,
      is_enabled: next.is_enabled,
      cooldown_hours: next.cooldown_hours,
    }, { onConflict: "business_id" });
  }

  async function savePrize() {
    if (!editing?.prize_name || !editing.kind) return;
    const supabase = createClient();
    await supabase.rpc("upsert_mystery_prize", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_prize_name: editing.prize_name,
      p_prize_description: editing.prize_description ?? null,
      p_prize_image_url: editing.prize_image_url ?? null,
      p_kind: editing.kind,
      p_points_amount: editing.kind === "points" ? (editing.points_amount ?? 0) : null,
      p_reward_id: editing.reward_id ?? null,
      p_coupon_code: editing.coupon_code ?? null,
      p_weight: editing.weight ?? 10,
      p_is_active: editing.is_active ?? true,
    });
    setEditing(null);
    load();
  }

  async function remove(p: Prize) {
    if (!confirm(`Delete "${p.prize_name}"?`)) return;
    const supabase = createClient();
    await supabase.rpc("delete_mystery_prize", { p_id: p.id, p_business_id: business.id });
    load();
  }

  const totalWeight = prizes.filter(p => p.is_active).reduce((s, p) => s + p.weight, 0) || 1;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Mystery Reward
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Spin-to-win surprise prize on the customer Rewards tab. Set a prize pool with weights
            (heavier = more likely), and customers can spin once per cooldown.
          </p>
        </div>
        <Switch checked={cfg.is_enabled} onCheckedChange={(v) => saveConfig({ ...cfg, is_enabled: v })} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-zinc-50 p-3">
          <Label className="text-xs text-muted-foreground">Cooldown between spins</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number" min={1} max={720}
              value={cfg.cooldown_hours}
              onChange={e => saveConfig({ ...cfg, cooldown_hours: Math.max(1, parseInt(e.target.value || "1", 10)) })}
              className="h-9"
            />
            <span className="text-xs text-muted-foreground">hours</span>
          </div>
        </div>
        <div className="rounded-lg bg-zinc-50 p-3 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="text-[11px] text-muted-foreground leading-snug">
            Total active weight: <strong>{totalWeight}</strong>. A prize with weight 10 in a pool
            totalling 100 will land roughly 10% of spins.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Prize pool</div>
        <Button size="sm" onClick={() => setEditing({ kind: "points", weight: 10, is_active: true })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add prize
        </Button>
      </div>

      {prizes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
          <Sparkles className="h-6 w-6 mx-auto mb-1.5 text-zinc-300" />
          <p className="text-sm">No prizes yet. Add at least one to enable the spin widget.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {prizes.map(p => {
            const odds = p.is_active ? ((p.weight / totalWeight) * 100).toFixed(1) : "0";
            return (
              <div key={p.id} className="rounded-xl border p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-50 flex items-center justify-center overflow-hidden shrink-0">
                  {p.prize_image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={p.prize_image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl">{p.kind === "points" ? "✨" : p.kind === "reward" ? "🎁" : "🏷️"}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold truncate">{p.prize_name}</div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 capitalize">
                      {p.kind}{p.kind === "points" ? ` · +${p.points_amount}` : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Weight {p.weight} · ~{odds}% odds {!p.is_active && "· Inactive"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={() => remove(p)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="font-bold">{editing.id ? "Edit prize" : "New prize"}</h2>
              <button onClick={() => setEditing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <Label className="text-xs text-muted-foreground">Prize name</Label>
                <Input
                  value={editing.prize_name ?? ""}
                  onChange={e => setEditing({ ...editing, prize_name: e.target.value })}
                  placeholder="50 bonus points"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                <Input
                  value={editing.prize_description ?? ""}
                  onChange={e => setEditing({ ...editing, prize_description: e.target.value })}
                  placeholder="Show this at the counter to redeem"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Kind</Label>
                  <select
                    value={editing.kind ?? "points"}
                    onChange={e => setEditing({ ...editing, kind: e.target.value as Prize["kind"] })}
                    className="w-full mt-1 rounded-md border border-input bg-background h-9 px-2 text-sm"
                  >
                    <option value="points">Points award</option>
                    <option value="reward">Free reward</option>
                    <option value="coupon">Coupon code</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weight</Label>
                  <Input
                    type="number" min={1}
                    value={editing.weight ?? 10}
                    onChange={e => setEditing({ ...editing, weight: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                  />
                </div>
              </div>
              {editing.kind === "points" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Points awarded</Label>
                  <Input
                    type="number" min={0}
                    value={editing.points_amount ?? ""}
                    onChange={e => setEditing({ ...editing, points_amount: e.target.value === "" ? null : parseInt(e.target.value, 10) })}
                    placeholder="50"
                  />
                </div>
              )}
              {editing.kind === "coupon" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Coupon code</Label>
                  <Input
                    value={editing.coupon_code ?? ""}
                    onChange={e => setEditing({ ...editing, coupon_code: e.target.value })}
                    placeholder="WIN10"
                  />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3 bg-zinc-50">
                <Label className="cursor-pointer">Active in the pool</Label>
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={savePrize} disabled={!editing.prize_name}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
