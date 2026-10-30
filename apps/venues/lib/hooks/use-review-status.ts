"use client";
/**
 * useReviewStatus — CP-32
 *
 * Returns the current customer's Google review status for a given business
 * (and the matching badge tone for the Rewards tab nudge):
 *
 *   "none"     → red    "!"  — they haven't submitted a review yet
 *   "rejected" → red    "!"  — last submission was rejected, try again
 *   "pending"  → orange "!"  — submitted, staff verifying it
 *   "verified" → none        — done, no nudge
 *
 * Live-updates over Supabase Realtime so the badge disappears the moment
 * staff approve the review.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ReviewStatus = "none" | "pending" | "verified" | "rejected";
export type ReviewBadgeTone = false | "red" | "orange";

export function reviewBadgeTone(status: ReviewStatus): ReviewBadgeTone {
  if (status === "pending") return "orange";
  if (status === "verified") return false;
  return "red";
}

export function useReviewStatus(businessId: string | null, membershipId: string | null): ReviewStatus {
  const [status, setStatus] = useState<ReviewStatus>("none");

  useEffect(() => {
    if (!businessId || !membershipId) return;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.rpc("my_review_status", { p_business_id: businessId });
      setStatus(((data?.[0]?.status as ReviewStatus) ?? "none"));
    };
    load();
    const ch = supabase
      .channel(`review-status-${membershipId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews", filter: `membership_id=eq.${membershipId}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [businessId, membershipId]);

  return status;
}
