"use client";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Message = {
  id: string;
  kind: "winback" | "reminder" | "offer" | "milestone";
  title: string;
  body: string | null;
  bonus_points: number | null;
  expires_at: string | null;
  is_dismissed: boolean;
  created_at: string;
};

/**
 * Customer Home banner that surfaces personal messages the Come-Back AI sends
 * (and any other customer_messages row). Subscribes via Realtime so a manager
 * tapping "Send win-back" makes the banner appear without a page refresh.
 */
export function WinbackBanner({ business, membershipId }: { business: Business; membershipId: string | null }) {
  const [msg, setMsg] = useState<Message | null>(null);

  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("customer_messages")
        .select("*")
        .eq("membership_id", membershipId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      const row = (data?.[0] ?? null) as Message | null;
      if (row && row.expires_at && new Date(row.expires_at) < new Date()) {
        setMsg(null);
      } else {
        setMsg(row);
      }
    };

    load();
    const ch = supabase
      .channel(`winback-${membershipId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "customer_messages", filter: `membership_id=eq.${membershipId}` },
        load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [membershipId]);

  if (!msg) return null;

  async function dismiss() {
    if (!msg) return;
    const supabase = createClient();
    await supabase.from("customer_messages").update({ is_dismissed: true }).eq("id", msg.id);
    setMsg(null);
  }

  return (
    <div className="px-4 mt-3">
      <div
        className="relative rounded-2xl p-4 text-white overflow-hidden shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)`,
        }}
      >
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div className="h-10 w-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight">{msg.title}</div>
            {msg.body && <div className="text-xs opacity-90 mt-0.5">{msg.body}</div>}
            {msg.bonus_points != null && msg.bonus_points > 0 && (
              <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-bold">
                +{msg.bonus_points.toLocaleString()} points added to your account
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
