"use client";
/**
 * CP-76: NativeShell — mounted once in the root layout, renders nothing
 * on the regular web/PWA. Inside the Capacitor app it:
 *
 *   1. Remembers the current business (subdomain) in native Preferences
 *      so the NEXT cold start boots straight into it (/join reads this).
 *   2. Reads app_config (CP-75) and shows a full-screen wall when this
 *      build < min_supported_build, or when the kill switch is on.
 *   3. Listens for deep links (App Links / Universal Links) and routes
 *      them into the webview instead of dropping them.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isNative, getAppBuild, prefSet, onAppUrlOpen, PREF_LAST_BUSINESS,
  registerNativePush, onPushTap, nativePlatform, checkNativePushPermission,
  resolveNativeBusinessSlug,
} from "@/lib/native";

type Wall = { kind: "update" | "kill"; message: string } | null;

export function NativeShell() {
  const [wall, setWall] = useState<Wall>(null);

  useEffect(() => {
    if (!isNative()) return;

    // 1) Remember the business we're inside.
    // CP-91: was subdomain-only — on the path-routed apex host
    // (app.atlas-engine.app/<slug>/app, the CP-74/81 flow) it resolved
    // null, so the silent token re-registration below NEVER ran and
    // push_subscriptions stayed empty. resolveNativeBusinessSlug handles
    // both subdomain and path routing.
    const businessSlug = resolveNativeBusinessSlug();
    if (businessSlug) {
      void prefSet(PREF_LAST_BUSINESS, businessSlug);

      // CP-77 → CP-81.1: native push token refresh. This shell-level path
      // now runs ONLY when permission is already granted — it silently
      // re-registers the token on every open so pushes keep working.
      // The permission ASK itself belongs to the bell-nudge onboarding
      // moment (EnablePushNudge → bell tap → OS dialog), so the dialog
      // appears in the right order: spotlight animation FIRST, then the
      // system prompt, then celebrate/offer popups.
      (async () => {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const perm = await checkNativePushPermission();
          if (perm !== "granted") return; // ask happens via the bell nudge
          await registerNativePush(async (token) => {
            await fetch("/api/notifications/subscribe", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                platform: nativePlatform(),
                token,
                business_slug: businessSlug,
              }),
            }).catch(() => { /* offline — retried next open */ });
          });
          onPushTap((linkPath) => { window.location.href = linkPath; });
        } catch {
          /* push is best-effort, never break the app over it */
        }
      })();
    }

    // 2) Version gate / kill switch
    (async () => {
      try {
        const supabase = createClient();
        const [{ data: cfg }, build] = await Promise.all([
          supabase.from("app_config").select("*").eq("id", 1).maybeSingle(),
          getAppBuild(),
        ]);
        if (!cfg) return;
        if (cfg.kill_switch) {
          setWall({ kind: "kill", message: cfg.kill_message || "Atlas Rewards is temporarily down for maintenance. Please check back soon." });
          return;
        }
        if (build != null && cfg.min_supported_build > 0 && build < cfg.min_supported_build) {
          setWall({ kind: "update", message: cfg.update_message || "A new version of the app is required to keep going." });
        }
      } catch {
        /* config unreachable (offline) — never block the app on it */
      }
    })();

    // 3) Deep links → route inside the webview
    onAppUrlOpen((url) => {
      try {
        const u = new URL(url);
        window.location.href = u.pathname + u.search;
      } catch {
        /* ignore malformed */
      }
    });
  }, []);

  if (!wall) return null;

  const storeUrl = process.env.NEXT_PUBLIC_PLAY_STORE_URL || process.env.NEXT_PUBLIC_APP_STORE_URL || "";

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center px-8">
      <div className="max-w-xs text-center">
        <div className="text-5xl mb-4">{wall.kind === "update" ? "⬆️" : "🛠️"}</div>
        <h1 className="text-xl font-extrabold text-zinc-900">
          {wall.kind === "update" ? "Update required" : "Back soon"}
        </h1>
        <p className="text-sm text-zinc-500 mt-2">{wall.message}</p>
        {wall.kind === "update" && storeUrl && (
          <a
            href={storeUrl}
            className="mt-5 inline-block rounded-xl bg-cyan-600 px-6 py-3 text-sm font-bold text-white"
          >
            Update now
          </a>
        )}
      </div>
    </div>
  );
}
