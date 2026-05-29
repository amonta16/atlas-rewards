"use client";
/**
 * NotificationSettingsPanel — CP-36b
 *
 * Lives in the agency brand editor's Settings tab. Agency admin (or
 * business manager) toggles which notification types are allowed to fire
 * for this business. The customer's per-type preferences (set in their
 * own profile) intersect with these toggles — if either says off, no
 * notification fires.
 *
 * Backed by:
 *   - get_business_notification_settings(business_id)
 *   - update_business_notification_settings(business_id, …)
 *
 * Also hosts the one-off manual-broadcast composer that used to live in
 * the manager's Notifications tab — same component, just relocated.
 */

import { useEffect, useState } from "react";
import { Bell, Flame, Gift, Tag, Calendar, AlertCircle, Star, MessageSquareHeart, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { NotificationBroadcast } from "@/components/notifications/notification-broadcast";
import type { Business } from "@/lib/types/database";

type Settings = {
  business_id: string;
  streak_reminders: boolean;
  gift_expiration_reminders: boolean;
  customer_offer_announcements: boolean;
  check_in_available: boolean;
  we_miss_you: boolean;
  reward_unlocked: boolean;
  birthday: boolean;
  review_request: boolean;
};

const TYPES: Array<{
  key: keyof Omit<Settings, "business_id">;
  label: string;
  description: string;
  icon: typeof Bell;
  tone: string;
}> = [
  { key: "streak_reminders",            label: "Streak reminders",         description: "Nudge members on the day their streak is about to break.",          icon: Flame,             tone: "bg-orange-100 text-orange-700" },
  { key: "gift_expiration_reminders",   label: "Gift expiration reminders", description: "Heads-up when a saved gift is about to expire.",                    icon: Gift,              tone: "bg-rose-100 text-rose-700" },
  { key: "customer_offer_announcements",label: "Customer offer announcements", description: "Drop a notification when a new automated offer is featured.",   icon: Tag,               tone: "bg-amber-100 text-amber-700" },
  { key: "check_in_available",          label: "Check-in available",       description: "Ping members when their 12h check-in cooldown ends.",               icon: Bell,              tone: "bg-blue-100 text-blue-700" },
  { key: "we_miss_you",                 label: "We-miss-you (inactives)",  description: "Win-back nudge for members past the inactive cutoff.",              icon: MessageSquareHeart, tone: "bg-pink-100 text-pink-700" },
  { key: "reward_unlocked",             label: "Reward unlocked",          description: "Fires when a member crosses the points threshold for a reward.",    icon: Star,              tone: "bg-emerald-100 text-emerald-700" },
  { key: "birthday",                    label: "Birthday bonus",           description: "Annual birthday points + a celebratory ping.",                       icon: Calendar,          tone: "bg-fuchsia-100 text-fuchsia-700" },
  { key: "review_request",              label: "Review request",           description: "Ask happy members to drop a Google review.",                         icon: AlertCircle,       tone: "bg-yellow-100 text-yellow-700" },
];

export function NotificationSettingsPanel({ business }: { business: Business }) {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("get_business_notification_settings", {
        p_business_id: business.id,
      });
      if (error || !data) {
        // RPC not deployed yet — render defaults.
        setS({
          business_id: business.id,
          streak_reminders: true, gift_expiration_reminders: true,
          customer_offer_announcements: true, check_in_available: true,
          we_miss_you: true, reward_unlocked: true,
          birthday: true, review_request: true,
        });
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as Settings;
      setS(row);
    })();
  }, [business.id]);

  async function toggle(key: keyof Omit<Settings, "business_id">) {
    if (!s) return;
    const next: Settings = { ...s, [key]: !s[key] };
    setS(next);
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_business_notification_settings", {
      p_business_id: business.id,
      p_streak_reminders: next.streak_reminders,
      p_gift_expiration_reminders: next.gift_expiration_reminders,
      p_customer_offer_announcements: next.customer_offer_announcements,
      p_check_in_available: next.check_in_available,
      p_we_miss_you: next.we_miss_you,
      p_reward_unlocked: next.reward_unlocked,
      p_birthday: next.birthday,
      p_review_request: next.review_request,
    });
    setSaving(false);
    if (error) {
      toast.error("Save failed — " + error.message);
      setS(s); // rollback
      return;
    }
  }

  if (!s) {
    return (
      <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-500">
        Loading notification settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toggle grid */}
      <div className="rounded-3xl border bg-white p-5 lg:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="h-4 w-4 text-blue-500" />
          <h3 className="font-bold">Notification types</h3>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 ml-auto" />}
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Master switches for every automated notification this business sends. Customers can still
          opt-out individually from their Profile tab — but a switch off here blocks the notification
          for everyone.
        </p>

        <div className="space-y-2">
          {TYPES.map(t => {
            const Icon = t.icon;
            const on = s[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggle(t.key)}
                className="w-full text-left rounded-2xl border bg-white p-3 flex items-center gap-3 hover:bg-zinc-50 transition"
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${t.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold leading-tight">{t.label}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{t.description}</div>
                </div>
                <Switch on={on} />
              </button>
            );
          })}
        </div>
      </div>

      {/* CP-36b: manual broadcast composer relocated from manager view. */}
      <NotificationBroadcast businessId={business.id} primary={business.brand_colors.primary} />
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <div
      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
        on ? "bg-emerald-500" : "bg-zinc-300"
      }`}
    >
      <div
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </div>
  );
}
