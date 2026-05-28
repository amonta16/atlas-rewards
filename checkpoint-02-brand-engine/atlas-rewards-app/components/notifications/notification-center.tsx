"use client";
/**
 * NotificationCenter — CP-32
 *
 * Slide-up sheet listing the signed-in customer's recent in-app
 * notifications. Sections (Andrew's brief):
 *
 *   • Streaks          — milestone reached, streak about to break, etc.
 *   • Google Review    — review approved, points awarded
 *   • Daily Check      — checked in today / streak reminder
 *   • Automated Offers — automated offer just dropped
 *   • Customer Offers  — manager broadcast (custom message + offer)
 *   • Active rewards   — redemption about to expire
 *
 * Each row links into the relevant tab so tapping the notification
 * takes the user to the thing.
 *
 * Mark-as-read happens on open (bulk RPC mark_all_notifications_read).
 */
import { useEffect, useState } from "react";
import {
  X, Flame, Star, ClipboardCheck, Sparkles, MessageSquareHeart, Gift,
  Bell, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NotifKind =
  | "streak" | "review" | "daily_check" | "automated_offer"
  | "customer_offer" | "reward_expiration" | "generic";

type Notif = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  link_path: string | null;
};

const KIND_META: Record<NotifKind, { icon: typeof Flame; tone: string; label: string }> = {
  streak:             { icon: Flame,              tone: "bg-orange-100 text-orange-700",   label: "Streak" },
  review:             { icon: Star,               tone: "bg-amber-100 text-amber-700",     label: "Google Review" },
  daily_check:        { icon: ClipboardCheck,     tone: "bg-emerald-100 text-emerald-700", label: "Daily Check" },
  automated_offer:    { icon: Sparkles,           tone: "bg-violet-100 text-violet-700",   label: "Automated Offer" },
  customer_offer:     { icon: MessageSquareHeart, tone: "bg-rose-100 text-rose-700",       label: "From the team" },
  reward_expiration:  { icon: Gift,               tone: "bg-yellow-100 text-yellow-800",   label: "Reward expiring" },
  generic:            { icon: Bell,               tone: "bg-zinc-100 text-zinc-700",       label: "Notification" },
};

export function NotificationCenter({
  primary, onClose,
}: { primary: string; onClose: () => void }) {
  const [list, setList] = useState<Notif[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("list_notifications", { p_limit: 50 });
      if (!cancelled) setList((data ?? []) as Notif[]);
      // Mark everything read once the sheet is open
      await supabase.rpc("mark_all_notifications_read");
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // CP-35: constrain the sheet to the customer-app phone-frame width
  // (max-w-md) so it doesn't span the whole desktop viewport. The dark
  // scrim still covers everything, but the white panel sits centered
  // and rises from the bottom inside the phone frame.
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md max-h-[88vh] bg-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 text-white relative"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/25"
            aria-label="Close notifications"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-extrabold opacity-90">
            <Bell className="h-3 w-3" /> Notifications
          </div>
          <h2 className="text-2xl font-extrabold mt-1">What's new</h2>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {list === null && (
            <div className="p-10 text-center text-sm text-zinc-500 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {list?.length === 0 && (
            <div className="p-10 text-center">
              <Bell className="h-10 w-10 text-zinc-300 mx-auto mb-2" />
              <div className="text-sm font-semibold text-zinc-700">All caught up</div>
              <div className="text-xs text-zinc-500 mt-1">
                We'll ping you when you earn points, a reward unlocks, or the team sends an offer.
              </div>
            </div>
          )}
          {list && list.length > 0 && (
            <div className="divide-y">
              {list.map(n => {
                const meta = KIND_META[n.kind] ?? KIND_META.generic;
                const Icon = meta.icon;
                const isUnread = !n.read_at;
                return (
                  <a
                    key={n.id}
                    href={n.link_path ?? "#"}
                    onClick={(e) => { if (!n.link_path) e.preventDefault(); }}
                    className={"block px-5 py-3 hover:bg-zinc-50 " + (isUnread ? "bg-zinc-50/60" : "")}
                  >
                    <div className="flex items-start gap-3">
                      <div className={"h-10 w-10 rounded-xl flex items-center justify-center shrink-0 " + meta.tone}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                            {meta.label}
                          </div>
                          {isUnread && (
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block" />
                          )}
                          <div className="text-[10px] text-zinc-400 ml-auto">
                            {timeAgo(n.created_at)}
                          </div>
                        </div>
                        <div className="text-sm font-bold leading-snug mt-0.5">{n.title}</div>
                        {n.body && <div className="text-xs text-zinc-600 mt-0.5 leading-snug">{n.body}</div>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
