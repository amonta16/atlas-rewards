/**
 * PointsExpiryNote — CP-220 · customer Home, under the points card
 *
 * Only on businesses where points expire after inactivity (entertainment
 * apps; 180 days, Domino's-style: any visit, earn or redemption resets it).
 *   · more than 30 days out → one quiet line so the rule is never a surprise;
 *   · within 30 days        → an amber nudge with the date.
 * Renders nothing when points never expire or the balance is 0.
 */
import { Clock } from "lucide-react";

export type PointsExpiry = { enabled: boolean; expiry_days: number | null; points: number; expires_at: string | null };

export function PointsExpiryNote({ expiry, timezone }: { expiry: PointsExpiry | null; timezone?: string | null }) {
  if (!expiry?.enabled || !expiry.expires_at || expiry.points <= 0) return null;
  const at = new Date(expiry.expires_at);
  const days = Math.max(0, Math.ceil((at.getTime() - Date.now()) / 86_400_000));
  const sameYear = at.getFullYear() === new Date().getFullYear();
  let date = "";
  try {
    date = at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: sameYear ? undefined : "numeric", timeZone: timezone ?? undefined });
  } catch {
    date = at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const months = Math.round((expiry.expiry_days ?? 180) / 30);
  const pts = expiry.points.toLocaleString();

  if (days <= 30) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <b>Your {pts} points expire {days <= 1 ? "within a day" : `on ${date}`}.</b> Any visit keeps them.
        </span>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-zinc-500">
      <Clock className="h-3 w-3 shrink-0" />
      <span>Points stay active with a visit every {months} months · next expiry {date}</span>
    </div>
  );
}
