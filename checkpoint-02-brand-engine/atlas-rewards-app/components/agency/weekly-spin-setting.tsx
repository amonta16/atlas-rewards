"use client";
/**
 * WeeklySpinSetting — CP-221
 *
 * The on/off switch for the free weekly home spin, shown in the brand
 * editor's Settings → Notifications area (next to the other automated
 * notification switches). The Automation Hub lists the same automation under
 * "Existing automations" with its 30-day send count.
 *
 * What it controls (all server-side, see checkpoint-221 SQL):
 *   • one free wheel spin per member per week, from home, never stacks;
 *   • a weekly "spin ready" push plus a reminder at most every 2 weeks, only to
 *     members who haven't spun, only inside the business's opening hours.
 */
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { Business } from "@/lib/types/database";

export function WeeklySpinSetting({ business }: { business: Business }) {
  const { toast } = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let off = false;
    createClient().from("businesses").select("weekly_spin_enabled").eq("id", business.id).maybeSingle()
      .then(({ data, error }) => {
        if (off) return;
        // Column missing (SQL not applied yet) → hide the card.
        setOn(error ? null : !!(data as { weekly_spin_enabled?: boolean } | null)?.weekly_spin_enabled);
      });
    return () => { off = true; };
  }, [business.id]);

  if (on === null) return null;

  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    const { error } = await createClient().rpc("set_weekly_spin_enabled", { p_business_id: business.id, p_enabled: next });
    setSaving(false);
    if (error) { setOn(!next); toast.error("Save failed — " + error.message); return; }
    toast.success(next ? "Weekly home spin is on" : "Weekly home spin is off");
  }

  return (
    <div className="rounded-3xl border bg-white p-5 lg:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-yellow-500" />
        <h3 className="font-bold">Weekly home spin</h3>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 ml-auto" />}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Every member gets one free spin of the prize wheel each week that they can take from home — no check-in.
        Skipping a week doesn&apos;t stack it; they still have one. The visit spin is unchanged.
      </p>
      <button type="button" onClick={toggle}
        className="w-full text-left rounded-2xl border bg-white p-3 flex items-center gap-3 hover:bg-zinc-50 transition">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-yellow-100 text-yellow-800">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-tight">Free spin from home, once a week</div>
          <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
            Pushes only inside your opening hours and only to members who haven&apos;t spun yet: <b>spin ready</b> each week
            (first open day, 1 h after opening) · a <b>reminder</b> at most every 2 weeks (Thursday, ~4 pm).
          </div>
        </div>
        <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-emerald-500" : "bg-zinc-300"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
        </span>
      </button>
    </div>
  );
}
