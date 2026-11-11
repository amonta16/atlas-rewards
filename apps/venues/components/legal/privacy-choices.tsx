"use client";
/** CP-242: the "Do Not Sell or Share" switch on /legal/privacy#choices. */
import { useEffect, useState } from "react";
import { gpcOn, optedOut, setOptOut } from "@/lib/privacy-optout";

export function PrivacyChoices() {
  const [state, setState] = useState<{ out: boolean; gpc: boolean } | null>(null);
  useEffect(() => { setState({ out: optedOut(), gpc: gpcOn() }); }, []);
  if (!state) return <div className="not-prose my-4 h-[76px] rounded-xl border bg-white" />;
  return (
    <div className="not-prose my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
      <div className="text-sm">
        <p className="font-semibold text-zinc-900">{state.out ? "You're opted out of sharing" : "Sharing for ads is allowed"}</p>
        <p className="text-zinc-500">
          {state.gpc ? "Your browser sends Global Privacy Control, so you're opted out automatically." : "Applies to this browser on atlas-engine.app."}
        </p>
      </div>
      {!state.gpc && (
        <button type="button" onClick={() => { setOptOut(!state.out); setState({ ...state, out: !state.out }); }}
          className={`h-10 rounded-full px-5 text-sm font-semibold ${state.out ? "border text-zinc-700" : "bg-zinc-900 text-white"}`}>
          {state.out ? "Allow again" : "Opt out of sharing"}
        </button>
      )}
    </div>
  );
}
