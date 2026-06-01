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
import { Bell, Flame, Gift, Tag, Calendar, AlertCircle, Star, MessageSquareHeart, Send, Loader2, Stethoscope, CheckCircle2, XCircle } from "lucide-react";
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

type NotifDebug = {
  vapid_configured: boolean;
  vapid_subject: string | null;
  member_count: number;
  push_subscribed_members: number;
  subscriptions_total: number;
  recent_notifications_24h: number;
  atlas_base_url_setting: string | null;
  warnings: string[];
};

export function NotificationSettingsPanel({ business }: { business: Business }) {
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  // CP-37.2: send-test-notification state.
  const [testing, setTesting] = useState<string | null>(null);
  // CP-37.10: notification diagnostics state.
  const [debug, setDebug] = useState<NotifDebug | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugErr, setDebugErr] = useState<string | null>(null);

  async function runDiagnostics() {
    setDebugLoading(true);
    setDebugErr(null);
    try {
      const res = await fetch(`/api/notifications/debug?business_id=${business.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "diagnostics failed");
      setDebug(json as NotifDebug);
    } catch (e: any) {
      setDebugErr(e?.message ?? "diagnostics failed");
    } finally {
      setDebugLoading(false);
    }
  }

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

      {/* CP-37.5 — send-test-notification panel.
          Now fans the test out to EVERY enrolled member of this
          business (same recipient set as the manual "Send to all"
          composer) prefixed with 🧪 Test. The agency admin doesn't
          have a customer surface to view notifications on, so we
          deliver the test to the real customer accounts — that's
          the only path where a test can actually be SEEN AND the
          delivery matches the production wiring exactly. Use on a
          test sub-account so you don't ping real members. */}
      <div className="rounded-3xl border bg-white p-5 lg:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Send className="h-4 w-4 text-emerald-500" />
          <h3 className="font-bold">Test notifications</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Fires a sample of each enabled kind to every enrolled member of this business — same path "Send to all" uses, with a 🧪 Test prefix. Use on a test sub-account so you don't ping real customers.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={testing === "all"}
            onClick={async () => {
              setTesting("all");
              // CP-37.11: switched from the SQL RPC (which depended on the
              // pg_net trigger that silently failed for us) to the
              // /api/notifications/test endpoint that calls
              // sendPushToBusiness directly — the same proven path
              // /api/notifications/broadcast uses for "Send to all".
              try {
                const res = await fetch("/api/notifications/test", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ business_id: business.id, kind: null }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error ?? "test failed");
                const { kinds_fired = 0, recipients = 0, push_sent = 0, push_failed = 0 } = json;
                toast.success(
                  `Test sent · ${kinds_fired} kind${kinds_fired === 1 ? "" : "s"} across ${recipients} member${recipients === 1 ? "" : "s"} · push: ${push_sent} ${push_failed ? `(${push_failed} failed)` : ""} ✨`,
                );
              } catch (e: any) {
                toast.error("Test failed — " + (e?.message ?? "unknown"));
              } finally {
                setTesting(null);
              }
            }}
          >
            {testing === "all" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending all…</> : "Send one of each enabled kind"}
          </Button>
          {TYPES.filter(t => s[t.key]).map(t => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              variant="ghost"
              disabled={testing === t.key}
              onClick={async () => {
                setTesting(t.key);
                try {
                  const res = await fetch("/api/notifications/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ business_id: business.id, kind: t.key }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json?.error ?? "failed");
                  const { push_sent = 0, push_failed = 0 } = json;
                  toast.success(
                    `${t.label} test · push sent to ${push_sent}${push_failed ? ` (${push_failed} failed)` : ""} 🧪`,
                  );
                } catch (e: any) {
                  toast.error(`${t.label} failed — ` + (e?.message ?? "unknown"));
                } finally {
                  setTesting(null);
                }
              }}
            >
              {testing === t.key ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {t.label}
            </Button>
          ))}
        </div>
      </div>

      {/* CP-37.10 — diagnostics panel. Surfaces every link in the
          push-notification chain so the failure mode is obvious
          instead of silent. Andrew kept seeing "test fired" toasts
          while no push arrived — almost always because VAPID env
          vars aren't set in Vercel OR no customer has granted push
          permission yet. This panel makes both visible in one tap. */}
      <div className="rounded-3xl border bg-white p-5 lg:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Stethoscope className="h-4 w-4 text-indigo-500" />
          <h3 className="font-bold">Notification diagnostics</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Reports every link in the push chain — VAPID keys, member count, push subscribers, recent activity. Run this any time push "succeeds" but no phone lights up.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={debugLoading}
          onClick={runDiagnostics}
        >
          {debugLoading
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Checking…</>
            : <><Stethoscope className="h-3.5 w-3.5 mr-1.5" /> Run diagnostics</>}
        </Button>

        {debugErr && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {debugErr}
          </div>
        )}

        {debug && (
          <div className="mt-4 space-y-3">
            {/* Quick status rows. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <DebugStat
                label="VAPID keys"
                ok={debug.vapid_configured}
                okText="Configured"
                badText="Missing"
              />
              <DebugStat
                label="Members"
                ok={debug.member_count > 0}
                okText={`${debug.member_count}`}
                badText="0"
              />
              <DebugStat
                label="Push subscribers"
                ok={debug.push_subscribed_members > 0}
                okText={`${debug.push_subscribed_members}`}
                badText="0"
              />
              <DebugStat
                label="Notifs 24h"
                ok={debug.recent_notifications_24h > 0}
                okText={`${debug.recent_notifications_24h}`}
                badText="0"
              />
            </div>

            {/* Detail row */}
            <div className="rounded-xl bg-zinc-50 ring-1 ring-zinc-200 px-3 py-2 text-[11px] text-zinc-600 leading-relaxed">
              <div>
                <strong>VAPID subject:</strong> {debug.vapid_subject ?? <span className="text-zinc-400 italic">default (mailto:hello@atlas-engine.org)</span>}
              </div>
              <div>
                <strong>Push subscription rows total:</strong> {debug.subscriptions_total}
              </div>
              <div>
                <strong>atlas.base_url Postgres setting:</strong> {debug.atlas_base_url_setting ?? <span className="text-zinc-400 italic">not set (using hardcoded fallback)</span>}
              </div>
            </div>

            {/* Warnings. */}
            {debug.warnings.length > 0 ? (
              <div className="space-y-1.5">
                {debug.warnings.map((w, i) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 flex items-start gap-2 text-xs text-amber-900">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <div>{w}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 flex items-start gap-2 text-xs text-emerald-900">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div>All checks pass — if push still isn't arriving, the customer's browser may have blocked notifications. Have them re-tap the bell icon on /<em>slug</em>/app to re-grant.</div>
              </div>
            )}
          </div>
        )}
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

// CP-37.10 — diagnostics stat tile (good vs bad).
function DebugStat({
  label, ok, okText, badText,
}: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <div
      className={`rounded-xl border p-2.5 ${
        ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
      }`}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-zinc-500">
        {ok ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
        ) : (
          <XCircle className="h-3 w-3 text-rose-600" />
        )}
        {label}
      </div>
      <div
        className={`text-sm font-extrabold mt-0.5 ${
          ok ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        {ok ? okText : badText}
      </div>
    </div>
  );
}
