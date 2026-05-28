"use client";
import { Heart, Megaphone, MessageSquare } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { WidgetConfig } from "@/lib/types/database";

type ToggleKey = keyof WidgetConfig;

type Group = {
  id: string;
  label: string;
  blurb: string;
  icon: React.ReactNode;
  items: { key: ToggleKey; label: string; sub?: string; dependsOn?: ToggleKey }[];
};

// Atlas is loyalty-only — booking, leaderboard, and shop were removed in CP-06.
const GROUPS: Group[] = [
  {
    id: "loyalty",
    label: "Loyalty",
    blurb: "How customers earn and see their points.",
    icon: <Heart className="h-4 w-4 text-rose-500" />,
    items: [
      { key: "points_card",   label: "Points card",      sub: "The hero card on Home + Rewards" },
      { key: "rewards_store", label: "Rewards store",    sub: "List of things customers can redeem points for" },
      { key: "visit_tracker", label: "Visit tracker",    sub: "Reward customers for showing up" },
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    blurb: "Ways to keep customers coming back.",
    icon: <Megaphone className="h-4 w-4 text-amber-500" />,
    items: [
      { key: "referrals", label: "Referrals",          sub: "Customer-shareable codes" },
      { key: "reviews",   label: "Google review boost", sub: "Reward customers for leaving reviews" },
      { key: "birthdays", label: "Birthday bonus",      sub: "Auto-reward on a customer's birthday" },
      { key: "offers",    label: "Featured offers",     sub: "Sticky banner + Home card" },
      { key: "news",      label: "News & updates",      sub: "Blog-style feed on Home" },
    ],
  },
  {
    id: "comms",
    label: "Communication",
    blurb: "Outbound channels.",
    icon: <MessageSquare className="h-4 w-4 text-sky-500" />,
    items: [
      { key: "push", label: "Push notifications", sub: "App-side push (requires Atlas Engine native shell)" },
      { key: "sms",  label: "SMS campaigns",      sub: "Outbound text (requires SMS provider)" },
    ],
  },
];

/**
 * Grouped + labeled widget toggles. Same data shape as the old flat grid,
 * but easier to scan and more obvious which features are still placeholders.
 */
export function WidgetToggleGroups({
  config,
  onChange,
}: {
  config: WidgetConfig;
  onChange: (next: WidgetConfig) => void;
}) {
  function setKey(k: ToggleKey, v: boolean) {
    const next = { ...config, [k]: v };
    // Cascade: turning shop off should turn pickup/delivery off
    if (k === "shop" && !v) {
      next.shop_pickup = false;
      next.shop_delivery = false;
    }
    onChange(next);
  }

  return (
    <div className="space-y-6">
      {GROUPS.map(g => (
        <div key={g.id}>
          <div className="flex items-center gap-2 mb-2">
            {g.icon}
            <h4 className="text-sm font-bold">{g.label}</h4>
            <span className="text-[11px] text-muted-foreground">— {g.blurb}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {g.items.map(it => {
              const disabled = !!it.dependsOn && !config[it.dependsOn];
              return (
                <div
                  key={it.key}
                  className={`flex items-start justify-between rounded-lg border p-3 gap-3 transition-colors ${
                    disabled ? "bg-zinc-50 opacity-60" : "bg-muted/20"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <Label htmlFor={`w-${it.key}`} className="cursor-pointer text-sm">{it.label}</Label>
                    {it.sub && <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">{it.sub}</div>}
                  </div>
                  <Switch
                    id={`w-${it.key}`}
                    checked={!!config[it.key]}
                    disabled={disabled}
                    onCheckedChange={(v) => setKey(it.key, v)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
