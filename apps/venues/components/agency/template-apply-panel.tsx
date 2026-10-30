"use client";
import { useState } from "react";
import { Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INDUSTRY_TEMPLATES, type IndustryTemplate } from "@/lib/industry-templates";
import type { Business } from "@/lib/types/database";

/**
 * Lets the agency re-apply an industry template to an existing business.
 * Overwrites widget_config + point_rules; brand colors and copy are untouched.
 * Shows a confirmation modal because the action is destructive.
 */
export function TemplateApplyPanel({
  business,
  onApply,
}: {
  business: Business;
  onApply: (tpl: IndustryTemplate) => void;
}) {
  const [previewing, setPreviewing] = useState<IndustryTemplate | null>(null);
  const current = business.industry;

  return (
    <>
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold">Apply industry template</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Resets features and reward defaults to a sensible starting point for that industry. Won't touch your brand colors, logo, or copy.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {INDUSTRY_TEMPLATES.map(t => {
            const isCurrent = t.value === current;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setPreviewing(t)}
                className={cn(
                  "text-left rounded-xl border p-3 transition-colors relative",
                  isCurrent ? "border-violet-400 bg-violet-50/40" : "border-zinc-200 hover:border-zinc-400"
                )}
              >
                {isCurrent && (
                  <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider bg-violet-600 text-white px-1.5 py-0.5 rounded">
                    Current
                  </span>
                )}
                <div className="text-2xl">{t.emoji}</div>
                <div className="font-semibold text-sm mt-1">{t.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      {previewing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-5 flex items-center justify-between border-b">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{previewing.emoji}</div>
                <div>
                  <h2 className="font-bold">Apply "{previewing.label}"?</h2>
                  <p className="text-[11px] text-muted-foreground">{previewing.blurb}</p>
                </div>
              </div>
              <button onClick={() => setPreviewing(null)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                  Features it turns ON
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(previewing.widget_config)
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <span key={k} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                        {k.replace(/_/g, " ")}
                      </span>
                    ))}
                </div>
              </div>
              {previewing.default_booking_tags && previewing.default_booking_tags.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                    Seeds these booking tags
                  </div>
                  <ul className="text-xs space-y-1">
                    {previewing.default_booking_tags.map(t => (
                      <li key={t.name} className="flex items-center gap-2">
                        <Check className="h-3 w-3 text-emerald-600" />
                        {t.name} <span className="text-muted-foreground">· {t.duration_minutes}m</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                This overwrites the current feature toggles and reward-per-action defaults. Brand colors, logo, hero, rewards, offers, news, and members are untouched.
              </div>
            </div>
            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPreviewing(null)}>Cancel</Button>
              <Button className="flex-1" onClick={() => { onApply(previewing); setPreviewing(null); }}>
                <Sparkles className="h-4 w-4 mr-1" /> Apply template
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
