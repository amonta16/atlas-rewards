"use client";
import { useEffect, useState } from "react";
import { Sparkles, Plus, X, Save, Trash2, Edit2, Info, Coins, Gift } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Business } from "@/lib/types/database";

type Prize = {
  id: string; business_id: string;
  prize_name: string; prize_description: string | null; prize_image_url: string | null;
  // CP-73: coupons removed — the wheel awards points or a free reward.
  kind: "points" | "reward";
  points_amount: number | null; reward_id: string | null;
  weight: number; is_active: boolean;
};

type RewardOption = { id: string; name: string; image_url: string | null };

/**
 * Prize Wheel configurator — CP-72 (revived from CP-42's removal).
 *
 * Lives on the builder's REWARDS tab. The customer-facing Prize Wheel's
 * wedges mirror this pool (via mystery_wheel_segments), and
 * spin_daily_reward picks the winner using these weights — so this panel
 * IS the wheel's prize + odds configuration.
 *
 * Notes:
 *  - The old is_enabled switch is gone: the wheel has been always-on since
 *    CP-44.1. CP-73 also dropped the cooldown setting — spin availability
 *    is in sync with check-in (check in today → one spin today), so there
 *    is nothing to configure.
 *  - CP-73: coupons removed — a prize is points or a free reward.
 *  - kind = "reward" now has a real dropdown of the business's rewards
 *    (the old UI had no way to set reward_id).
 *  - Empty pool = the built-in default wheel (50 / 100 / 300 points),
 *    called out in the empty state so owners aren't surprised.
 */
export function MysteryPoolManager({ business }: { business: Business }) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [rewardOptions, setRewardOptions] = useState<RewardOption[]>([]);
  const [editing, setEditing] = useState<Partial<Prize> | null>(null);

  async function load() {
    const supabase = createClient();
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("mystery_reward_pool").select("*")
        .eq("business_id", business.id)
        .order("weight", { ascending: false }),
      supabase.from("rewards").select("id, name, image_url")
        .eq("business_id", business.id)
        .order("sort_order").order("created_at"),
    ]);
    setPrizes((p ?? []) as Prize[]);
    setRewardOptions((r ?? []) as RewardOption[]);
  }
  useEffect(() => { load(); }, [business.id]);

  async function savePrize() {
    if (!editing?.prize_name || !editing.kind) return;
    if (editing.kind === "reward" && !editing.reward_id) return;
    const supabase = createClient();
    await supabase.rpc("upsert_mystery_prize", {
      p_id: editing.id ?? null,
      p_business_id: business.id,
      p_prize_name: editing.prize_name,
      p_prize_description: editing.prize_description ?? null,
      p_prize_image_url: editing.prize_image_url ?? null,
      p_kind: editing.kind,
      p_points_amount: editing.kind === "points" ? (editing.points_amount ?? 0) : null,
      p_reward_id: editing.kind === "reward" ? (editing.reward_id ?? null) : null,
      p_coupon_code: null, // CP-73: coupons removed
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

  const kindIcon = (kind: Prize["kind"]) =>
    kind === "points"
      ? <Coins className="h-4 w-4 text-amber-500" />
      : <Gift className="h-4 w-4 text-violet-500" />;

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Prize Wheel — prizes &amp; odds
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            The check-in Prize Wheel shows THESE prizes on its wedges. Weight sets the odds —
            heavier lands more often. Point amounts or free rewards.
          </p>
        </div>
      </div>

      {/* CP-73: no cooldown setting — spins are in sync with check-ins:
          check in today → one spin today. Nothing to configure. */}
      <div className="rounded-lg bg-zinc-50 p-3 mb-4 flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="text-[11px] text-muted-foreground leading-snug">
          Spins unlock with check-ins: one spin per check-in day, automatically. Total active
          weight: <strong>{totalWeight}</strong> — a prize with weight 10 in a pool totalling 100
          lands roughly 10% of spins.
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Prize pool</div>
        <Button size="sm" onClick={() => setEditing({ kind: "points", weight: 10, is_active: true })}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add prize
        </Button>
      </div>

      {prizes.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground px-6">
          <Sparkles className="h-6 w-6 mx-auto mb-1.5 text-zinc-300" />
          <p className="text-sm font-medium">No custom prizes yet — the wheel runs its default pool.</p>
          <p className="text-xs mt-1">
            Default: 50 pts (80%), 100 pts (15%), 300 pts (5%). Add prizes to take over the wheel.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {prizes.map(p => {
            const odds = p.is_active ? ((p.weight / totalWeight) * 100).toFixed(1) : "0";
            // CP-73.1: reward prizes show the reward's own photo automatically.
            const img = p.prize_image_url
              ?? (p.kind === "reward" ? rewardOptions.find(r => r.id === p.reward_id)?.image_url ?? null : null);
            return (
              <div key={p.id} className="rounded-xl border p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-50 flex items-center justify-center overflow-hidden shrink-0">
                  {img ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  ) : (
                    kindIcon(p.kind)
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
                <Label className="text-xs text-muted-foreground">Prize name (shown on the wheel + reveal)</Label>
                <Input
                  value={editing.prize_name ?? ""}
                  onChange={e => setEditing({ ...editing, prize_name: e.target.value })}
                  placeholder="Free Latte"
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
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Weight (odds)</Label>
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
              {/* CP-72: kind=reward gets a real picker — the old UI had no
                  way to choose WHICH reward, so reward prizes never worked
                  from this panel. */}
              {editing.kind === "reward" && (
                <div>
                  <Label className="text-xs text-muted-foreground">Which reward do they win?</Label>
                  {rewardOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-1.5 rounded-lg border border-dashed p-3">
                      No rewards in the store yet — add one in the Rewards store section above first.
                    </p>
                  ) : (
                    <select
                      value={editing.reward_id ?? ""}
                      onChange={e => setEditing({ ...editing, reward_id: e.target.value || null })}
                      className="w-full mt-1 rounded-md border border-input bg-background h-9 px-2 text-sm"
                    >
                      <option value="">Choose a reward…</option>
                      {rewardOptions.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {/* CP-73.1: no separate photo upload — reward prizes
                  automatically use the reward's own image on the wheel
                  and the win reveal (no redone work). */}
              {editing.kind === "reward" && editing.reward_id && (
                <p className="text-[11px] text-muted-foreground rounded-lg bg-zinc-50 border p-2.5">
                  The reward&apos;s own photo shows on the wheel automatically.
                </p>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3 bg-zinc-50">
                <Label className="cursor-pointer">Active on the wheel</Label>
                <Switch
                  checked={editing.is_active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={savePrize}
                disabled={!editing.prize_name || (editing.kind === "reward" && !editing.reward_id)}
              >
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
