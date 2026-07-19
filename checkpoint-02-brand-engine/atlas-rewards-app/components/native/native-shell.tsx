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
} from "@/lib/native";

const RESERVED = new Set([
  "www", "agency", "admin", "api", "app", "mail", "blog", "marketing",
  "support", "help", "docs", "status", "dev", "staging", "test",
]);

type Wall = { kind: "update" | "kill"; message: string } | null;

export function NativeShell() {
  const [wall, setWall] = useState<Wall>(null);

  useEffect(() => {
    if (!isNative()) return;

    // 1) Remember the business we're inside (host = <slug>.<root-domain>)
    const labels = window.location.hostname.split(".");
    if (labels.length >= 3 && !RESERVED.has(labels[0])) {
      void prefSet(PREF_LAST_BUSINESS, labels[0]);
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
