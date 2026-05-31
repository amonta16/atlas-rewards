"use client";
/**
 * DailySpinButton — CP-42
 *
 * Reusable wrapper around the existing "Daily Spin · Check in to unlock"
 * button so we can render the SAME UI on both:
 *   • the Rewards tab (where Andrew originally placed it)
 *   • the Home tab (Andrew asked to surface it under the Featured offer)
 *
 * State source-of-truth: queries check_in_events for "checked in today"
 * once on mount + subscribes to INSERTs so the button flips the moment
 * front-desk scans the customer.
 *
 * Locked → gray card, "Check in to unlock", tap does nothing.
 * Unlocked → brand-gradient card, "You're ready to spin!", tap opens
 *            DailyMysteryModal (existing slot-machine reveal).
 */
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DailyMysteryModal } from "./daily-mystery-modal";
import type { Business } from "@/lib/types/database";

export function DailySpinButton({
  business,
  membershipId,
}: {
  business: Business;
  membershipId: string;
}) {
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [spinOpen, setSpinOpen] = useState(false);

  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();

    const load = async () => {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("check_in_events")
        .select("id")
        .eq("membership_id", membershipId)
        .gte("created_at", dayStart.toISOString())
        .limit(1);
      setCheckedInToday((data?.length ?? 0) > 0);
    };
    load();

    // Realtime: flip to unlocked the moment they get scanned at the desk.
    const ch = supabase
      .channel(`spin-button-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membershipId]);

  return (
    <>
      <div className="px-4 mt-5">
        <button
          onClick={() => setSpinOpen(true)}
          className="w-full rounded-2xl overflow-hidden text-left relative active:scale-[0.99] transition-transform"
          style={{
            background: checkedInToday
              ? `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)`
              : "rgb(244 244 245)",
          }}
        >
          <div className="p-4 flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl shrink-0"
              style={{
                background: checkedInToday ? "rgba(255,255,255,0.2)" : "rgb(228 228 231)",
              }}
            >
              🎰
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[11px] font-extrabold uppercase tracking-widest ${checkedInToday ? "text-white/80" : "text-zinc-400"}`}
              >
                Daily Spin
              </div>
              <div className={`font-extrabold text-base leading-tight mt-0.5 ${checkedInToday ? "text-white" : "text-zinc-400"}`}>
                {checkedInToday ? "You're ready to spin!" : "Check in to unlock"}
              </div>
              <div className={`text-xs mt-0.5 ${checkedInToday ? "text-white/75" : "text-zinc-400"}`}>
                {checkedInToday ? "Tap to play your slot machine" : "Visit the shop to get your spin"}
              </div>
            </div>
            <div className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${
              checkedInToday ? "bg-white text-zinc-900" : "bg-zinc-200 text-zinc-500"
            }`}>
              <Zap className="h-3 w-3" />
              {checkedInToday ? "SPIN!" : "Locked"}
            </div>
          </div>
          {checkedInToday && (
            <div className="absolute top-2 right-20 text-lg opacity-20 pointer-events-none">⭐💎🔥</div>
          )}
        </button>
      </div>

      {spinOpen && (
        <DailyMysteryModal
          business={business}
          membershipId={membershipId}
          checkedInToday={checkedInToday}
          onClose={() => setSpinOpen(false)}
        />
      )}
    </>
  );
}
