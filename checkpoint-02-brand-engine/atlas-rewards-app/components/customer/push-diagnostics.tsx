"use client";
/**
 * PushDiagnostics — CP-81.1 (pre-launch testing aid)
 *
 * Native-app-only card at the bottom of the Profile tab that answers
 * "why didn't I get the notification prompt?" without guesswork:
 *
 *   • Shows the live OS push-permission state ("prompt" / granted /
 *     denied / unsupported) straight from the Capacitor bridge.
 *   • "Ask for permission now" — fires the real OS dialog + registers
 *     the FCM token (same path as tapping the bell).
 *   • "Replay onboarding" — clears the per-device seen-flags (bell
 *     nudge, offer reveal, signup confetti) and reloads, so the whole
 *     first-run sequence can be retested WITHOUT uninstalling the app.
 *     (The OS permission itself can only be reset by reinstalling or
 *     via Android Settings → Apps → notifications.)
 *
 * Renders nothing on the regular web. Safe to leave in production —
 * it's small, honest, and occasionally a support lifesaver — but easy
 * to delete later: remove <PushDiagnostics/> from profile/page.tsx.
 */
import { useEffect, useState } from "react";
import { Stethoscope, RefreshCw, BellRing } from "lucide-react";
import { isNative, nativePlatform, debugNativePushPermission } from "@/lib/native";
import { ensurePushSubscription } from "@/lib/notifications/push-client";

export function PushDiagnostics({ businessId }: { businessId: string }) {
  const [native, setNative] = useState(false);
  const [perm, setPerm] = useState<string>("…");
  const [permErr, setPermErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    const { state, error } = await debugNativePushPermission();
    setPerm(state);
    setPermErr(error);
  }

  useEffect(() => {
    if (!isNative()) return;
    setNative(true);
    void refresh();
  }, []);

  if (!native) return null;

  async function askNow() {
    setBusy(true); setNote(null);
    try {
      await ensurePushSubscription(businessId);
      await refresh();
      setNote("Done — if the dialog didn't appear, the OS has already recorded a decision (see state above).");
    } catch (e) {
      setNote(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function replayOnboarding() {
    try {
      const keys = [
        `atlas-push-nudge-seen:${businessId}`,
        `atlas-onboard-bell-done:${businessId}`,
        `atlas-offer-seen-${businessId}`,
        `atlas-signup-celebrated:${businessId}`,
      ];
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch { /* ignore */ }
    window.location.reload();
  }

  const permLabel =
    perm === "prompt" ? "Not asked yet" :
    perm === "granted" ? "Granted" :
    perm === "denied" ? "Denied (reinstall or Android Settings → Apps to reset)" :
    perm === "unsupported" ? "Plugin unavailable in this build" : perm;

  const permColor =
    perm === "granted" ? "text-emerald-600" :
    perm === "prompt" ? "text-amber-600" : "text-rose-600";

  return (
    <div className="px-4 mt-2 pb-2">
      <div className="rounded-2xl border border-dashed bg-white overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-dashed">
          <Stethoscope className="h-4 w-4 text-zinc-400" />
          <div className="text-xs font-bold text-zinc-500">Notification diagnostics</div>
          <span className="ml-auto text-[10px] uppercase tracking-wider font-bold text-zinc-400">
            {nativePlatform()}
          </span>
        </div>
        <div className="px-4 py-3 text-[12px] space-y-2">
          <div>
            OS permission: <span className={`font-bold ${permColor}`}>{permLabel}</span>
          </div>
          {permErr && permErr !== "not native" && (
            <p className="text-[11px] text-rose-600 leading-snug break-words">
              {permErr}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={askNow}
              disabled={busy || perm === "denied"}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold text-zinc-700 active:bg-zinc-50 disabled:opacity-40"
            >
              <BellRing className="h-3.5 w-3.5" /> Ask for permission now
            </button>
            <button
              type="button"
              onClick={replayOnboarding}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold text-zinc-700 active:bg-zinc-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Replay onboarding
            </button>
          </div>
          {note && <p className="text-[11px] text-zinc-500 leading-snug">{note}</p>}
        </div>
      </div>
    </div>
  );
}
