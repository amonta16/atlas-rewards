"use client";
/**
 * Push opt-in. Home: a dismissible card ("Never miss a reward"). Profile:
 * a Notifications row with an on/off switch. On iPhone in Safari it shows
 * how to add the app to the Home Screen first (Apple's rule for web push).
 */
import { useEffect, useState } from "react";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push-client";
import { IcClose, IcSpark } from "./icons";

function usePush(demo: boolean) {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { pushState(demo).then(setState).catch(() => setState("unsupported")); }, [demo]);
  return [state, setState] as const;
}

const SHARE_HINT = "Tap the Share button, then “Add to Home Screen”. Open the app from your Home Screen to turn on notifications.";

export function NotifyCard({ clinicId, clinicName, slug, demo }: { clinicId: string; clinicName: string; slug: string; demo: boolean }) {
  const [state, setState] = usePush(demo);
  const [busy, setBusy] = useState(false);
  const key = `ms_push_dismissed_${slug}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); } }, [key]);
  const dismiss = () => { setHidden(true); try { localStorage.setItem(key, "1"); } catch { /* fine */ } };

  if (hidden || !state || state === "on" || state === "unsupported" || state === "blocked") return null;
  return (
    <section className="relative mx-4 mt-4 rounded-card bg-white p-5 shadow-card">
      <button type="button" aria-label="Not now" onClick={dismiss} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-page"><IcClose className="h-3.5 w-3.5" /></button>
      <div className="flex items-center gap-3 pr-8">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-tint text-brand"><IcSpark className="h-5 w-5" /></span>
        <p className="text-[17px] font-semibold leading-tight">Never miss a reward</p>
      </div>
      <p className="mt-2 text-[14.5px] leading-snug text-sub">
        {state === "needs-install" ? SHARE_HINT : `Get a heads-up from ${clinicName} when a reward unlocks, an offer drops or you're due for your next visit.`}
      </p>
      {state === "off" && (
        <button type="button" className="btn-ink mt-4" disabled={busy}
          onClick={async () => { setBusy(true); setState(await turnOnPush(clinicId, { demo, clinicName }).catch(() => "off" as const)); setBusy(false); }}>
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
    </section>
  );
}

export function NotifyRow({ clinicId, clinicName, demo }: { clinicId: string; clinicName: string; demo: boolean }) {
  const [state, setState] = usePush(demo);
  const [busy, setBusy] = useState(false);
  if (!state || state === "unsupported") return null;
  const on = state === "on";
  const sub = state === "needs-install" ? "Add the app to your Home Screen first" : state === "blocked" ? "Blocked in your phone's settings" : on ? "On for this device" : "Off";
  return (
    <li>
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        <IcSpark className="h-5 w-5 text-sub" />
        <span className="flex-1">
          <span className="block text-[15.5px] font-medium">Notifications</span>
          <span className="block text-[13px] text-sub">{sub}</span>
        </span>
        {(state === "on" || state === "off") && (
          <button type="button" role="switch" aria-checked={on} aria-label="Notifications" disabled={busy}
            onClick={async () => { setBusy(true); setState(await (on ? turnOffPush() : turnOnPush(clinicId, { demo, clinicName })).catch(() => state)); setBusy(false); }}
            className={`relative h-7 w-12 rounded-full transition ${on ? "bg-ink" : "bg-line"}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[1.4rem]" : "left-0.5"}`} />
          </button>
        )}
      </div>
      {state === "needs-install" && <p className="-mt-1 px-4 pb-3 pl-[3.1rem] text-[13px] text-sub">{SHARE_HINT}</p>}
    </li>
  );
}
