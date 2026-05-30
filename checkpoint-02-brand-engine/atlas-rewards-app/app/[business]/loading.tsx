import { BrandedLoading } from "@/components/ui/branded-loading";

/**
 * Customer-app route boundary loading. CP-41 — friends gave feedback
 * that taps felt unresponsive; this surfaces the loading moment.
 * CP-42: BrandedLoading picks up the per-business brand color from
 * localStorage (cached by the layout) so repeat visitors see THEIR
 * business's color instead of generic Atlas blue.
 */
export default function BusinessLoading() {
  return <BrandedLoading title="One sec…" />;
}
