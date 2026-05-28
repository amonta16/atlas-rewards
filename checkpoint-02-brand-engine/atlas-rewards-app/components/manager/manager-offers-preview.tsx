"use client";
/**
 * ManagerOffersPreview — CP-35
 *
 * Phone-frame preview for the front-desk Offers tab. Mirrors what the
 * customer sees right now — sticky featured-offer banner up top, plus
 * the offer's hero card on the Home tab — and updates live as the
 * manager edits offers.
 *
 * Scope: read-only. The front-desk view ONLY exposes offers; they
 * can't edit anything else from this preview. The preview is just a
 * window into the customer's reality.
 *
 * Backed by:
 *   - public.featured_offer(p_business_id) RPC (same one the customer
 *     home page uses)
 *   - Realtime subscriptions on the offers table so the preview
 *     reflects the manager's last save instantly.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PhoneFrame } from "@/components/ui/phone-frame";
import { CustomerPreview, type PreviewOffer } from "@/components/customer-preview/customer-preview";
import { Smartphone } from "lucide-react";
import type { Business } from "@/lib/types/database";

type FeaturedRow = {
  title: string;
  description: string | null;
  image_url: string | null;
  expires_at: string | null;
};

export function ManagerOffersPreview({ business }: { business: Business }) {
  const [offer, setOffer] = useState<PreviewOffer | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.rpc("featured_offer", { p_business_id: business.id });
      const row = (Array.isArray(data) ? data[0] : data) as FeaturedRow | null;
      if (cancelled) return;
      if (!row) { setOffer(null); return; }
      const days = row.expires_at
        ? Math.max(0, Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 86_400_000))
        : undefined;
      setOffer({
        title: row.title,
        description: row.description,
        image_url: row.image_url,
        days_left: days,
      });
    };
    load();

    // Live-refresh on any offer change for this business.
    const ch = supabase
      .channel(`mgr-offers-preview-${business.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${business.id}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id]);

  return (
    <div className="hidden lg:block">
      <div className="sticky top-4">
        <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-widest font-bold text-zinc-500">
          <Smartphone className="h-3.5 w-3.5" />
          Customer preview · live
        </div>
        <PhoneFrame>
          <CustomerPreview
            business={business}
            activeTab="home"
            offer={offer}
          />
        </PhoneFrame>
        <p className="mt-3 text-[11px] text-zinc-500 text-center max-w-[320px] mx-auto leading-snug">
          Updates the moment you save. Edit your featured offer on the left and watch the banner change in real time.
        </p>
      </div>
    </div>
  );
}
