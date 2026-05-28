"use client";
import { useEffect, useState } from "react";
import { Gift, ChevronRight, Clock, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { RedemptionDetail } from "./redemption-detail";
import type { Business } from "@/lib/types/database";

export type ActiveRedemption = {
  id: string; reward_id: string; reward_name: string; reward_type: string;
  /** CP-23: present after the my_redemptions SQL extension is applied; falls
   *  back to undefined for older databases — the row just renders without an image. */
  reward_image?: string | null;
  point_cost: number; code: string; status: string;
  created_at: string; expires_at: string | null; fulfilled_at: string | null;
};

// CP-22: a live, noticeable expiration countdown is the single biggest driver
// of "use it before you lose it" visits. The pill below sits on every active
// reward row and re-renders every 30 seconds so the time stays current
// without a network round-trip.
type Urgency = "calm" | "soon" | "urgent" | "expired";

function urgencyFor(expiresAt: string | null, now: number): { urgency: Urgency; label: string } | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return { urgency: "expired", label: "Expired" };
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return {
      urgency: days <= 2 ? "soon" : "calm",
      label: `${days} day${days === 1 ? "" : "s"} left`,
    };
  }
  if (hours >= 1) {
    return { urgency: "urgent", label: `${hours} hr${hours === 1 ? "" : "s"} left` };
  }
  return { urgency: "urgent", label: `${Math.max(1, mins)} min${mins === 1 ? "" : "s"} left` };
}

export function ActiveRedemptions({
  business, initialRedemptions, membershipId,
}: { business: Business; initialRedemptions: ActiveRedemption[]; membershipId: string | null }) {
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [open, setOpen] = useState<ActiveRedemption | null>(null);

  // Tick "now" forward every 30s so the live countdown stays honest without
  // a refetch. 30s is a reasonable middle ground — granular enough that the
  // last-hour panic is visible, cheap enough to not waste battery on idle tabs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Live update when status changes (manager fulfills it) or new redemption is created
  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase.rpc("my_redemptions", { p_business_id: business.id });
      setRedemptions((data ?? []) as ActiveRedemption[]);
    };
    const ch = supabase
      .channel(`redemptions-${membershipId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "redemptions", filter: `membership_id=eq.${membershipId}` },
        () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [membershipId, business.id]);

  const pending = redemptions.filter(r => r.status === "pending");

  if (pending.length === 0) return null;

  // CP-23: rows are dramatic on purpose. Andrew called out the old plain-white
  // tiles as boring; the goal of this surface is to drive visits. Each row gets
  // a gradient using the brand's primary color (with the reward image bleeding
  // through at low opacity), the reward image on the left, and the live
  // countdown pill below the code. When urgency hits "urgent" or "expired"
  // the gradient also leans rose to add a final visual push.
  const primary = business.brand_colors.primary;

  return (
    <>
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-bold">Your active rewards</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            Use it before you lose it
          </span>
        </div>
        <div className="space-y-2.5">
          {pending.map(r => {
            const u = urgencyFor(r.expires_at, now);
            const urgent = u?.urgency === "urgent" || u?.urgency === "expired";
            // Urgent gets rose-tinted; otherwise the brand primary takes over.
            const fromColor = urgent ? "#e11d48" : primary;
            const toColor   = urgent ? "#9f1239" : primary;
            return (
              <button
                key={r.id}
                onClick={() => setOpen(r)}
                className="w-full text-left rounded-2xl overflow-hidden relative active:scale-[0.99] transition-transform shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${fromColor} 0%, ${toColor}dd 100%)`,
                  boxShadow: `0 10px 24px ${fromColor}33`,
                }}
              >
                {/* Decorative glow */}
                <div
                  className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-25 blur-2xl pointer-events-none"
                  style={{ background: "white" }}
                />

                <div className="relative flex items-stretch gap-3 p-3">
                  {/* Reward image (or fallback gift icon on white) */}
                  <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 bg-white/15 border border-white/25 flex items-center justify-center">
                    {r.reward_image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.reward_image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Gift className="h-7 w-7 text-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-white">
                    <div className="text-[10px] font-black tracking-widest uppercase text-white/80">
                      Active reward
                    </div>
                    <div className="text-sm font-extrabold leading-tight truncate">
                      {r.reward_name}
                    </div>
                    <div className="text-[11px] text-white/90 mt-1">
                      Code:{" "}
                      <span className="font-mono font-bold tracking-wider bg-white/20 px-1.5 py-0.5 rounded">
                        {r.code}
                      </span>
                    </div>
                    {u && <CountdownPill urgency={u.urgency} label={u.label} />}
                  </div>

                  <ChevronRight className="h-5 w-5 text-white/80 shrink-0 self-center" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {open && <RedemptionDetail business={business} redemption={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CountdownPill({ urgency, label }: { urgency: Urgency; label: string }) {
  // CP-23: the pill sits on a colored row now, so it needs to punch through.
  // Solid white background with bold colored text gives the highest contrast
  // regardless of brand color. Urgent still gets the pulsing rose dot — the
  // "get to the shop" cue Andrew specifically asked for.
  const styles: Record<Urgency, { fg: string; pulse?: boolean; icon: React.ReactNode }> = {
    calm:    { fg: "text-emerald-700", icon: <Clock className="h-3 w-3" /> },
    soon:    { fg: "text-amber-700",   icon: <Clock className="h-3 w-3" /> },
    urgent:  { fg: "text-rose-700",    pulse: true, icon: <AlertTriangle className="h-3 w-3" /> },
    expired: { fg: "text-zinc-600",    icon: <Clock className="h-3 w-3" /> },
  };
  const style = styles[urgency];

  return (
    <span
      className={`mt-1.5 inline-flex items-center gap-1 bg-white ${style.fg} text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm`}
    >
      {style.pulse && (
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
      )}
      {style.icon}
      {label}
    </span>
  );
}
