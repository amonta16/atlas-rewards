"use client";
/**
 * PointsExpiryChip — CP-220 · front desk
 *
 * On businesses where points expire after inactivity (entertainment apps),
 * staff see when this member's balance would expire, so they can answer
 * "when do my points run out?" — and tell them today's visit keeps them.
 * Renders nothing where points never expire or the balance is 0.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = { enabled: boolean; expiry_days: number | null; points: number; expires_at: string | null };

export function PointsExpiryChip({ membershipId, balance, timezone }: { membershipId: string; balance: number; timezone?: string | null }) {
  const [row, setRow] = useState<Row | null>(null);
  useEffect(() => {
    let off = false;
    createClient().rpc("member_points_expiry", { p_membership_id: membershipId }).then(({ data }) => {
      if (!off) setRow(((Array.isArray(data) ? data[0] : data) ?? null) as Row | null);
    });
    return () => { off = true; };
  }, [membershipId, balance]);

  if (!row?.enabled || !row.expires_at || balance <= 0) return null;
  const at = new Date(row.expires_at);
  const days = Math.ceil((at.getTime() - Date.now()) / 86_400_000);
  const date = at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: at.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined, timeZone: timezone ?? undefined });
  const soon = days <= 30;
  return (
    <div className={`text-[10px] font-semibold mt-0.5 ${soon ? "text-amber-700" : "text-muted-foreground"}`} title="Any visit, earn or redemption resets this">
      {soon ? `expire in ${Math.max(days, 0)}d` : `expire ${date} if inactive`}
    </div>
  );
}
