"use client";
/**
 * SocialFollowModal — CP-134
 *
 * "Follow us on Instagram / Facebook" reward. Same three-stage shape as the
 * Google Review modal (intro → submit → pending) so customers who've done
 * one know the other. The business's rules and fine print sit above the
 * button, and staff verify in the same queue reviews use.
 */
import { useState } from "react";
import { X, ExternalLink, Clock, Instagram, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { FinePrint } from "@/components/customer/fine-print";
import { SOCIAL_META, readSocialConfig, type SocialPlatform } from "@/lib/social-config";
import type { Business } from "@/lib/types/database";

type Stage = "intro" | "submit" | "submitted";

export function SocialFollowModal({
  business, platform, existingStatus, onClose,
}: {
  business: Business;
  platform: SocialPlatform;
  existingStatus: "none" | "pending" | "verified" | "rejected";
  onClose: () => void;
}) {
  const cfg = readSocialConfig(business, platform);
  const meta = SOCIAL_META[platform];
  const Icon = platform === "instagram" ? Instagram : Facebook;
  const [stage, setStage] = useState<Stage>(existingStatus === "pending" ? "submitted" : "intro");
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const primary = business.brand_colors.primary;

  function openProfile() {
    if (cfg.url) window.open(cfg.url, "_blank", "noopener,noreferrer");
  }

  async function submit() {
    setSubmitting(true); setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("submit_social_follow", {
      p_business_id: business.id,
      p_platform: platform,
      p_handle: handle.trim() || null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setStage("submitted");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">{cfg.title || meta.defaultTitle}</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "intro" && (
          <>
            <div className="p-6 overflow-y-auto">
              <div className="text-center">
                <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: `${meta.color}18`, color: meta.color }}>
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold mt-3">Earn +{cfg.points} points</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {cfg.description || meta.defaultDescription}
                </p>
                {cfg.handle && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-zinc-100 text-zinc-700">
                    <Icon className="h-3.5 w-3.5" /> {cfg.handle}
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-3">
                <Step n="1" title={`Open our ${meta.label}`}>
                  <Button onClick={openProfile} className="w-full mt-2 text-white" style={{ background: primary }} disabled={!cfg.url}>
                    <ExternalLink className="h-4 w-4 mr-2" /> Open {meta.label}
                  </Button>
                </Step>
                <Step n="2" title="Tell us when you've followed">
                  <Button onClick={() => setStage("submit")} variant="outline" className="w-full mt-2">
                    I followed →
                  </Button>
                </Step>
              </div>

              {(cfg.rules || meta.defaultRules) && (
                <p className="mt-4 text-[12px] text-zinc-600 leading-snug">
                  <span className="font-bold text-zinc-800">How it works: </span>{cfg.rules || meta.defaultRules}
                </p>
              )}
              <FinePrint
                terms={cfg.fine_print}
                businessDefault={business.reward_fine_print}
                primary={primary}
                compact
                className="mt-3"
              />
            </div>
          </>
        )}

        {stage === "submit" && (
          <>
            <div className="p-6">
              <h3 className="font-bold">Submit for verification</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your {meta.label} username helps staff find your follow faster.
              </p>
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Your {meta.label} username (optional)</Label>
                <Input value={handle} onChange={e => setHandle(e.target.value)} placeholder="@yourname" autoCapitalize="none" />
              </div>
              {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStage("intro")}>Back</Button>
              <Button onClick={submit} disabled={submitting} className="flex-1 text-white" style={{ background: primary }}>
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
                Staff will confirm your follow and add the points. You&apos;ll see a confetti burst when it&apos;s verified.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: `${primary}15`, color: primary }}>
                <Icon className="h-3 w-3" /> +{cfg.points} points pending
              </div>
            </div>
            <div className="p-5 border-t">
              <Button onClick={onClose} className="w-full text-white" style={{ background: primary }}>Done</Button>
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
        <div className="h-6 w-6 rounded-full bg-white border flex items-center justify-center text-xs font-bold">{n}</div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}
