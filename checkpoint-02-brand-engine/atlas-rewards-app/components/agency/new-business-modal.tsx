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

type Step = "basics" | "template";

export function NewBusinessModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("basics");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [templateValue, setTemplateValue] = useState<string>("other");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
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
            <h2 className="font-bold">{step === "basics" ? "Add new business" : "Pick a starting template"}</h2>
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

          {err && <p className="text-sm text-red-600 px-6 pb-3">{err}</p>}
        </div>

        <div className="p-5 border-t flex gap-2">
          {step === "basics" ? (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" onClick={() => setStep("template")} disabled={!name || !slug}>
                Next: pick template
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setStep("basics")}>Back</Button>
              <Button className="flex-1" onClick={create} disabled={submitting}>
                {submitting ? "Creating…" : `Create ${name}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
