"use client";
/**
 * SocialRewardsEditor — CP-134
 *
 * Instagram + Facebook "follow us" rewards, configured exactly like the
 * Google review reward: on/off, the link, points, title, description,
 * verification rules, and reward-specific fine print. Edits patch the
 * business in memory; the builder's Save writes social_config.
 */
import { Instagram, Facebook, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SOCIAL_PLATFORMS, SOCIAL_META, readSocialConfig, type SocialPlatform, type SocialRewardConfig } from "@/lib/social-config";
import type { Business } from "@/lib/types/database";

export function SocialRewardsEditor({
  business, onPatch,
}: {
  business: Business;
  onPatch: (p: Partial<Business>) => void;
}) {
  function set(platform: SocialPlatform, patch: Partial<SocialRewardConfig>) {
    const current = readSocialConfig(business, platform);
    const next = { ...(business.social_config ?? {}), [platform]: { ...current, ...patch } };
    onPatch({ social_config: next as Record<string, unknown> });
  }

  return (
    <div className="space-y-4">
      {SOCIAL_PLATFORMS.map((p) => {
        const cfg = readSocialConfig(business, p);
        const meta = SOCIAL_META[p];
        const Icon = p === "instagram" ? Instagram : Facebook;
        return (
          <div key={p} className={`rounded-2xl border p-4 ${cfg.enabled ? "bg-white" : "bg-zinc-50"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: `${meta.color}18`, color: meta.color }}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{meta.verb}</div>
                  <div className="text-[11px] text-muted-foreground">Customer follows → taps &ldquo;I followed&rdquo; → you verify at the desk → points land.</div>
                </div>
              </div>
              <Switch checked={cfg.enabled} onCheckedChange={(v) => set(p, { enabled: v })} />
            </div>

            {cfg.enabled && (
              <div className="mt-4 grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">{meta.label} page link (required)</Label>
                  <div className="flex gap-2">
                    <Input value={cfg.url ?? ""} onChange={e => set(p, { url: e.target.value || null })}
                      placeholder={p === "instagram" ? "https://instagram.com/yourshop" : "https://facebook.com/yourshop"} />
                    {cfg.url && (
                      <a href={cfg.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 rounded-md border text-zinc-500 hover:text-zinc-900" aria-label="Open">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  {!(cfg.url ?? "").trim() && <p className="text-[11px] text-amber-700">Customers won&apos;t see this reward until the link is set.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Handle shown to customers</Label>
                  <Input value={cfg.handle ?? ""} onChange={e => set(p, { handle: e.target.value || null })} placeholder="@yourshop" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Points</Label>
                  <Input type="number" min={1} value={cfg.points} onChange={e => set(p, { points: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Reward title</Label>
                  <Input value={cfg.title ?? ""} onChange={e => set(p, { title: e.target.value || null })} placeholder={meta.defaultTitle} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <textarea value={cfg.description ?? ""} onChange={e => set(p, { description: e.target.value || null })}
                    placeholder={meta.defaultDescription}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[64px]" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Redemption / verification rules</Label>
                  <textarea value={cfg.rules ?? ""} onChange={e => set(p, { rules: e.target.value || null })}
                    placeholder={meta.defaultRules}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[64px]" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Fine print (optional — falls back to your default reward terms)</Label>
                  <textarea value={cfg.fine_print ?? ""} onChange={e => set(p, { fine_print: e.target.value || null })}
                    placeholder={business.reward_fine_print ?? "e.g. One reward per customer. Must remain a follower at time of verification."}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[56px]" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
