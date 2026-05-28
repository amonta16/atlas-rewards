"use client";
/**
 * NotificationBell — CP-32
 *
 * Bell icon + unread badge that opens the NotificationCenter sheet.
 * Wired into the customer Home header. Realtime-driven: updates the
 * unread count as new notifications land for the signed-in user.
 *
 * The bell also doubles as the PWA push registration prompt — on first
 * mount it asks for permission (if not already granted/denied) and
 * registers a push subscription on grant. The subscription is POSTed to
 * /api/notifications/subscribe so the server can fan messages out later.
 */
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NotificationCenter } from "./notification-center";
import { ensurePushSubscription } from "@/lib/notifications/push-client";

export function NotificationBell({
  primary,
  membershipId,
  businessId,
}: {
  primary: string;
  membershipId: string;
  businessId: string;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("unread_notification_count");
      if (!cancelled) setUnread(typeof data === "number" ? data : (data?.[0] ?? 0));
    };
    load();
    // Realtime — refresh on any insert/update for this user.
    const ch = supabase
      .channel(`notifs-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        load,
      )
      .subscribe();

    // Register for push (lazy + idempotent — bail silently if not supported)
    ensurePushSubscription(businessId).catch(() => { /* ignore — service worker may be missing */ });

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [membershipId, businessId]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative h-10 w-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/25 transition"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="h-5 w-5 text-white" />
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center bg-rose-500 text-white ring-2 ring-white animate-pulse"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <NotificationCenter
          primary={primary}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
