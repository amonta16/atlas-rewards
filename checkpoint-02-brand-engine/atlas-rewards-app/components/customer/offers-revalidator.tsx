"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Mounts inside server-rendered customer pages (Home tab) and calls
 * router.refresh() whenever the agency edits the offers table for this
 * business. Solves the "I featured a new offer and the customer's banner
 * still shows the old one" stale-render bug — without making the whole
 * Home tab a client component.
 */
export function OffersRevalidator({ businessId }: { businessId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`offers-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [businessId, router]);
  return null;
}
