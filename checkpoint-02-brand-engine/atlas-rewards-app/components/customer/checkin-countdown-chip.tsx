"use client";
/**
 * CheckinCountdownChip — CP-39
 *
 * Subtle "Next check-in in 6 Hr" / "Ready to check in" pill that sits
 * above the QR on the customer's Check in (scan) tab. Intentionally
 * small — the QR is the hero, this just answers "can I scan now?" at a
 * glance.
 *
 * Backed by the member_checkin_status RPC (from cp36_migration.sql).
 * If that RPC isn't applied yet, the chip self-hides rather than
 * showing a broken state.
 */
import { useEffect, useState } from "react";
import { Clock, Check, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = {
  can_check_in_now: boolean;
  last_checkin_at: string | null;
  next_check_in_at: string | null;
  seconds_until_next: number | null;
  checked_in_today: boolean;
};

export function CheckinCountdownChip({
  businessId,
  membershipId,
  primary,
}: {
  businessId: string;
  membershipId: string | null;
  primary: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("member_checkin_status", {
        p_business_id: businessId,
        p_membership_id: membershipId,
      });
      if (cancelled) return;
      if (error) {
        // RPC not deployed → silently hide the chip
        setStatus(null);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as Status | null;
      setStatus(row);
      setSecondsLeft(
        row && !row.can_check_in_now ? Math.max(0, Number(row.seconds_until_next || 0)) : null,
      );
    };
    load();

    // Tick locally every 30s so the countdown feels live without
    // hammering the RPC.
    const tick = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev == null) return prev;
        const next = prev - 30;
        return next <= 0 ? null : next;
      });
    }, 30_000);

    // Refresh whenever a new check-in lands
    const ch = supabase
      .channel(`checkin-chip-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "check_in_events", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();

    return () => { cancelled = true; clearInterval(tick); supabase.removeChannel(ch); };
  }, [businessId, membershipId]);

  // Hide entirely if we have no useful status (RPC missing, no membership, etc.)
  if (!status) return null;

  const cooldown = secondsLeft != null && secondsLeft > 0;
  const ready = !cooldown && status.can_check_in_now;

  const label = cooldown
    ? (secondsLeft >= 3600
        ? `Next check-in in ${Math.ceil(secondsLeft / 3600)} Hr`
        : `Next check-in in ${Math.max(1, Math.ceil(secondsLeft / 60))} min`)
    : ready
      ? "Ready to check in ✨"
      : "Check in any time";

  return (
    <div className="flex justify-center mt-2 mb-3">
      <span
        className={
          "inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide px-3 py-1.5 rounded-full shadow-sm " +
          (ready
            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            : cooldown
              ? "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200"
              : "ring-1 ring-zinc-200 bg-white")
        }
        style={!ready && !cooldown ? { color: primary } : undefined}
      >
        {ready ? (
          <Check className="h-3 w-3" />
        ) : cooldown ? (
          <Clock className="h-3 w-3" />
        ) : (
          <Lock className="h-3 w-3" />
        )}
        {label}
      </span>
    </div>
  );
}
