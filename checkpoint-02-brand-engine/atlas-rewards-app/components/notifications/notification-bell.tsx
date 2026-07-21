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
import { isNative, checkNativePushPermission } from "@/lib/native";

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
    const supabase = createClient();
    let cancelled = false;

    // CP-80: the Capacitor WebView has no browser Notification API — read
    // the OS push-permission state through the native bridge instead
    // ("prompt" maps to the web's "default" = not asked yet).
    if (isNative()) {
      checkNativePushPermission().then((p) => {
        if (cancelled) return;
        setPermState(p === "prompt" ? "default" : p);
      });
    } else if (typeof window !== "undefined" && "Notification" in window) {
      setPermState(Notification.permission);
    } else {
      setPermState("unsupported");
    }
    const load = async () => {
      // CP-44: scope the unread count to THIS business so a customer who
      // belongs to multiple Atlas businesses doesn't see another business's
      // count in this app's bell.
      const { data } = await supabase.rpc("unread_notification_count", { p_business_id: businessId });
      if (!cancelled) setUnread(typeof data === "number" ? data : (data?.[0] ?? 0));
    };
    load();
    // CP-43: when a new notification row lands for this customer (e.g. the
    // reward-unlocked trigger after they earn enough points via ANY path —
    // check-in, spin, front-desk award), immediately flush their pending
    // pushes to their phone via the proven sendPush path. This is the
    // cron-independent instant delivery for self-earned crossings.
    const flushMine = () => {
      fetch("/api/notifications/flush-mine", { method: "POST" }).catch(() => { /* silent */ });
    };
    const ch = supabase
      .channel(`notifs-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => { load(); flushMine(); },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        load,
      )
      .subscribe();
    // Also flush anything already pending the moment the app opens.
    flushMine();

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

    // CP-80: native shell — the bell tap is the user-gesture moment to
    // fire the OS push dialog, exactly like the web. ensurePushSubscription
    // routes to the native FCM/APNs path inside the app.
    if (isNative()) {
      if (permState === "granted") {
        // Already allowed — just refresh the token registration silently.
        ensurePushSubscription(businessId).catch(() => { /* ignore */ });
        return;
      }
      if (permState === "denied") return; // OS won't re-prompt; banner explains
      setPushing(true);
      try {
        await ensurePushSubscription(businessId);
        const p = await checkNativePushPermission();
        setPermState(p === "prompt" ? "default" : p);
      } catch {
        /* best-effort */
      } finally {
        setPushing(false);
      }
      return;
    }

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
        // CP-42: data-attr so the first-visit nudge overlay can locate
        // this exact button and aim its arrow at it.
        data-atlas-bell="1"
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
          businessId={businessId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
