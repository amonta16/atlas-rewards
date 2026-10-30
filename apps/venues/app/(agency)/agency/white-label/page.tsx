import { Palette, Info } from "lucide-react";

/**
 * Atlas brand settings.
 *
 * IMPORTANT — model clarification:
 *   Atlas is THE single agency (Andrew's). Sub-accounts under Atlas are
 *   local businesses (e.g. Joe's Gym, Acme Salon). This is NOT a multi-
 *   agency / reseller / "Patient App"-style platform.
 *
 *   So "White Label" here means: the master brand customers see briefly
 *   before they're routed into a sub-account's app — Atlas's own logo,
 *   support contact, footer credit, primary domain. It is NOT a tool for
 *   onboarding other agencies.
 */
export default function WhiteLabelPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Palette className="h-6 w-6 text-brand-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Atlas brand</h1>
      </div>
      <p className="text-muted-foreground">
        The master brand customers see before being routed into a business's app — your logo, support contact, footer credit, and primary domain.
      </p>

      <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 flex items-start gap-3 text-sm">
        <Info className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-sky-900">How the Atlas model works</div>
          <p className="text-sky-800 mt-1">
            Atlas is the single agency you run. Sub-accounts are the local businesses you build apps for. Customers never see another agency layer — they go straight from this brand into a business's app.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border bg-white p-10 text-center text-muted-foreground">
        Atlas-level branding fields land in Checkpoint 9 — logo, primary domain, support contact, footer credits. Until then, the customer app inherits each business's own brand directly.
      </div>
    </div>
  );
}
