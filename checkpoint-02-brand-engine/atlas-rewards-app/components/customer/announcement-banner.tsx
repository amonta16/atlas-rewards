"use client";
/**
 * AnnouncementBanner — CP-86
 *
 * Customer-side banner for the business's one live announcement
 * ("Tuesday we're closing early"). Renders on every tab (mounted in the
 * app layout, under the featured-offer banner), realtime-subscribed so a
 * manager posting/clearing shows up without a refresh.
 *
 * Dismissal is per-device (localStorage, keyed by the announcement's
 * updated_at) — a REPLACED announcement re-appears even if the old one
 * was dismissed, an expired one self-hides.
 */
import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createJitteredHandler } from "@/lib/realtime-jitter";

type Announcement = {
  business_id: string;
  message: string;
  expires_at: string | null;
  updated_at: string;
};

function dismissKey(businessId: string) {
  return `atlas-announcement-dismissed-${businessId}`;
}

export function AnnouncementBanner({
  businessId, primary, secondary,
}: { businessId: string; primary: string; secondary?: string | null }) {
  const [ann, setAnn] = useState<Announcement | null>(null);
  const [dismissedStamp, setDismissedStamp] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissedStamp(window.localStorage.getItem(dismissKey(businessId)));
    } catch { /* private mode etc. — banner just shows */ }

    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("business_announcements")
        .select("business_id, message, expires_at, updated_at")
        .eq("business_id", businessId)
        .maybeSingle();
      if (cancelled) return;
      setAnn((data ?? null) as Announcement | null);
    };

    load();
    // CP-88: `announcement-${businessId}` is a per-BUSINESS topic — a manager
    // posting one announcement notifies every connected customer in the same
    // instant. Jitter the re-query so they ramp instead of spiking; coalescing
    // also means a manager editing the text a few times in a row costs one
    // fetch per customer, not one per keystroke-save.
    const { handler: onAnnouncementChange, cancel: cancelJitter } =
      createJitteredHandler(load, { maxDelayMs: 5000, minGapMs: 2000 });
    const ch = supabase
      .channel(`announcement-${businessId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "business_announcements", filter: `business_id=eq.${businessId}` },
        onAnnouncementChange)
      .subscribe();
    return () => { cancelled = true; cancelJitter(); supabase.removeChannel(ch); };
  }, [businessId]);

  if (!ann) return null;
  if (ann.expires_at && new Date(ann.expires_at) < new Date()) return null;
  if (dismissedStamp === ann.updated_at) return null;

  function dismiss() {
    if (!ann) return;
    try { window.localStorage.setItem(dismissKey(businessId), ann.updated_at); } catch { /* ignore */ }
    setDismissedStamp(ann.updated_at);
  }

  return (
    <div className="px-4 pt-3">
      <div
        className="relative rounded-2xl px-4 py-3 text-white overflow-hidden shadow-md flex items-start gap-3"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary ?? primary} 100%)`,
        }}
      >
        <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
          <Megaphone className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <div className="text-[10px] uppercase tracking-widest font-black opacity-85">Announcement</div>
          <div className="text-sm font-bold leading-snug mt-0.5">{ann.message}</div>
        </div>
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
          aria-label="Dismiss announcement"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
