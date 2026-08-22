"use client";
import { useEffect, useState } from "react";
import { Flame, Plus, Trash2, Save, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

// CP-42: streak milestones now use the SAME Reward-or-Points pattern as
// automated offers. `gift_kind` selects the mode:
//   'reward' → reward_id is set; customer gets a QR redemption.
//   'points' → points count is awarded; no QR.
// Legacy `points` and `mystery` fields are kept for back-compat — old
// milestones load as points-mode.
type Milestone = {
  count: number;
  label: string;
  points: number;                 // legacy + used when gift_kind = 'points'
  mystery?: boolean;              // legacy (no longer surfaced)
  gift_kind?: "points" | "reward";
  reward_id?: string | null;
};
type PeriodType = "daily" | "weekly" | "monthly";

type RewardOption = { id: string; name: string; point_cost: number };

type StreakConfig = {
  is_enabled: boolean;
  period_type: PeriodType;
  checkins_required_per_period: number;
  reset_grace_hours: number;
  milestones: Milestone[];
};

const DEFAULT_MILESTONES: Milestone[] = [
  { count: 3,  label: "3 in a row", points: 50,  mystery: false },
  { count: 7,  label: "1 week",     points: 150, mystery: false },
  { count: 14, label: "2 weeks",    points: 350, mystery: true },
  { count: 30, label: "1 month",    points: 800, mystery: true },
];

/**
 * Agency-side streak / check-in configurator. Sits inside the Rewards tab,
 * below the Mystery Pool manager. Editable per-business so:
 *   • Daily-traffic shops (coffee, gyms) → period_type='daily', 1 check-in
 *   • Weekly-traffic shops (salons) → 'weekly', 1
 *   • Once-a-month services (massage) → 'monthly', 1
 *
 * Disabled by default; turning it on activates the streak trail on the
 * customer Rewards tab + the Check-in button on the manager keypad.
 */
export function StreakConfigEditor({ business }: { business: Business }) {
  const [cfg, setCfg] = useState<StreakConfig>({
    is_enabled: false,
    period_type: "daily",
    checkins_required_per_period: 1,
    reset_grace_hours: 6,
    milestones: DEFAULT_MILESTONES,
  });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // CP-42: business's active rewards — feeds the milestone Reward picker.
  const [rewards, setRewards] = useState<RewardOption[]>([]);
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("rewards")
      .select("id, name, point_cost")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setRewards((data ?? []) as RewardOption[]));
  }, [business.id]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("streak_config")
        .select("*")
        .eq("business_id", business.id)
        .maybeSingle();
      if (data) {
        setCfg({
          is_enabled: data.is_enabled,
          period_type: data.period_type as PeriodType,
          checkins_required_per_period: data.checkins_required_per_period,
          reset_grace_hours: data.reset_grace_hours,
          milestones: Array.isArray(data.milestones) ? data.milestones : DEFAULT_MILESTONES,
        });
      }
    })();
  }, [business.id]);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("upsert_streak_config", {
      p_business_id: business.id,
      p_is_enabled: cfg.is_enabled,
      p_period_type: cfg.period_type,
      p_checkins_required_per_period: cfg.checkins_required_per_period,
      p_reset_grace_hours: cfg.reset_grace_hours,
      p_milestones: cfg.milestones,
    });
    setSaving(false);
    if (!error) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } else {
      alert("Save failed: " + error.message);
    }
  }

  function updateMilestone(i: number, patch: Partial<Milestone>) {
    setCfg(c => ({
      ...c,
      milestones: c.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  }

  function addMilestone() {
    const last = cfg.milestones[cfg.milestones.length - 1];
    const nextCount = last ? last.count + 7 : 3;
    setCfg(c => ({
      ...c,
      milestones: [...c.milestones, { count: nextCount, label: `${nextCount} in a row`, points: 100, mystery: false }],
    }));
  }

  function removeMilestone(i: number) {
    setCfg(c => ({ ...c, milestones: c.milestones.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" /> Streak & check-ins
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Reward repeat visits with a streak trail. Manager taps "Check in" at the keypad;
            members see a visual milestone path on the Rewards tab.
          </p>
        </div>
        <Switch
          checked={cfg.is_enabled}
          onCheckedChange={(v) => setCfg(c => ({ ...c, is_enabled: v }))}
        />
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 mb-4 flex items-start gap-2 text-[11px] text-blue-900">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Not every business benefits from a daily streak — pick the period that matches your
          natural visit cadence. A coffee shop is "daily"; a hair salon is more like "weekly" or "monthly".
        </div>
      </div>

      {/* Period config */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Period</Label>
          <select
            value={cfg.period_type}
            onChange={e => setCfg(c => ({ ...c, period_type: e.target.value as PeriodType }))}
            className="mt-1 w-full rounded-md border border-input bg-background h-9 px-2 text-sm"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Check-ins per period</Label>
          <Input
            type="number" min={1} max={30}
            value={cfg.checkins_required_per_period}
            onChange={e => setCfg(c => ({ ...c, checkins_required_per_period: Math.max(1, parseInt(e.target.value || "1", 10)) }))}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Streak only advances after this many check-ins land in one period.
          </p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Grace hours</Label>
          <Input
            type="number" min={0} max={48}
            value={cfg.reset_grace_hours}
            onChange={e => setCfg(c => ({ ...c, reset_grace_hours: Math.max(0, parseInt(e.target.value || "0", 10)) }))}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Forgiveness window before a missed period breaks the streak.
          </p>
        </div>
      </div>

      {/* Milestones */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Milestones</Label>
          <Button size="sm" variant="outline" onClick={addMilestone}>
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>

        <div className="space-y-2">
          {cfg.milestones.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
              No milestones yet — add at least one so the trail has rewards.
            </div>
          ) : cfg.milestones.map((m, i) => {
            // CP-42: derive gift mode. Legacy milestones default to 'points'.
            const giftKind: "points" | "reward" = m.gift_kind ?? "points";
            return (
              <div key={i} className="rounded-xl border p-3 space-y-3">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <Label className="text-[10px] text-muted-foreground">At streak</Label>
                    <Input
                      type="number" min={1}
                      value={m.count}
                      onChange={e => updateMilestone(i, { count: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                    />
                  </div>
                  <div className="col-span-8">
                    <Label className="text-[10px] text-muted-foreground">Label</Label>
                    <Input
                      value={m.label}
                      onChange={e => updateMilestone(i, { label: e.target.value })}
                      placeholder="2 weeks"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button size="sm" variant="outline" className="text-rose-600" onClick={() => removeMilestone(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* CP-42: Reward / Points gift picker — same UX as the
                    automated offers picker, just inline. */}
                <div className="rounded-lg bg-zinc-50 border p-2.5">
                  <div className="rounded-full bg-white p-0.5 grid grid-cols-2 mb-2 border">
                    <button
                      type="button"
                      onClick={() => updateMilestone(i, { gift_kind: "reward" })}
                      className={`text-xs font-bold py-1.5 rounded-full transition ${
                        giftKind === "reward" ? "bg-zinc-900 text-white shadow" : "text-zinc-500"
                      }`}
                    >
                      🎁 Pick a Reward
                    </button>
                    <button
                      type="button"
                      onClick={() => updateMilestone(i, { gift_kind: "points", reward_id: null })}
                      className={`text-xs font-bold py-1.5 rounded-full transition ${
                        giftKind === "points" ? "bg-zinc-900 text-white shadow" : "text-zinc-500"
                      }`}
                    >
                      ✨ Award Points
                    </button>
                  </div>

                  {giftKind === "reward" ? (
                    <>
                      <select
                        value={m.reward_id ?? ""}
                        onChange={(e) => updateMilestone(i, { reward_id: e.target.value || null, gift_kind: "reward" })}
                        className="w-full h-9 rounded-md border bg-white px-2 text-sm"
                      >
                        <option value="">— Select a reward —</option>
                        {rewards.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.point_cost.toLocaleString()} pt value)
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Customer gets a QR to redeem at the front desk when they hit this milestone.
                        {rewards.length === 0 && <> Add rewards in the <b>Rewards</b> section first.</>}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <Input
                          type="number" min={0}
                          value={m.points}
                          onChange={e => updateMilestone(i, { points: Math.max(0, parseInt(e.target.value || "0", 10)), gift_kind: "points", reward_id: null })}
                          className="pr-16"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                          points
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Credited the moment they hit the milestone. No QR.
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        {savedFlash ? (
          <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        ) : <span />}
        <Button onClick={save} disabled={saving} className="bg-brand-primary text-white">
          {saving ? "Saving…" : <><Save className="h-4 w-4 mr-1" /> Save streak config</>}
        </Button>
      </div>
    </div>
  );
}
