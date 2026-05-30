"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Building2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { INDUSTRY_TEMPLATES, templateByValue } from "@/lib/industry-templates";

// CP-42: third step captures the business's PRE-Atlas baseline numbers
// so the Insights "With Atlas vs Without" comparison uses their real
// data instead of an estimate. Required — every new business gets a
// snapshot before going live.
type Step = "basics" | "template" | "baseline";

export function NewBusinessModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("basics");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [templateValue, setTemplateValue] = useState<string>("other");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // CP-42 baseline fields
  const [baselineReviewCount, setBaselineReviewCount] = useState<string>("");
  const [baselineRating,      setBaselineRating]      = useState<string>("");
  const [baselineRevenue,     setBaselineRevenue]     = useState<string>("");
  const [baselineVisits,      setBaselineVisits]      = useState<string>("");
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
  const tpl = templateByValue(templateValue);

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
      p_industry: tpl.value === "other" ? null : tpl.value,
      p_widget_config: tpl.widget_config as any,
      p_point_rules:   tpl.point_rules   as any,
    } : { p_name: name, p_slug: slug, p_industry: null };

    const { data, error } = await supabase.rpc("create_business", payload);
    if (error) { setSubmitting(false); setErr(error.message); return; }

    // CP-42: persist the baseline snapshot before routing into the
    // brand editor. Silent fallback if the cp42 RPC isn't installed.
    const newBusinessId = data as string;
    if (newBusinessId) {
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
                : step === "template" ? "Pick a starting template"
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
            </div>
          )}

          {step === "template" && (
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick the closest match — we'll preset the right features and reward defaults. You can change everything later.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {INDUSTRY_TEMPLATES.map(t => {
                  const active = templateValue === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTemplateValue(t.value)}
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
                      <div className="text-2xl">{t.emoji}</div>
                      <div className="font-semibold text-sm mt-1">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.blurb}</div>
                    </button>
                  );
                })}
              </div>
              {tpl && (
                <div className="rounded-xl border bg-zinc-50 p-3 mt-2">
                  <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
                    Features turned on by this template
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(tpl.widget_config)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border text-zinc-700">
                          {k.replace(/_/g, " ")}
                        </span>
                      ))}
                  </div>
                </div>
              )}
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
