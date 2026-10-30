"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Building2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { templateByValue } from "@/lib/industry-templates";
// CP-131.1: the layout is the starting point (the industry-template grid is retired).
import { LAYOUT_PRESETS, LAYOUT_PRESET_IDS, type LayoutPreset } from "@/lib/layout-presets";

/** Hidden industry template behind each layout — supplies widget_config +
 *  point_rules defaults exactly as the old template grid did. */
const LAYOUT_TEMPLATE: Record<LayoutPreset, string> = {
  custom: "other", smoke: "retail", food: "coffee", medspa: "medspa", entertainment: "arcade",
};
/** businesses.industry written for each layout (drives image library + folders). */
const LAYOUT_INDUSTRY: Record<LayoutPreset, string | null> = {
  custom: null, smoke: "smoke-shop", food: "restaurant", medspa: "medspa", entertainment: "arcade",
};
const LAYOUT_EMOJI: Record<LayoutPreset, string> = {
  custom: "✨", smoke: "💨", food: "🍕", medspa: "💆", entertainment: "🎳",
};

// CP-42: third step captures the business's PRE-Atlas baseline numbers
// so the Insights "With Atlas vs Without" comparison uses their real
// data instead of an estimate. Required — every new business gets a
// snapshot before going live.
type Step = "basics" | "template" | "baseline";

export function NewBusinessModal({ onClose, initialName }: { onClose: () => void; initialName?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("basics");
  const [name, setName] = useState(initialName ?? "");
  const [slug, setSlug] = useState(initialName
    ? initialName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    : "");
  // CP-131.1: the layout is the only choice now; the matching industry
  // template (features + reward defaults) is derived from it below.
  // CP-68: demo apps skip the check-in + reward-game cooldowns so the owner
  // can replay the reward moment during a pitch. Defaults ON — most new
  // apps here are pitch demos; flip it off in the brand editor when a deal
  // closes and the app goes live for real customers.
  const [isDemo, setIsDemo] = useState(true);
  // CP-131.1: the layout chosen on step 2 (null = Classic).
  const [layoutOverride, setLayoutOverride] = useState<LayoutPreset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // CP-42 baseline fields
  const [baselineReviewCount, setBaselineReviewCount] = useState<string>("");
  const [baselineRating,      setBaselineRating]      = useState<string>("");
  const [baselineRevenue,     setBaselineRevenue]     = useState<string>("");
  const [baselineVisits,      setBaselineVisits]      = useState<string>("");
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const layoutPreset: LayoutPreset = layoutOverride ?? "custom";
  // Each layout carries a hidden industry template so widget_config +
  // point_rules still get sensible defaults (the old grid did this by hand).
  const tpl = templateByValue(LAYOUT_TEMPLATE[layoutPreset]);
  const industrySlug = LAYOUT_INDUSTRY[layoutPreset];

  function autoSlug(raw: string) {
    return raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function onNameChange(v: string) {
    setName(v);
    if (!slug || slug === autoSlug(name)) setSlug(autoSlug(v));
  }

  async function create() {
    setSubmitting(true); setErr(null);
    const supabase = createClient();
    const payload = tpl ? {
      p_name: name,
      p_slug: slug,
      p_industry: industrySlug,
      p_widget_config: tpl.widget_config as any,
      p_point_rules:   tpl.point_rules   as any,
    } : { p_name: name, p_slug: slug, p_industry: industrySlug };

    const { data, error } = await supabase.rpc("create_business", payload);
    if (error) { setSubmitting(false); setErr(error.message); return; }

    // CP-42: persist the baseline snapshot before routing into the
    // brand editor. Silent fallback if the cp42 RPC isn't installed.
    const newBusinessId = data as string;
    if (newBusinessId) {
      // CP-68: mark demo apps (silent fallback if cp68 SQL isn't applied yet).
      try {
        await supabase.from("businesses").update({ is_demo: isDemo, layout_preset: layoutPreset }).eq("id", newBusinessId);
      } catch { /* non-fatal */ }
      const revenueCents = baselineRevenue
        ? Math.round(parseFloat(baselineRevenue) * 100)
        : null;
      try {
        await supabase.rpc("save_business_baseline", {
          p_business_id: newBusinessId,
          p_google_review_count: baselineReviewCount ? parseInt(baselineReviewCount, 10) : null,
          p_google_rating:       baselineRating ? parseFloat(baselineRating) : null,
          p_monthly_revenue_cents: revenueCents,
          p_monthly_visits:      baselineVisits ? parseInt(baselineVisits, 10) : null,
        });
      } catch {
        // Non-fatal — the business is created, agency can re-enter the
        // baseline from settings later.
      }
    }

    setSubmitting(false);
    router.push(`/agency/businesses/${data}`);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Building2 className="h-4 w-4" />
            </div>
            <h2 className="font-bold">
              {step === "basics" ? "Add new business"
                : step === "template" ? "Pick a layout"
                : "Pre-Atlas baseline"}
            </h2>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === "basics" && (
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Business name</Label>
                <Input value={name} onChange={e => onNameChange(e.target.value)} placeholder="Joe's Gym" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">URL slug</Label>
                <Input value={slug} onChange={e => setSlug(autoSlug(e.target.value))} placeholder="joes-gym" />
                <p className="text-[11px] text-muted-foreground">
                  Customers will visit <code className="bg-muted px-1 rounded">{slug || "joes-gym"}.{rootDomain}{rootDomain.includes("lvh.me") ? ":3000" : ""}</code>
                </p>
              </div>

              {/* CP-68: demo flag — replayable check-in reward for pitches. */}
              <button
                type="button"
                onClick={() => setIsDemo(v => !v)}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-3 transition flex items-start gap-3",
                  isDemo ? "border-indigo-400 bg-indigo-50/60" : "border-zinc-200 hover:border-zinc-300",
                )}
              >
                <span className={cn(
                  "h-5 w-5 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                  isDemo ? "bg-indigo-600 text-white" : "bg-zinc-200",
                )}>
                  {isDemo && <Check className="h-3.5 w-3.5" />}
                </span>
                <span>
                  <span className="text-sm font-semibold block">Demo app (for pitching)</span>
                  <span className="text-[11px] text-muted-foreground leading-snug block mt-0.5">
                    The check-in reward game becomes replayable — no check-in or daily
                    cooldown — so you can show the owner the reward moment as many times
                    as you like. Turn it off in the brand editor when the deal closes.
                  </span>
                </span>
              </button>
            </div>
          )}

          {step === "template" && (
            <div className="p-5 space-y-3">
              {/* CP-131.1: the industry template grid is gone — the layout IS
                  the starting point now. Features and reward defaults come
                  from the layout's matching template under the hood. */}
              <p className="text-sm text-muted-foreground">
                Pick the layout for this business — which tabs the app has and what the home screen leads with. Everything is adjustable later in the builder.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {LAYOUT_PRESET_IDS.map((id) => {
                  const p = LAYOUT_PRESETS[id];
                  const active = layoutPreset === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setLayoutOverride(id)}
                      className={cn(
                        "text-left rounded-xl border p-3 transition-colors relative",
                        active ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
                      )}
                    >
                      {active && (
                        <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-zinc-900 text-white flex items-center justify-center">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <div className="text-2xl">{LAYOUT_EMOJI[id]}</div>
                      <div className="font-semibold text-sm mt-1">{p.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{p.blurb}</div>
                      <div className="text-[10px] text-zinc-400 mt-1 leading-snug">{p.fits}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.tabs.map((t) => (
                          <span key={t.id} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white border text-zinc-600">
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}


          {step === "baseline" && (
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-900">
                <b>Snapshot their last year</b> — these are the numbers we'll compare against in Insights so the operator sees exactly how much Atlas moved the needle. <span className="italic">Required.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Google reviews (count)</Label>
                  <Input
                    type="number" min={0}
                    value={baselineReviewCount}
                    onChange={e => setBaselineReviewCount(e.target.value)}
                    placeholder="e.g. 47"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Google rating (★)</Label>
                  <Input
                    type="number" step="0.1" min={1} max={5}
                    value={baselineRating}
                    onChange={e => setBaselineRating(e.target.value)}
                    placeholder="e.g. 4.2"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Monthly revenue ($)</Label>
                  <Input
                    type="number" min={0} step="100"
                    value={baselineRevenue}
                    onChange={e => setBaselineRevenue(e.target.value)}
                    placeholder="e.g. 18000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Monthly visits (estimate)</Label>
                  <Input
                    type="number" min={0}
                    value={baselineVisits}
                    onChange={e => setBaselineVisits(e.target.value)}
                    placeholder="e.g. 320"
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground italic">
                Quick estimates are fine — they only need to be in the right ballpark. You can refine these later from the business's Settings tab.
              </p>
            </div>
          )}

          {err && <p className="text-sm text-red-600 px-6 pb-3">{err}</p>}
        </div>

        <div className="p-5 border-t flex gap-2">
          {step === "basics" && (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => setStep("template")} disabled={!name || !slug}>
                Next: pick template
              </Button>
            </>
          )}
          {step === "template" && (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setStep("basics")}>Back</Button>
              <Button className="flex-1" onClick={() => setStep("baseline")}>
                Next: baseline
              </Button>
            </>
          )}
          {step === "baseline" && (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setStep("template")}>Back</Button>
              <Button
                className="flex-1"
                onClick={create}
                disabled={
                  submitting ||
                  !baselineReviewCount ||
                  !baselineRating ||
                  !baselineRevenue ||
                  !baselineVisits
                }
              >
                {submitting ? "Creating…" : `Create ${name}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
