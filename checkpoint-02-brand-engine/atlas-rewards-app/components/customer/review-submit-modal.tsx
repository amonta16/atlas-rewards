"use client";
import { useState } from "react";
import { X, Star, ExternalLink, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Stage = "intro" | "submit" | "submitted";

export function ReviewSubmitModal({
  business, points, existingStatus, onClose,
}: {
  business: Business;
  points: number;
  existingStatus: "none" | "pending" | "verified" | "rejected";
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>(
    existingStatus === "pending" ? "submitted" : "intro"
  );
  const [reviewLink, setReviewLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openGoogle() {
    if (business.google_review_url) {
      window.open(business.google_review_url, "_blank", "noopener,noreferrer");
    }
  }

  async function submit() {
    setSubmitting(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("submit_review", {
      p_business_id: business.id,
      p_review_link: reviewLink || null,
      p_screenshot_url: null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setStage("submitted");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">Review on Google</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "intro" && (
          <>
            <div className="p-6">
              <div className="text-center">
                <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                  <Star className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold mt-3">Earn +{points} points</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Leave us a Google review. Staff will verify and award the points.
                </p>
              </div>

              {/* Steps */}
              <div className="mt-6 space-y-3">
                <Step n="1" title="Leave your review">
                  <Button
                    onClick={openGoogle}
                    className="w-full mt-2 text-white"
                    style={{ background: business.brand_colors.primary }}
                    disabled={!business.google_review_url}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Google Reviews
                  </Button>
                  {!business.google_review_url && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      The business hasn't set up their Google review link yet.
                    </p>
                  )}
                </Step>

                <Step n="2" title="Tell us when you're done">
                  <Button
                    onClick={() => setStage("submit")}
                    variant="outline"
                    className="w-full mt-2"
                  >
                    I left my review →
                  </Button>
                </Step>
              </div>
            </div>
          </>
        )}

        {stage === "submit" && (
          <>
            <div className="p-6">
              <h3 className="font-bold">Submit for verification</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Optional: paste the link to your review so staff can find it faster.
              </p>

              <div className="mt-4 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Link to your review (optional)</Label>
                <Input
                  value={reviewLink}
                  onChange={e => setReviewLink(e.target.value)}
                  placeholder="https://g.co/kgs/…"
                />
              </div>

              {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStage("intro")}>Back</Button>
              <Button
                onClick={submit}
                disabled={submitting}
                className="flex-1 text-white"
                style={{ background: business.brand_colors.primary }}
              >
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </>
        )}

        {stage === "submitted" && (
          <>
            <div className="p-6 text-center">
              <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center bg-amber-100 text-amber-700">
                <Clock className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold mt-3">Pending verification</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                Staff will check your review and award the points soon. You'll see a confetti burst when it's verified.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                <Star className="h-3 w-3" /> +{points} points pending
              </div>
            </div>
            <div className="p-5 border-t">
              <Button onClick={onClose} className="w-full text-white" style={{ background: business.brand_colors.primary }}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-zinc-50 p-4">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-white border flex items-center justify-center text-xs font-bold">
          {n}
        </div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}
