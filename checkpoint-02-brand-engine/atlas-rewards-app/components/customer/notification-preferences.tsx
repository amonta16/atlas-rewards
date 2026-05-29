"use client";
/**
 * NotificationPreferences — CP-36b
 *
 * Lives on the customer Profile tab. The customer can flip a master
 * "push notifications" switch off (kills everything) and individually
 * opt out of each notification type the business has enabled.
 *
 * Backed by get_my_notification_preferences + update_my_notification_preferences.
 * Renders nothing if there's no membership for this business (signed-out
 * preview etc.).
 */

import { useEffect, useState } from "react";
import { Bell, BellOff, Flame, Gift, Tag, Calendar, Star, MessageSquareHeart, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type Prefs = {
  membership_id: string;
  push_enabled: boolean;
  streak_reminders: boolean;
  gift_expiration_reminders: boolean;
  customer_offer_announcements: boolean;
  check_in_available: boolean;
  we_miss_you: boolean;
  reward_unlocked: boolean;
  birthday: boolean;
  review_request: boolean;
};

type ToggleKey = Exclude<keyof Prefs, "membership_id">;

const TYPES: Array<{ key: ToggleKey; label: string; icon: typeof Bell; tone: string }> = [
  { key: "streak_reminders",             label: "Streak reminders",          icon: Flame,             tone: "bg-orange-100 text-orange-700" },
  { key: "gift_expiration_reminders",    label: "Gift expiration",           icon: Gift,              tone: "bg-rose-100 text-rose-700" },
  { key: "customer_offer_announcements", label: "Offer announcements",       icon: Tag,               tone: "bg-amber-100 text-amber-700" },
  { key: "check_in_available",           label: "Check-in available",        icon: Bell,              tone: "bg-blue-100 text-blue-700" },
  { key: "we_miss_you",                  label: "We-miss-you nudges",        icon: MessageSquareHeart, tone: "bg-pink-100 text-pink-700" },
  { key: "reward_unlocked",              label: "Reward unlocked",           icon: Star,              tone: "bg-emerald-100 text-emerald-700" },
  { key: "birthday",                     label: "Birthday bonus",            icon: Calendar,          tone: "bg-fuchsia-100 text-fuchsia-700" },
  { key: "review_request",               label: "Review request",            icon: AlertCircle,       tone: "bg-yellow-100 text-yellow-700" },
];

export function NotificationPreferences({
  businessId, primary,
}: { businessId: string; primary: string }) {
  const { toast } = useToast();
  const [p, setP] = useState<Prefs | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error } = await supabase.rpc("get_my_notification_preferences", { p_business_id: businessId });
      if (error) {
        // RPC missing or no membership — silently hide the section.
        setUnavailable(true);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as Prefs;
      setP(row);
    })();
  }, [businessId]);

  async function save(next: Prefs) {
    setP(next);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_my_notification_preferences", {
      p_business_id: businessId,
      p_push_enabled: next.push_enabled,
      p_streak_reminders: next.streak_reminders,
      p_gift_expiration_reminders: next.gift_expiration_reminders,
      p_customer_offer_announcements: next.customer_offer_announcements,
      p_check_in_available: next.check_in_available,
      p_we_miss_you: next.we_miss_you,
      p_reward_unlocked: next.reward_unlocked,
      p_birthday: next.birthday,
      p_review_request: next.review_request,
    });
    setBusy(false);
    if (error) toast.error("Couldn't save — " + error.message);
  }

  function toggleKey(k: ToggleKey) {
    if (!p) return;
    save({ ...p, [k]: !p[k] });
  }

  function turnAllOff() {
    if (!p) return;
    const next: Prefs = {
      ...p,
      push_enabled: false,
    };
    save(next);
  }

  if (unavailable || !p) return null;

  const masterOff = !p.push_enabled;

  return (
    <div className="px-4 mt-2 pb-6">
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          {masterOff ? <BellOff className="h-4 w-4 text-zinc-400" /> : <Bell className="h-4 w-4" style={{ color: primary }} />}
          <div className="flex-1">
            <div className="text-sm font-bold">Notifications</div>
            <div className="text-[11px] text-zinc-500">
              {masterOff ? "All notifications are off." : "Choose which pings land on your phone."}
            </div>
          </div>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        </div>

        {/* Master switch */}
        <button
          type="button"
          onClick={() => save({ ...p, push_enabled: !p.push_enabled })}
          className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 border-b"
        >
          <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <Bell className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">Push notifications</div>
            <div className="text-[11px] text-zinc-500">Master switch — flip off and nothing else fires.</div>
          </div>
          <Switch on={p.push_enabled} />
        </button>

        {/* Per-type */}
        <div className={`divide-y ${masterOff ? "opacity-50 pointer-events-none" : ""}`}>
          {TYPES.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggleKey(t.key)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-zinc-50"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${t.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.label}</div>
                </div>
                <Switch on={p[t.key]} />
              </button>
            );
          })}
        </div>

        {/* Turn-off-all shortcut */}
        {!masterOff && (
          <button
            onClick={turnAllOff}
            className="w-full text-center text-[12px] font-semibold text-rose-600 hover:bg-rose-50 py-3 border-t"
          >
            Turn off all notifications
          </button>
        )}
      </div>
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
