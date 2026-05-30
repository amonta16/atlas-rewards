"use client";
/**
 * NotificationBell — CP-32 / CP-42
 *
 * Bell icon + unread badge that opens the NotificationCenter sheet.
 * Wired into the customer Home header. Realtime-driven: updates the
 * unread count as new notifications land for the signed-in user.
 *
 * CP-42 fix: push permission request now fires on bell TAP, not on
 * component mount. iOS PWAs silently ignore Notification.requestPermission()
 * unless it runs inside a user-gesture handler. Moving the call here
 * fixes the "I never saw the permission prompt" bug.
 *
 * If push permission is currently "denied", we surface a small banner
 * telling the user to re-enable it from their phone's Settings (iOS
 * hides the re-prompt option after a denial).
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, BellPlus } from "lucide-react";
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
  // CP-42: track current permission state so the bell can show a hint
  // if push was denied.
  const [permState, setPermState] = useState<NotificationPermission | "unsupported">("default");
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermState(Notification.permission);
    } else {
      setPermState("unsupported");
    }

    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("unread_notification_count");
      if (!cancelled) setUnread(typeof data === "number" ? data : (data?.[0] ?? 0));
    };
    load();
    const ch = supabase
      .channel(`notifs-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        load,
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [membershipId]);

  /**
   * CP-42: bell tap = THE user-gesture moment to request push permission.
   * Order:
   *   1. If permission is "default" (never asked), prompt now.
   *   2. If granted, register the push subscription (idempotent — safe
   *      to call repeatedly).
   *   3. Open the notification center either way.
   */
  async function handleClick() {
    setOpen(true);

    if (typeof window === "undefined" || !("Notification" in window)) return;

    let perm = Notification.permission;
    if (perm === "default") {
      setPushing(true);
      try {
        perm = await Notification.requestPermission();
        setPermState(perm);
      } catch {
        // Some embedded browsers throw — silently ignore
      } finally {
        setPushing(false);
      }
    }

    if (perm === "granted") {
      // Fire-and-forget subscription register. Silent on failure so the
      // notification center still opens cleanly.
      ensurePushSubscription(businessId).catch(() => { /* ignore */ });
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pushing}
        className="relative h-10 w-10 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/25 transition"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      >
        {permState === "denied" ? (
          <BellOff className="h-5 w-5 text-white/70" />
        ) : permState === "default" ? (
          <BellPlus className="h-5 w-5 text-white" />
        ) : (
          <Bell className="h-5 w-5 text-white" />
        )}
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
          permState={permState}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
