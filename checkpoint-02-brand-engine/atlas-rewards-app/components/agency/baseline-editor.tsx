"use client";
/**
 * BaselineEditor — CP-50
 *
 * Editable "Pre-Atlas baseline" card on the business Settings tab. These
 * are the operator's last-year numbers that Insights compares against, so
 * the manager (and you) can see exactly how much Atlas moved the needle.
 *
 * Captured at onboarding (New Business modal), but fully editable here —
 * and because Insights reads these via atlas_impact_rollup, any edit you
 * make instantly changes the "with vs without Atlas" comparison on BOTH
 * the agency Insights tab and the manager's Insights dashboard.
 */
import { useEffect, useState } from "react";
import { History, Check, Star, Save, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type BaselineRow = {
  baseline_google_review_count: number | null;
  baseline_google_rating: number | null;
  baseline_monthly_revenue_cents: number | null;
  baseline_monthly_visits: number | null;
  baseline_avg_ticket_cents: number | null;
  baseline_captured_at: string | null;
};

export function BaselineEditor({ businessId }: { businessId: string }) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState("");
  const [rating, setRating] = useState("");
  const [revenue, setRevenue] = useState("");
  const [visits, setVisits] = useState("");
  const [ticket, setTicket] = useState("");
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("baseline_google_review_count, baseline_google_rating, baseline_monthly_revenue_cents, baseline_monthly_visits, baseline_avg_ticket_cents, baseline_captured_at")
        .eq("id", businessId)
        .maybeSingle();
      const r = data as BaselineRow | null;
      if (r) {
        setReviews(r.baseline_google_review_count?.toString() ?? "");
        setRating(r.baseline_google_rating?.toString() ?? "");
        setRevenue(r.baseline_monthly_revenue_cents != null ? (r.baseline_monthly_revenue_cents / 100).toString() : "");
        setVisits(r.baseline_monthly_visits?.toString() ?? "");
        setTicket(r.baseline_avg_ticket_cents != null ? (r.baseline_avg_ticket_cents / 100).toString() : "");
        setCapturedAt(r.baseline_captured_at);
      }
      setLoading(false);
    })();
  }, [businessId]);

  async function save() {
    setSaving(true); setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.rpc("save_business_baseline", {
      p_business_id: businessId,
      p_google_review_count: reviews ? parseInt(reviews, 10) : null,
      p_google_rating: rating ? parseFloat(rating) : null,
      p_monthly_revenue_cents: revenue ? Math.round(parseFloat(revenue) * 100) : null,
      p_monthly_visits: visits ? parseInt(visits, 10) : null,
      p_avg_ticket_cents: ticket ? Math.round(parseFloat(ticket) * 100) : null,
    });
    setSaving(false);
    if (error) { toast.error("Save failed — " + error.message); return; }
    setSaved(true);
    setCapturedAt(new Date().toISOString());
    setTimeout(() => setSaved(false), 1800);
    toast.success("Baseline updated — Insights now compares against these numbers");
  }

  return (
    <div className="rounded-2xl border bg-white p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
          <History className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Pre-Atlas baseline</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Their last-year numbers — what Insights compares against so the operator sees exactly how much Atlas moved the needle.
          </p>
        </div>
        {capturedAt && (
          <span className="text-[11px] text-muted-foreground shrink-0 mt-1">
            Updated {new Date(capturedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-3 mb-4 flex items-start gap-2 text-[11px] text-indigo-900">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Quick estimates are fine — they only need to be in the right ballpark. Edits take effect immediately:
          the manager's Insights and your Insights tab both recompute the "with vs without Atlas" comparison from these.
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Google reviews (count)">
          <Input type="number" min={0} value={reviews} onChange={e => setReviews(e.target.value)} placeholder="120" disabled={loading} />
        </Field>
        <Field label="Google rating (★)">
          <div className="relative">
            <Star className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400 fill-amber-400" />
            <Input type="number" min={0} max={5} step="0.1" value={rating} onChange={e => setRating(e.target.value)} placeholder="4.2" className="pl-8" disabled={loading} />
          </div>
        </Field>
        <Field label="Monthly revenue ($)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
            <Input type="number" min={0} value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="40000" className="pl-7" disabled={loading} />
          </div>
        </Field>
        <Field label="Monthly visits (estimate)">
          <Input type="number" min={0} value={visits} onChange={e => setVisits(e.target.value)} placeholder="1600" disabled={loading} />
        </Field>
        <Field label="Avg spend per visit ($)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
            <Input type="number" min={0} step="0.5" value={ticket} onChange={e => setTicket(e.target.value)} placeholder="25" className="pl-7" disabled={loading} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Used as the real per-visit value in the revenue comparison instead of a flat estimate.
          </p>
        </Field>
      </div>

      <div className="mt-5 flex items-center justify-end">
        <Button onClick={save} disabled={saving || loading} className="bg-brand-primary text-white">
          {saving ? "Saving…" : saved ? <><Check className="h-4 w-4 mr-1" /> Saved</> : <><Save className="h-4 w-4 mr-1" /> Save baseline</>}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
